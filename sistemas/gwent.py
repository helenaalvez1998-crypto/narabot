"""Motor estratégico Gwent do SoulsBot: regras puras, sem dependência do Discord."""
from __future__ import annotations
from copy import deepcopy

ROWS = ("melee", "ranged", "siege")
ROW_LABELS = {"melee": "Corpo a corpo", "ranged": "Longa distância", "siege": "Cerco"}
TYPE_ROW = {"Força": "melee", "Destreza": "ranged", "Magia": "siege"}
FACTIONS = {"Força": "Ordem de Ferro", "Destreza": "Errantes do Véu", "Magia": "Conclave Arcano"}
FACTION_TYPES = {value: key for key, value in FACTIONS.items()}
LEADERS = {
    "comandante_fornalha": {"name": "Comandante da Fornalha", "faction": "Ordem de Ferro", "description": "+2 às suas unidades de corpo a corpo.", "effect": "iron_command"},
    "bastiao_ancestral": {"name": "Bastião Ancestral", "faction": "Ordem de Ferro", "description": "+1 às unidades de corpo a corpo e resistência climática +1.", "effect": "iron_bastion"},
    "mestre_veu": {"name": "Mestre do Véu", "faction": "Errantes do Véu", "description": "+2 às suas unidades de longa distância.", "effect": "veil_master"},
    "sombra_caminhante": {"name": "Sombra Caminhante", "faction": "Errantes do Véu", "description": "+1 às unidades de longa distância; com 2 ou mais, concede +1 adicional.", "effect": "veil_shadow"},
    "arquimaga_eclipse": {"name": "Arquimaga do Eclipse", "faction": "Conclave Arcano", "description": "Dissipa o clima e concede +1 ao cerco.", "effect": "arcane_archmage"},
    "oraculo_tempestade": {"name": "Oráculo da Tempestade", "faction": "Conclave Arcano", "description": "Dissipa o clima e concede +2 ao cerco se havia clima ativo; caso contrário, +1.", "effect": "arcane_oracle"},
}
DEFAULT_LEADERS = {
    "Ordem de Ferro": "comandante_fornalha",
    "Errantes do Véu": "mestre_veu",
    "Conclave Arcano": "arquimaga_eclipse",
}


def preparar_carta(card: dict) -> dict:
    special = str(card.get("categoria", "")).casefold() == "especial"
    skill = str(card.get("habilidade", ""))
    try:
        from sistemas.cartas import HABILIDADES
        skill_data = HABILIDADES.get(skill, {})
    except Exception:
        skill_data = {}
    row = str(card.get("fileira") or TYPE_ROW.get(str(card.get("tipo", "")), "melee"))
    if row not in ROWS:
        row = TYPE_ROW.get(str(card.get("tipo", "")), "melee")
    kind = str(card.get("tipo", "Força"))
    faction = str(card.get("faccao") or FACTIONS.get(kind, "Ordem de Ferro"))
    category = "Especial" if special else "Unidade"
    return {
        "id": str(card["id"]), "nome": str(card.get("nome", "Carta")),
        "categoria": category,
        "papel_gwent": str(card.get("papel_gwent", "Tática" if special else ROW_LABELS[row])),
        "especial": special,
        "poder": 0 if special else max(1, min(15, int(card.get("poder", 1)))),
        "raridade": str(card.get("raridade", "Comum")), "tipo": kind,
        "faccao": faction, "fileira": row,
        "row": row, "row_label": ROW_LABELS[row], "habilidade": skill,
        "habilidade_nome": str(card.get("habilidade_nome", skill_data.get("nome", skill.replace("_", " ").title()))),
        "habilidade_texto": str(card.get("habilidade_texto", skill_data.get("texto", card.get("descricao", ""))))[:180],
        "descricao": str(card.get("descricao", ""))[:240],
        "image_url": f"/api/gwent/cards/{card['id']}/image",
    }


def _faction(cards):
    counts = {kind: 0 for kind in FACTIONS}
    for card in cards:
        if not card.get("especial"):
            kind = str(card.get("tipo", "Força"))
            if kind in counts:
                counts[kind] += 1
    return FACTIONS[max(counts, key=lambda k: (counts[k], k))]


def novo_estado(match_id: int, creator_id: int, opponent_id: int, decks: dict[str, list[dict]], deck_configs: dict[str, dict] | None = None) -> dict:
    players = {}
    deck_configs = deck_configs or {}
    for uid in (str(creator_id), str(opponent_id)):
        deck = deepcopy(decks[uid])
        config = deck_configs.get(uid, {})
        faction = config.get("faction") if config.get("faction") in FACTION_TYPES else _faction(deck)
        leader_id = config.get("leader_id") or DEFAULT_LEADERS[faction]
        if leader_id not in LEADERS or LEADERS[leader_id]["faction"] != faction:
            leader_id = DEFAULT_LEADERS[faction]
        players[uid] = {
            "hand": deck[:10], "draw_pile": deck[10:], "discard": [], "board": [],
            "passed": False, "leader_used": False, "weather_used": False,
            "faction": faction, "leader_id": leader_id, "leader_name": LEADERS[leader_id]["name"], "faction_boost_used": False,
            "mulligan_done": False, "last_row": None,
        }
    return {
        "match_id": int(match_id), "status": "active", "phase": "mulligan", "round": 1,
        "players": players, "turn": str(creator_id),
        "weather": {row: 0 for row in ROWS},
        "crowns": {str(creator_id): 0, str(opponent_id): 0},
        "rounds": [], "winner_id": None,
        "last_event": "Preparação: cada jogador pode trocar até duas cartas.",
    }


def pontuacao(player: dict, weather: dict | None = None) -> int:
    weather = weather or {}
    return sum(max(1, int(c["poder"]) + int(c.get("bonus", 0)) -
                   max(0, int(weather.get(c["row"], 0) or 0) - int(c.get("weather_resist", 0))))
               for c in player["board"])


def placar(state: dict) -> dict:
    return {uid: {
        "score": pontuacao(player, state.get("weather")),
        "passed": player["passed"], "hand": len(player["hand"]),
        "crowns": state["crowns"][uid], "board": deepcopy(player["board"]),
        "faction": player.get("faction", ""),
    } for uid, player in state["players"].items()}


def _resolve_round(state: dict) -> None:
    ids = list(state["players"])
    a, b = ids
    sa = pontuacao(state["players"][a], state.get("weather"))
    sb = pontuacao(state["players"][b], state.get("weather"))
    winner = a if sa > sb else b if sb > sa else None
    if winner:
        state["crowns"][winner] += 1
        state["last_event"] = f"Rodada {state['round']} vencida por {winner} ({sa} × {sb})."
    else:
        state["last_event"] = f"Rodada {state['round']} empatada ({sa} × {sb})."
    state["rounds"].append({"round": state["round"], "score_a": sa, "score_b": sb, "winner_id": winner})
    if max(state["crowns"].values()) >= 2 or state["round"] >= 3:
        ca, cb = state["crowns"][a], state["crowns"][b]
        state["status"] = "finished"
        state["phase"] = "finished"
        state["winner_id"] = a if ca > cb else b if cb > ca else None
        state["last_event"] += " Partida encerrada."
        return
    state["round"] += 1
    state["weather"] = {row: 0 for row in ROWS}
    for player in state["players"].values():
        # Unidades sobrevivem à rodada no descarte: isso habilita recuperação
        # por Médico de Campanha e mantém o histórico completo da partida.
        player.setdefault("discard", []).extend(deepcopy(player.get("board", [])))
        player["board"] = []
        player["passed"] = False
        player["faction_boost_used"] = False
        player["last_row"] = None
    state["turn"] = winner or (b if state["turn"] == a else a)
    state["last_event"] += " Nova rodada: as cartas restantes continuam na mão."


def aplicar_jogada(state: dict, user_id: int, card_id: str | None = None,
                    action: str = "play", row: str | None = None,
                    card_ids: list[str] | None = None) -> dict:
    state = deepcopy(state)
    # Compatibilidade com partidas iniciadas na versão anterior do motor.
    state.setdefault("phase", "battle")
    state.setdefault("weather", {row: 0 for row in ROWS})
    for legacy_player in state.get("players", {}).values():
        legacy_player.setdefault("discard", [])
        legacy_player.setdefault("draw_pile", [])
        legacy_player.setdefault("faction", _faction(legacy_player.get("hand", [])))
        legacy_player.setdefault("faction_boost_used", False)
        legacy_player.setdefault("mulligan_done", True)
        legacy_player.setdefault("leader_used", False)
        legacy_player.setdefault("weather_used", False)
        legacy_player.setdefault("last_row", None)
    uid = str(user_id)
    if state["status"] != "active":
        return {"error": "A partida já terminou."}
    if uid not in state["players"]:
        return {"error": "Você não participa desta partida."}
    player = state["players"][uid]

    # Rendição pode ser declarada mesmo fora do turno; todas as outras ações
    # continuam protegidas pela validação de turno abaixo.
    if action == "surrender":
        opponent_id = next(x for x in state["players"] if x != uid)
        state["status"] = "finished"
        state["phase"] = "finished"
        state["winner_id"] = opponent_id
        state["surrendered_by"] = uid
        state["last_event"] = f"Jogador {uid} se rendeu. Vitória de {opponent_id}."
        return {"state": state}

    if state["turn"] != uid:
        return {"error": "Aguarde a jogada do adversário."}

    if state.get("phase") == "mulligan":
        if player["mulligan_done"]:
            return {"error": "Você já concluiu sua preparação."}
        if action not in {"mulligan", "keep"}:
            return {"error": "Escolha trocar até duas cartas ou manter sua mão."}
        if action == "mulligan":
            chosen = [str(x) for x in (card_ids or [])]
            if len(chosen) > 2 or len(set(chosen)) != len(chosen):
                return {"error": "Você pode trocar no máximo duas cartas diferentes."}
            for cid in chosen:
                old = next((c for c in player["hand"] if c["id"] == cid), None)
                if old is None:
                    return {"error": "Carta selecionada não está na sua mão."}
                player["hand"].remove(old)
                player["discard"].append(old)
                if player["draw_pile"]:
                    player["hand"].append(player["draw_pile"].pop(0))
        player["mulligan_done"] = True
        other = next(x for x in state["players"] if x != uid)
        if state["players"][other]["mulligan_done"]:
            state["phase"] = "battle"
            state["turn"] = list(state["players"])[0]
            state["last_event"] = "Preparação concluída. A batalha começou."
        else:
            state["turn"] = other
            state["last_event"] = "Preparação concluída por um jogador. Aguardando o adversário."
        return {"state": state}

    if player["passed"]:
        return {"error": "Você já passou nesta rodada."}
    other_id = next(x for x in state["players"] if x != uid)
    other = state["players"][other_id]

    if action == "pass":
        player["passed"] = True
        if other["passed"]:
            _resolve_round(state)
        else:
            state["turn"] = other_id
            state["last_event"] = "Jogador passou. O adversário ainda pode jogar."
        return {"state": state}

    if action == "leader":
        if player["leader_used"]:
            return {"error": "A habilidade de líder já foi usada."}
        if row not in ROWS:
            return {"error": "Fileira inválida."}
        player["leader_used"] = True
        leader_id = player.get("leader_id") or DEFAULT_LEADERS.get(player.get("faction"), "comandante_fornalha")
        leader = LEADERS.get(leader_id)
        if not leader or leader["faction"] != player.get("faction"):
            return {"error": "Líder incompatível com a facção deste deck."}
        effect = leader["effect"]
        if effect in {"iron_command", "iron_bastion"}:
            for unit in player["board"]:
                if unit["row"] == "melee":
                    unit["bonus"] = int(unit.get("bonus", 0)) + (2 if effect == "iron_command" else 1)
                    if effect == "iron_bastion":
                        unit["weather_resist"] = int(unit.get("weather_resist", 0)) + 1
        elif effect in {"veil_master", "veil_shadow"}:
            ranged_units = [unit for unit in player["board"] if unit["row"] == "ranged"]
            bonus = 2 if effect == "veil_master" else (2 if len(ranged_units) >= 2 else 1)
            for unit in ranged_units:
                unit["bonus"] = int(unit.get("bonus", 0)) + bonus
        elif effect in {"arcane_archmage", "arcane_oracle"}:
            had_weather = any(int(v or 0) > 0 for v in state["weather"].values())
            state["weather"] = {r: 0 for r in ROWS}
            bonus = 2 if effect == "arcane_oracle" and had_weather else 1
            for unit in player["board"]:
                if unit["row"] == "siege":
                    unit["bonus"] = int(unit.get("bonus", 0)) + bonus
        state["last_event"] = f"Líder {leader['name']} ativado."
    elif action == "weather":
        if player["weather_used"]:
            return {"error": "Seu efeito climático já foi usado nesta partida."}
        if row not in ROWS:
            return {"error": "Fileira inválida."}
        player["weather_used"] = True
        state["weather"][row] = max(1, int(state["weather"].get(row, 0)))
        state["last_event"] = f"Clima severo na fileira {ROW_LABELS[row]}."
    elif action == "play":
        found = next((c for c in player["hand"] if c["id"] == str(card_id)), None)
        if not found:
            return {"error": "Essa carta não está na sua mão."}
        card = deepcopy(found)
        skill = card.get("habilidade", "")
        if card.get("especial") or str(card.get("categoria", "")).casefold() == "especial":
            if skill == "gwent_nevoa":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                state["weather"][row] = max(int(state["weather"].get(row, 0)), 2)
            elif skill == "gwent_chuva":
                state["weather"]["siege"] = max(int(state["weather"].get("siege", 0)), 2)
            elif skill == "gwent_geada":
                for r in ROWS:
                    state["weather"][r] = max(int(state["weather"].get(r, 0)), 1)
            elif skill == "gwent_chifre":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                for unit in player["board"]:
                    if unit["row"] == row:
                        unit["bonus"] = int(unit.get("bonus", 0)) + 2
            elif skill == "gwent_medico":
                candidates = [c for c in player["discard"] if not c.get("especial") and int(c["poder"]) <= 4]
                if not candidates:
                    return {"error": "Não há unidade elegível no descarte."}
                revived = candidates[-1]
                player["discard"].remove(revived)
                player["hand"].append(revived)
            elif skill == "gwent_queima":
                for side in (player, other):
                    if side["board"]:
                        strongest = max(side["board"], key=lambda c: int(c["poder"]) + int(c.get("bonus", 0)))
                        side["board"].remove(strongest)
                        side["discard"].append(strongest)
            elif skill == "gwent_purificar":
                state["weather"] = {r: 0 for r in ROWS}
            elif skill == "gwent_execucao":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                targets = [c for c in other["board"] if c["row"] == row]
                if not targets:
                    return {"error": "Não há unidade inimiga nessa fileira."}
                victim = min(targets, key=lambda c: int(c["poder"]) + int(c.get("bonus", 0)))
                other["board"].remove(victim)
                other["discard"].append(victim)
            elif skill == "gwent_vinculo":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                allies = [c for c in player["board"] if c["row"] == row]
                if len(allies) < 2:
                    return {"error": "O Juramento exige pelo menos duas unidades na fileira."}
                for unit in allies:
                    unit["bonus"] = int(unit.get("bonus", 0)) + 2
            elif skill == "gwent_batedor":
                if not player["draw_pile"]:
                    return {"error": "Sua reserva de compra está vazia."}
                player["hand"].append(player["draw_pile"].pop(0))
            elif skill == "gwent_muralha":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                for unit in player["board"]:
                    if unit["row"] == row:
                        unit["bonus"] = int(unit.get("bonus", 0)) + 1
            else:
                return {"error": "Efeito especial desconhecido."}
            player["hand"].remove(found)
            player["discard"].append(card)
            state["last_event"] = f"Carta especial {card['nome']} utilizada."
        else:
            if row not in ROWS:
                row = card["row"]
            card["row"] = row
            card["bonus"] = 0
            own_score = pontuacao(player, state.get("weather"))
            enemy_score = pontuacao(other, state.get("weather"))
            last_row = player.get("last_row")
            enemy_last_row = other.get("last_row")
            if skill == "primeira_luz" and state["round"] == 1: card["bonus"] += 1
            elif skill == "lei_primeva" and state["round"] == 1: card["bonus"] += 2
            elif skill == "ultimo_folego" and state["round"] == 3: card["bonus"] += 1
            elif skill == "paradoxo_eterno" and state["round"] == 3 and state["rounds"] and state["rounds"][-1]["winner_id"] not in (None, uid): card["bonus"] += 2
            elif skill == "precisao" and row == "ranged": card["bonus"] += 1
            elif skill in {"instinto", "fome_abismo"} and own_score < enemy_score: card["bonus"] += 2
            elif skill in {"retaliacao", "contragolpe"} and own_score < enemy_score: card["bonus"] += 1
            elif skill == "impeto" and own_score > enemy_score: card["bonus"] += 1
            elif skill == "sangue_frio" and own_score == enemy_score: card["bonus"] += 2
            elif skill == "encadeamento" and last_row == row: card["bonus"] += 2
            elif skill == "adaptacao" and last_row is not None and last_row != row: card["bonus"] += 1
            elif skill == "cacador_arcano" and any(c.get("tipo") == "Magia" for c in other["board"]): card["bonus"] += 1
            elif skill == "quebra_ritmo" and enemy_last_row == row: card["bonus"] += 1
            elif skill == "olho_tempestade" and state.get("weather", {}).get(row): card["bonus"] += 2
            elif skill == "drenagem":
                for enemy in other["board"]:
                    enemy["bonus"] = max(-2, int(enemy.get("bonus", 0)) - 1)
            elif skill == "decreto_soberano":
                for enemy in other["board"]:
                    enemy["bonus"] = max(-2, int(enemy.get("bonus", 0)) - 2)
            elif skill == "guardiao_fileira":
                card["bonus"] += min(3, sum(1 for ally in player["board"] if ally["row"] == row))
            elif skill == "cacador_solitario":
                if not any(ally["row"] == row for ally in player["board"]):
                    card["bonus"] += 2
            elif skill == "estandarte":
                for ally in player["board"]:
                    if ally["row"] == row:
                        ally["bonus"] = int(ally.get("bonus", 0)) + 1
            elif skill == "resistencia_climatica":
                card["weather_resist"] = 2
            elif skill == "eco_arcano":
                if any(c.get("especial") for c in player["discard"]):
                    card["bonus"] += 2
            # Sinergias de cartas: recompensam composições e posicionamento coordenado.
            if skill == "dupla_fornalha" and any(c.get("tipo") == "Força" and c.get("row") == row for c in player["board"]):
                card["bonus"] += 2
            elif skill == "irmandade_veu" and any(c.get("tipo") == "Destreza" and c.get("row") != row for c in player["board"]):
                card["bonus"] += 2
            elif skill == "circulo_arcano" and (
                any(c.get("tipo") == "Magia" and c.get("row") == row for c in player["board"])
                or any(c.get("especial") for c in player["discard"])
            ):
                card["bonus"] += 2
            # Bônus de facção: uma vez por rodada, primeira unidade da facção recebe +1.
            if card.get("tipo") in FACTIONS and FACTIONS[card["tipo"]] == player["faction"] and not player["faction_boost_used"]:
                card["bonus"] += 1
                player["faction_boost_used"] = True
            player["hand"].remove(found)
            player["board"].append(card)
            player["last_row"] = row
            state["last_event"] = f"{card['nome']} entrou na fileira {ROW_LABELS[row]}."
    else:
        return {"error": "Ação desconhecida."}

    if state["status"] == "active" and not other["passed"]:
        state["turn"] = other_id
    elif state["status"] == "active" and other["passed"]:
        state["turn"] = uid
    return {"state": state}
