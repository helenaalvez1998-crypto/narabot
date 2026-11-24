"""Motor estratégico Gwent do NARABOT: regras puras, sem dependência do Discord."""
from __future__ import annotations
from copy import deepcopy

ROWS = ("melee", "ranged", "siege")
ROW_LABELS = {"melee": "Corpo a corpo", "ranged": "Longa distância", "siege": "Cerco"}
TYPE_ROW = {"Força": "melee", "Destreza": "ranged", "Magia": "siege"}
FACTIONS = {"Força": "Ordem de Ferro", "Destreza": "Errantes do Véu", "Magia": "Conclave Arcano"}
FACTION_TYPES = {value: key for key, value in FACTIONS.items()}

# Contrato de cobertura: cada habilidade declarada no catálogo precisa estar ligada
# a um ramo do motor (unidade, Primordial ou carta tática especial).
HABILIDADES_UNIDADE_IMPLEMENTADAS = frozenset({
    "primeira_luz", "retaliacao", "impeto", "ultimo_folego", "contragolpe",
    "encadeamento", "adaptacao", "sangue_frio", "instinto", "precisao",
    "drenagem", "cacador_arcano", "quebra_ritmo", "lei_primeva",
    "decreto_soberano", "olho_tempestade", "fome_abismo", "paradoxo_eterno",
    "guardiao_fileira", "cacador_solitario", "estandarte", "resistencia_climatica",
    "eco_arcano", "dupla_fornalha", "irmandade_veu", "circulo_arcano",
    # Etapa 1: efeitos de ciclo de vida (escudo, queda, ressurreição, sobrevivência).
    "vinganca", "escudo_ferro", "ressurgir", "devorar", "sobrevivente", "espolios",
})
HABILIDADES_ESPECIAIS_IMPLEMENTADAS = frozenset({
    "gwent_nevoa", "gwent_geada", "gwent_chuva", "gwent_chifre", "gwent_medico",
    "gwent_queima", "gwent_purificar", "gwent_execucao", "gwent_vinculo",
    "gwent_batedor", "gwent_muralha",
    "gwent_egide", "gwent_requiem", "gwent_passo",
})
FACTION_ARCHETYPES = {
    "Ordem de Ferro": {"name": "Formação e Resistência", "description": "Proteção de fileira, fortalecimento de aliados e conversão de resistência em pressão."},
    "Errantes do Véu": {"name": "Mobilidade e Encadeamento", "description": "Reposicionamento, ataques coordenados e vantagens por alternar fileiras."},
    "Conclave Arcano": {"name": "Preparação e Amplificação", "description": "Marcas, efeitos preparados e amplificação de habilidades arcanas."},
}
LEADERS = {
    "comandante_fornalha": {"name": "Comandante da Fornalha", "faction": "Ordem de Ferro", "description": "+2 às suas unidades de corpo a corpo.", "effect": "iron_command"},
    "bastiao_ancestral": {"name": "Bastião Ancestral", "faction": "Ordem de Ferro", "description": "+1 às unidades de corpo a corpo e resistência climática +1.", "effect": "iron_bastion"},
    "mestre_veu": {"name": "Mestre do Véu", "faction": "Errantes do Véu", "description": "+2 às suas unidades de longa distância.", "effect": "veil_master"},
    "sombra_caminhante": {"name": "Sombra Caminhante", "faction": "Errantes do Véu", "description": "+1 às unidades de longa distância; com 2 ou mais, concede +1 adicional.", "effect": "veil_shadow"},
    "arquimaga_eclipse": {"name": "Arquimaga do Eclipse", "faction": "Conclave Arcano", "description": "Dissipa o clima e concede +1 ao cerco.", "effect": "arcane_archmage"},
    "juiz_cerco": {"name": "Juiz do Cerco", "faction": "Ordem de Ferro", "description": "Concede escudo às suas unidades da fileira escolhida (até 3).", "effect": "iron_warden"},
    "voz_caidos": {"name": "Voz dos Caídos", "faction": "Errantes do Véu", "description": "Traz do descarte, direto ao campo, a unidade mais forte de poder 6 ou menos, com +2.", "effect": "veil_chorus"},
    "mestre_eclipse": {"name": "Mestre do Eclipse", "faction": "Conclave Arcano", "description": "Compra uma carta, dissipa o clima e concede +1 (ou +2 se havia clima) às suas unidades da fileira escolhida.", "effect": "arcane_eclipse"},
    "oraculo_tempestade": {"name": "Oráculo da Tempestade", "faction": "Conclave Arcano", "description": "Dissipa o clima e concede +2 ao cerco se havia clima ativo; caso contrário, +1.", "effect": "arcane_oracle"},
}
# Arquétipos e combos nomeados. Os bônus são aplicados uma vez por combo/rodada.
CARD_SYNERGY_TAGS = {
    # Ordem de Ferro: resistência, formação e sacrifício.
    "chefe_guardiao_cinzas": {"cinzas"},
    "gwent_unidade_baluarte": {"fornalha"},
    "gwent_unidade_mestre_forja": {"fornalha"},
    "gwent_unidade_portaestandarte": {"fornalha", "estandarte"},
    "covenant_irmandade_ferro": {"estandarte"},
    "chefe_rei_afogado": {"abismo"},
    "covenant_coroa_abismo": {"abismo"},
    "covenant_lobos_cinza": {"cinzas"},
    # Errantes do Véu: mobilidade, ataques encadeados e caça.
    "chefe_cervo_sombrio": {"veu_sombrio"},
    "chefe_aparicao_veio": {"veu_sombrio"},
    "gwent_unidade_cavaleira": {"veu_sombrio"},
    "gwent_unidade_dupla_veu": {"veu_sombrio", "duas_luas"},
    "arma_duas_luas": {"duas_luas"},
    "arma_lamina_peregrino": {"peregrino"},
    "arma_arco_peregrino": {"peregrino"},
    "gwent_unidade_cartografa": {"duas_luas"},
    # Conclave Arcano: preparação, marcas e amplificação.
    "chefe_dama_vazio": {"vazio"},
    "arma_agulha_astro": {"astral"},
    "gwent_unidade_circulo": {"astral"},
    "gwent_unidade_invocador": {"astral"},
    "gwent_unidade_eco": {"astral", "eco"},
    "magia_orbe_eco": {"eco"},
    "magia_brasa_errante": {"chama"},
    "magia_chama_fria": {"chama"},
    # Etapa 2 — Ordem de Ferro.
    "gwent_unidade_sentinela_rubra": {"muralha"},
    "gwent_unidade_veterano_cercos": {"muralha"},
    "gwent_unidade_herdeiro_portao": {"muralha"},
    "gwent_unidade_carniceiro_forja": {"banquete"},
    "gwent_unidade_intendente": {"banquete"},
    # Etapa 2 — Errantes do Véu.
    "gwent_unidade_cacadora_fantasma": {"fantasmas"},
    "gwent_unidade_cantora_lamentos": {"fantasmas"},
    "gwent_unidade_senhor_cacada": {"fantasmas"},
    "gwent_unidade_saqueadora_veu": {"caravana"},
    "gwent_unidade_contrabandista": {"caravana"},
    # Etapa 2 — Conclave Arcano.
    "gwent_unidade_guardiao_runas": {"runico"},
    "gwent_unidade_necromante": {"runico"},
    "gwent_unidade_detonador": {"runico"},
    "gwent_unidade_devorador_mana": {"eclipse_voraz"},
    "gwent_unidade_bibliotecaria": {"eclipse_voraz"},
}
SYNERGY_COMBOS = {
    "cinzas_fornalha": {"name": "Pacto das Cinzas", "tags": {"cinzas", "fornalha"}, "bonus": 2, "description": "Guardião das Cinzas ou Lobos da Cinza e uma unidade da Fornalha coordenam a formação (+2)."},
    "veu_sombrio": {"name": "Caçada do Véu", "tags": {"veu_sombrio"}, "minimum": 2, "bonus": 2, "description": "Duas unidades do Véu Sombrio entram em sintonia (+2)."},
    "vazio_astral": {"name": "Convergência Astral", "tags": {"vazio", "astral"}, "bonus": 2, "description": "Dama do Vazio e uma unidade Astral convergem (+2)."},
    "mare_abissal": {"name": "Maré Abissal", "tags": {"abismo"}, "minimum": 2, "bonus": 2, "description": "Rei Afogado e Coroa do Abismo despertam a mesma força (+2)."},
    "juramento_estandarte": {"name": "Juramento do Estandarte", "tags": {"estandarte"}, "minimum": 2, "bonus": 1, "team_bonus": 1, "description": "Porta-estandarte e Irmandade de Ferro fortalecem a formação (+1 para a carta que completa e +1 aos aliados na mesma fileira)."},
    "passos_duas_luas": {"name": "Passos das Duas Luas", "tags": {"duas_luas"}, "minimum": 2, "bonus": 2, "description": "Dançarina, Gêmea ou Cartógrafa sincronizam seus movimentos (+2)."},
    "eco_convergente": {"name": "Eco Convergente", "tags": {"eco", "astral"}, "bonus": 2, "description": "O Arauto do Eco e uma unidade Astral amplificam a mesma magia (+2)."},
    "chama_dupla": {"name": "Chama em Contraponto", "tags": {"chama"}, "minimum": 2, "bonus": 2, "description": "Piromante e Feiticeira da Chama Fria equilibram suas chamas (+2)."},
    "muralha_inabalavel": {"name": "Muralha Inabalável", "tags": {"muralha"}, "minimum": 2, "bonus": 2, "team_bonus": 1, "description": "Duas unidades da Muralha Rubra erguem a linha (+2 para a carta que completa e +1 aos aliados na fileira)."},
    "banquete_guerra": {"name": "Banquete de Guerra", "tags": {"banquete"}, "minimum": 2, "bonus": 3, "description": "Carniceiro da Forja e Intendente dividem o butim (+3)."},
    "procissao_fantasma": {"name": "Procissão Fantasma", "tags": {"fantasmas"}, "minimum": 2, "bonus": 2, "team_bonus": 1, "description": "Duas unidades fantasmas marcham juntas (+2 para a carta que completa e +1 aos aliados na fileira)."},
    "caravana_saqueadora": {"name": "Caravana Saqueadora", "tags": {"caravana"}, "minimum": 2, "bonus": 2, "description": "Saqueadora e Contrabandista fecham o negócio (+2)."},
    "ritual_runico": {"name": "Ritual Rúnico", "tags": {"runico"}, "minimum": 2, "bonus": 2, "team_bonus": 1, "description": "Duas unidades rúnicas completam o círculo (+2 para a carta que completa e +1 aos aliados na fileira)."},
    "eclipse_voraz": {"name": "Eclipse Voraz", "tags": {"eclipse_voraz"}, "minimum": 2, "bonus": 3, "description": "Devorador de Mana e Bibliotecária eclipsam a mesma fonte (+3)."},
    "rota_peregrina": {"name": "Rota do Peregrino", "tags": {"peregrino"}, "minimum": 2, "bonus": 1, "description": "Duelista e Batedor do Peregrino coordenam o avanço (+1)."},
}


# Habilidades de identidade: efeitos próprios de cartas-chave, além das habilidades
# gerais e dos combos de facção. Cada efeito é resolvido uma vez ao entrar em campo.
CARD_IDENTITY_ABILITIES = {
    "chefe_guardiao_cinzas": {"name": "Égide das Cinzas", "text": "Ao entrar, concede +1 a um aliado da mesma fileira. Se já houver um aliado ali, recebe +1.", "effect": "ash_guardian"},
    "chefe_dama_vazio": {"name": "Fenda do Vazio", "text": "Ao entrar, reduz em 2 o bônus da unidade inimiga mais forte (mínimo -2).", "effect": "void_rend"},
    "chefe_cervo_sombrio": {"name": "Passagem Sombria", "text": "Recebe +1 para cada outra fileira ocupada por aliados, até +2.", "effect": "shadow_paths"},
    "chefe_rei_afogado": {"name": "Dízimo do Abismo", "text": "Recebe +2 se houver unidade no seu descarte; caso contrário, +1 se o rival controlar mais unidades.", "effect": "abyss_tithe"},
    "chefe_oraculo_ruina": {"name": "Presságio da Ruína", "text": "Reduz em 1 o bônus da unidade inimiga mais forte e recebe +1 se o rival estiver à frente.", "effect": "ruin_omen"},
    "chefe_cacador_sem_rosto": {"name": "Marca da Presa", "text": "Recebe +2 se o rival controlar uma unidade com poder efetivo maior que o seu poder base.", "effect": "faceless_hunt"},
    "chefe_vigia_cinzento": {"name": "Vigília Cinzenta", "text": "Concede +1 às outras unidades aliadas na mesma fileira.", "effect": "grey_watch"},
    "chefe_aparicao_veio": {"name": "Deslocamento Espectral", "text": "Recebe +2 se a sua última unidade foi jogada em outra fileira.", "effect": "veil_shift"},
    "arma_lamina_peregrino": {"name": "Duelo do Peregrino", "text": "Recebe +2 se o rival tiver jogado uma unidade na mesma fileira em seu último turno.", "effect": "pilgrim_duel"},
    "arma_martelo_fornalha": {"name": "Martelo de Cadência", "text": "Recebe +1 para cada aliado da Ordem de Ferro na fileira, até +2.", "effect": "forge_rhythm"},
    "arma_cajado_marulho": {"name": "Ressonância das Marés", "text": "Recebe +2 se o rival controlar uma unidade do Conclave Arcano; senão, +1 se o rival tiver mais unidades em campo.", "effect": "tide_resonance"},
    "arma_duas_luas": {"name": "Dança Espelhada", "text": "Recebe +1 se houver outra unidade aliada em fileira diferente.", "effect": "twin_dance"},
    "arma_grande_sino": {"name": "Sino do Último Bastião", "text": "Recebe +2 quando sua pontuação estiver abaixo da rival.", "effect": "last_bell"},
    "arma_agulha_astro": {"name": "Fio Astral", "text": "Marca a unidade inimiga mais forte: ela perde 1 de bônus; a próxima unidade Astral aliada recebe +1 nesta rodada.", "effect": "astral_thread"},
    "arma_lanca_fornalha": {"name": "Investida da Fornalha", "text": "Recebe +1 se já houver outra unidade da Ordem de Ferro em campo.", "effect": "furnace_charge"},
    "arma_arco_peregrino": {"name": "Tiro de Cobertura", "text": "Concede +1 à unidade aliada mais fraca em outra fileira.", "effect": "covering_shot"},
    "magia_brasa_errante": {"name": "Brasa Persistente", "text": "Recebe +1 para cada fileira inimiga sob clima, até +2.", "effect": "wandering_ember"},
    "magia_selo_vigilia": {"name": "Selo de Vigília", "text": "Concede resistência climática 1 a si e +1 a um aliado na mesma fileira.", "effect": "vigil_seal"},
    "magia_trovao_oco": {"name": "Descarga Oca", "text": "Reduz em 1 o bônus de todas as unidades inimigas na fileira escolhida.", "effect": "hollow_thunder"},
    "magia_nevoa_antiga": {"name": "Névoa Ancestral", "text": "Recebe +2 se qualquer fileira estiver sob clima.", "effect": "ancient_mist"},
    "magia_sol_negro": {"name": "Eclipse Devorador", "text": "Recebe +2 se houver uma unidade inimiga com bônus positivo.", "effect": "devouring_eclipse"},
    "magia_fagulha": {"name": "Faísca Condutora", "text": "Recebe +1 se houver outra unidade aliada do Conclave em campo.", "effect": "conductive_spark"},
    "magia_orbe_eco": {"name": "Orbe Refrator", "text": "Recebe +1 para cada carta especial no seu descarte, até +2.", "effect": "echo_orb"},
    "magia_chama_fria": {"name": "Contrafogo", "text": "Reduz em 1 o bônus de até duas unidades inimigas na mesma fileira.", "effect": "counterflame"},
    "covenant_lua_velada": {"name": "Aliança Lunar", "text": "Recebe +1 e concede +1 a uma unidade aliada em outra fileira.", "effect": "veiled_moon"},
    "covenant_sentinelas": {"name": "Sentinela Compartilhada", "text": "Recebe +1 se houver unidade aliada em cada uma das outras fileiras.", "effect": "shared_sentinel"},
    "covenant_ultimos": {"name": "Último Juramento", "text": "Recebe +2 se você tiver menos unidades em campo que o rival.", "effect": "last_oath"},
    "covenant_filhos_brasa": {"name": "Herança da Brasa", "text": "Recebe +1 e fortalece em +1 um aliado da Ordem de Ferro na mesma fileira.", "effect": "ember_kin"},
    "covenant_peregrinos_nevoa": {"name": "Rastro na Névoa", "text": "Recebe +1 se sua última unidade foi jogada em outra fileira.", "effect": "mist_trail"},
}


def _aplicar_habilidade_identidade(player: dict, other: dict, card: dict, state: dict, row: str) -> str | None:
    data = CARD_IDENTITY_ABILITIES.get(str(card.get("id", "")))
    if not data:
        return None
    effect = data["effect"]
    allies, enemies = player.get("board", []), other.get("board", [])
    same_row = [unit for unit in allies if unit.get("row") == row]
    enemy_row = [unit for unit in enemies if unit.get("row") == row]
    strongest = max(enemies, key=lambda unit: int(unit.get("poder", 0)) + int(unit.get("bonus", 0)), default=None)
    weakest_other_row = min((u for u in allies if u.get("row") != row), key=lambda u: int(u.get("poder", 0)) + int(u.get("bonus", 0)), default=None)
    if effect == "ash_guardian":
        if same_row:
            same_row[0]["bonus"] = int(same_row[0].get("bonus", 0)) + 1
            card["bonus"] += 1
    elif effect == "void_rend" and strongest:
        strongest["bonus"] = max(-2, int(strongest.get("bonus", 0)) - 2)
    elif effect == "shadow_paths":
        card["bonus"] += min(2, len({u.get("row") for u in allies if u.get("row") != row}))
    elif effect == "abyss_tithe":
        card["bonus"] += 2 if player.get("discard") else (1 if len(enemies) > len(allies) else 0)
    elif effect == "ruin_omen":
        if strongest:
            strongest["bonus"] = max(-2, int(strongest.get("bonus", 0)) - 1)
        if pontuacao(player, state.get("weather")) < pontuacao(other, state.get("weather")):
            card["bonus"] += 1
    elif effect == "faceless_hunt":
        if any(int(u.get("poder", 0)) + int(u.get("bonus", 0)) > int(card.get("poder", 0)) for u in enemies): card["bonus"] += 2
    elif effect == "grey_watch":
        for unit in same_row: unit["bonus"] = int(unit.get("bonus", 0)) + 1
    elif effect == "veil_shift":
        if player.get("last_row") is not None and player.get("last_row") != row: card["bonus"] += 2
    elif effect == "pilgrim_duel":
        if other.get("last_row") == row: card["bonus"] += 2
    elif effect == "forge_rhythm":
        card["bonus"] += min(2, sum(1 for u in allies if u.get("tipo") == "Força" and u.get("row") == row))
    elif effect == "tide_resonance":
        if any(u.get("tipo") == "Magia" for u in enemies):
            card["bonus"] += 2
        elif len(enemies) > len(allies):  # Etapa 3: alternativa contra facções que não são o Conclave.
            card["bonus"] += 1
    elif effect == "twin_dance":
        if any(u.get("row") != row for u in allies): card["bonus"] += 1
    elif effect == "last_bell":
        if pontuacao(player, state.get("weather")) < pontuacao(other, state.get("weather")): card["bonus"] += 2
    elif effect == "astral_thread":
        if strongest: strongest["bonus"] = max(-2, int(strongest.get("bonus", 0)) - 1)
        player["astral_thread_ready"] = True
    elif effect == "furnace_charge":
        if any(u.get("tipo") == "Força" for u in allies): card["bonus"] += 1
    elif effect == "covering_shot" and weakest_other_row:
        weakest_other_row["bonus"] = int(weakest_other_row.get("bonus", 0)) + 1
    elif effect == "wandering_ember":
        card["bonus"] += min(2, sum(1 for r in ROWS if int(state.get("weather", {}).get(r, 0)) > 0))
    elif effect == "vigil_seal":
        card["weather_resist"] = 1
        if same_row: same_row[0]["bonus"] = int(same_row[0].get("bonus", 0)) + 1
    elif effect == "hollow_thunder":
        for unit in enemy_row: unit["bonus"] = max(-2, int(unit.get("bonus", 0)) - 1)
    elif effect == "ancient_mist":
        if any(int(v or 0) > 0 for v in state.get("weather", {}).values()): card["bonus"] += 2
    elif effect == "devouring_eclipse":
        if any(int(u.get("bonus", 0)) > 0 for u in enemies): card["bonus"] += 2
    elif effect == "conductive_spark":
        if any(u.get("tipo") == "Magia" for u in allies): card["bonus"] += 1
    elif effect == "echo_orb":
        card["bonus"] += min(2, sum(1 for c in player.get("discard", []) if c.get("especial")))
    elif effect == "counterflame":
        for unit in sorted(enemy_row, key=lambda u: int(u.get("bonus", 0)), reverse=True)[:2]:
            unit["bonus"] = max(-2, int(unit.get("bonus", 0)) - 1)
    elif effect == "veiled_moon":
        card["bonus"] += 1
        if weakest_other_row: weakest_other_row["bonus"] = int(weakest_other_row.get("bonus", 0)) + 1
    elif effect == "shared_sentinel":
        occupied = {u.get("row") for u in allies}
        if all(r == row or r in occupied for r in ROWS): card["bonus"] += 1
    elif effect == "last_oath":
        if len(allies) < len(enemies): card["bonus"] += 2
    elif effect == "ember_kin":
        card["bonus"] += 1
        ally = next((u for u in same_row if u.get("tipo") == "Força"), None)
        if ally: ally["bonus"] = int(ally.get("bonus", 0)) + 1
    elif effect == "mist_trail":
        if player.get("last_row") is not None and player.get("last_row") != row: card["bonus"] += 1
    return str(data["name"])


# Bônus da primeira unidade da facção a cada rodada (ajuste fino de equilíbrio por facção).
FACTION_BOOST = {"Ordem de Ferro": 1, "Errantes do Véu": 2, "Conclave Arcano": 1}

DEFAULT_LEADERS = {
    "Ordem de Ferro": "comandante_fornalha",
    "Errantes do Véu": "mestre_veu",
    "Conclave Arcano": "mestre_eclipse",  # Etapa 3: padrão mais forte; quem já escolheu um líder não é afetado.
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
    identity = CARD_IDENTITY_ABILITIES.get(str(card["id"]), {})
    return {
        "id": str(card["id"]), "nome": str(card.get("nome", "Carta")),
        "categoria": category,
        "papel_gwent": str(card.get("papel_gwent", "Tática" if special else ROW_LABELS[row])),
        "especial": special,
        "poder": 0 if special else max(1, min(15, int(card.get("poder", 1)))),
        "raridade": str(card.get("raridade", "Comum")), "tipo": kind,
        "faccao": faction,
        "arquetipo_faccao": FACTION_ARCHETYPES.get(faction, {}).get("name", "Estratégia Geral"),
        "arquetipo_descricao": FACTION_ARCHETYPES.get(faction, {}).get("description", ""),
        "fileira": row,
        "row": row, "row_label": ROW_LABELS[row], "habilidade": skill,
        "habilidade_nome": str(identity.get("name", card.get("habilidade_nome", skill_data.get("nome", skill.replace("_", " ").title())))),
        "habilidade_texto": str(identity.get("text", card.get("habilidade_texto", skill_data.get("texto", card.get("descricao", "")))))[:180],
        "habilidade_identidade": bool(identity),
        "sinergias": sorted(CARD_SYNERGY_TAGS.get(str(card["id"]), set())),
        "combos_compativeis": [
            {"id": combo_id, "nome": combo["name"], "descricao": combo["description"]}
            for combo_id, combo in SYNERGY_COMBOS.items()
            if CARD_SYNERGY_TAGS.get(str(card["id"]), set()) & set(combo["tags"])
        ],
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
            "mulligan_done": False, "last_row": None, "synergy_used": {}, "baixas": 0,
        }
    return {
        "match_id": int(match_id), "status": "active", "phase": "mulligan", "round": 1,
        "players": players, "turn": str(creator_id),
        "weather": {row: 0 for row in ROWS},
        "crowns": {str(creator_id): 0, str(opponent_id): 0},
        "rounds": [], "winner_id": None,
        "last_event": "Preparação: cada jogador pode trocar até duas cartas.",
        "event_log": ["Partida criada. Preparação: cada jogador pode trocar até duas cartas."],
    }


def _registrar_evento(state: dict) -> dict:
    """Acrescenta o último evento ao histórico persistido da partida."""
    history = state.setdefault("event_log", [])
    event = str(state.get("last_event", "")).strip()
    if event and (not history or history[-1] != event):
        history.append(event[:500])
    state["event_log"] = history[-20:]
    return {"state": state}


def _aplicar_combo_de_cartas(player: dict, card: dict) -> str | None:
    """Resolve uma combinação temática uma única vez por jogador e rodada."""
    tags_novas = set(CARD_SYNERGY_TAGS.get(str(card.get("id", "")), set()))
    if not tags_novas:
        return None
    usados = player.setdefault("synergy_used", {})
    tags_campo = set()
    for unit in player.get("board", []):
        tags_campo.update(CARD_SYNERGY_TAGS.get(str(unit.get("id", "")), set()))
    tags_total = tags_campo | tags_novas
    for combo_id, combo in SYNERGY_COMBOS.items():
        if usados.get(combo_id):
            continue
        required = set(combo["tags"])
        if not required.issubset(tags_total):
            continue
        participantes = [*player.get("board", []), card]
        if "minimum" in combo:
            quantidade = sum(bool(CARD_SYNERGY_TAGS.get(str(unit.get("id", "")), set()) & required) for unit in participantes)
            if quantidade < int(combo["minimum"]):
                continue
        card["bonus"] = int(card.get("bonus", 0)) + int(combo.get("bonus", 0))
        team_bonus = int(combo.get("team_bonus", 0))
        if team_bonus:
            for ally in player.get("board", []):
                if ally.get("row") == card.get("row"):
                    ally["bonus"] = int(ally.get("bonus", 0)) + team_bonus
        card["combo_ativado"] = combo_id
        usados[combo_id] = True
        return str(combo["name"])
    return None


def _poder_efetivo(unit: dict) -> int:
    return int(unit.get("poder", 0)) + int(unit.get("bonus", 0))


def _remover_unidade(side: dict, unit: dict, causa: str = "remocao") -> str:
    """Remove uma unidade do campo respeitando escudo e disparando Vingança.

    Ponto único de remoção: qualquer efeito que destrua, sacrifique ou execute
    uma unidade deve passar por aqui para que escudo, contagem de baixas e
    habilidades de queda funcionem de forma consistente.
    Retorna um texto curto para o histórico da partida.
    """
    if unit not in side.get("board", []):
        return ""
    if causa != "sacrificio" and int(unit.get("escudo", 0)) > 0:
        unit["escudo"] = int(unit["escudo"]) - 1
        return f"{unit['nome']} resistiu graças ao escudo."
    side["board"].remove(unit)
    unit.pop("escudo", None)
    side.setdefault("discard", []).append(unit)
    side["baixas"] = int(side.get("baixas", 0)) + 1
    texto = f"{unit['nome']} caiu."
    if unit.get("habilidade") == "vinganca":
        aliados = [u for u in side["board"] if u.get("row") == unit.get("row")]
        for aliado in aliados:
            aliado["bonus"] = int(aliado.get("bonus", 0)) + 1
        if aliados:
            texto += f" Vingança: +1 para {len(aliados)} aliado(s)."
    return texto


def pontuacao(player: dict, weather: dict | None = None) -> int:
    weather = weather or {}
    return sum(max(1, int(c["poder"]) + int(c.get("bonus", 0)) -
                   max(0, int(weather.get(c["row"], 0) or 0) - int(c.get("weather_resist", 0))))
               for c in player["board"])


def _resumo_alvo(unit: dict) -> dict:
    return {
        "id": str(unit["id"]), "nome": unit.get("nome", ""), "poder": int(unit.get("poder", 0)),
        "bonus": int(unit.get("bonus", 0)), "row": unit.get("row", ""), "escudo": int(unit.get("escudo", 0)),
    }


def opcoes_de_alvo(state: dict, user_id) -> dict:
    """Alvos escolhíveis para cada carta especial da mão de `user_id`.

    As regras de elegibilidade ficam aqui, ao lado de aplicar_jogada, para o site apenas
    exibir as opções (mesmos limites de poder que o motor valida). `filtro_fileira` diz como
    o site deve filtrar pela fileira escolhida: "mesma" (alvo na fileira) ou "diferente".
    """
    player = state.get("players", {}).get(str(user_id))
    if not player or state.get("status") != "active" or state.get("phase", "battle") != "battle":
        return {}
    other = next((p for uid, p in state["players"].items() if uid != str(user_id)), {"board": []})
    resultado: dict[str, dict] = {}
    for card in player.get("hand", []):
        if not (card.get("especial") or str(card.get("categoria", "")).casefold() == "especial"):
            continue
        skill = card.get("habilidade", "")
        if skill == "gwent_execucao":
            info = {"rotulo": "Escolha a unidade inimiga a eliminar (poder efetivo 6 ou menos)",
                    "filtro_fileira": "mesma",
                    "opcoes": [u for u in other.get("board", []) if _poder_efetivo(u) <= 6]}
        elif skill == "gwent_medico":
            info = {"rotulo": "Escolha a unidade (poder 4 ou menos) que volta para a sua mão",
                    "filtro_fileira": None,
                    "opcoes": [c for c in player.get("discard", []) if not c.get("especial") and int(c["poder"]) <= 4]}
        elif skill == "gwent_requiem":
            info = {"rotulo": "Escolha a unidade (poder 6 ou menos) que retorna ao campo",
                    "filtro_fileira": None,
                    "opcoes": [c for c in player.get("discard", []) if not c.get("especial") and int(c["poder"]) <= 6]}
        elif skill == "gwent_egide":
            info = {"rotulo": "Escolha a unidade que receberá o escudo", "filtro_fileira": None,
                    "opcoes": [u for u in player.get("board", []) if int(u.get("escudo", 0)) <= 0]}
        elif skill == "gwent_passo":
            info = {"rotulo": "Escolha a unidade que será movida para a fileira de destino",
                    "filtro_fileira": "diferente", "opcoes": list(player.get("board", []))}
        else:
            continue
        info["opcoes"] = [_resumo_alvo(u) for u in info["opcoes"]]
        resultado[str(card["id"])] = info
    return resultado


def placar(state: dict) -> dict:
    return {uid: {
        "score": pontuacao(player, state.get("weather")),
        "passed": player["passed"], "hand": len(player["hand"]),
        "crowns": state["crowns"][uid], "board": deepcopy(player["board"]),
        "faction": player.get("faction", ""),
        "baixas": int(player.get("baixas", 0)),
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
    extras = []
    for pid, player in state["players"].items():
        board = player.get("board", [])
        # Espólios: quem vence a rodada com a unidade em campo compra uma carta.
        if pid == winner and any(u.get("habilidade") == "espolios" for u in board) and player.get("draw_pile"):
            player["hand"].append(player["draw_pile"].pop(0))
            extras.append("Espólios de guerra: o vencedor comprou uma carta.")
        # Sobrevivente: a mais forte permanece no campo para a próxima rodada.
        keepers = [u for u in board if u.get("habilidade") == "sobrevivente"]
        keeper = max(keepers, key=_poder_efetivo, default=None)
        # Unidades sobrevivem à rodada no descarte: isso habilita recuperação
        # por Médico de Campanha e mantém o histórico completo da partida.
        player.setdefault("discard", []).extend(deepcopy(u) for u in board if u is not keeper)
        player["board"] = []
        if keeper is not None:
            kept = deepcopy(keeper)
            kept["bonus"] = 0
            player["board"].append(kept)
            extras.append(f"{kept['nome']} sobreviveu à rodada.")
        player["passed"] = False
        player["faction_boost_used"] = False
        player["last_row"] = None
        player["synergy_used"] = {}
    state["turn"] = winner or (b if state["turn"] == a else a)
    state["last_event"] += " " + " ".join(extras) if extras else ""
    state["last_event"] += " Nova rodada: as cartas restantes continuam na mão."



def _auto_pass_empty_hands(state: dict) -> None:
    """Marca automaticamente como passados os jogadores sem cartas na mão.

    Se ambos ficarem sem cartas (ou já tiverem passado), resolve a rodada.
    Também avança o turno para o único jogador que ainda pode jogar.
    """
    while state.get("status") == "active" and state.get("phase", "battle") == "battle":
        players = state.get("players", {})
        if not players:
            return

        newly_passed = []
        for uid, side in players.items():
            if not side.get("hand") and not side.get("passed", False):
                side["passed"] = True
                newly_passed.append(str(uid))

        if newly_passed:
            message = "Sem cartas na mão: passagem automática de " + ", ".join(
                f"jogador {uid}" for uid in newly_passed
            ) + "."
            state["last_event"] = message
            history = state.setdefault("event_log", [])
            if not history or history[-1] != message:
                history.append(message[:500])
                state["event_log"] = history[-20:]

        if all(side.get("passed", False) for side in players.values()):
            _resolve_round(state)
            if state.get("status") != "active":
                return
            # Uma nova rodada pode começar com a mão vazia; nesse caso
            # o passe também é automático, sem exigir uma ação inexistente.
            continue

        active_id = next((uid for uid, side in players.items() if not side.get("passed", False)), None)
        turn_id = str(state.get("turn") or "")
        if active_id is not None and (turn_id not in players or players[turn_id].get("passed", False)):
            state["turn"] = active_id
        return

def aplicar_jogada(state: dict, user_id: int, card_id: str | None = None,
                    action: str = "play", row: str | None = None,
                    card_ids: list[str] | None = None,
                    target_id: str | None = None) -> dict:
    state = deepcopy(state)
    # Compatibilidade com partidas iniciadas na versão anterior do motor.
    state.setdefault("phase", "battle")
    state.setdefault("weather", {row: 0 for row in ROWS})
    state.setdefault("event_log", [])
    for legacy_player in state.get("players", {}).values():
        legacy_player.setdefault("discard", [])
        legacy_player.setdefault("draw_pile", [])
        legacy_player.setdefault("faction", _faction(legacy_player.get("hand", [])))
        legacy_player.setdefault("faction_boost_used", False)
        legacy_player.setdefault("mulligan_done", True)
        legacy_player.setdefault("leader_used", False)
        legacy_player.setdefault("weather_used", False)
        legacy_player.setdefault("last_row", None)
        legacy_player.setdefault("synergy_used", {})
        legacy_player.setdefault("baixas", 0)
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
        return _registrar_evento(state)

    # A preparação inicial é simultânea: cada jogador deve poder escolher
    # suas trocas independentemente de quem inicia a batalha.
    if state.get("phase") != "mulligan" and state["turn"] != uid:
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
            _auto_pass_empty_hands(state)
        else:
            state["turn"] = other
            state["last_event"] = "Preparação concluída por um jogador. Aguardando o adversário."
        return _registrar_evento(state)

    if player["passed"]:
        return {"error": "Você já passou nesta rodada."}
    other_id = next(x for x in state["players"] if x != uid)
    other = state["players"][other_id]

    # Compatibilidade com partidas salvas antes da regra de passe automático.
    if not player.get("hand") and action != "pass":
        state["turn"] = other_id
        state["last_event"] = "Você está sem cartas na mão e passou automaticamente."
        _auto_pass_empty_hands(state)
        return _registrar_evento(state)

    if action == "pass":
        player["passed"] = True
        state["turn"] = other_id
        state["last_event"] = "Jogador passou. O adversário ainda pode jogar."
        _auto_pass_empty_hands(state)
        return _registrar_evento(state)

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
        elif effect == "iron_warden":
            alvos = sorted((u for u in player["board"] if u["row"] == row and int(u.get("escudo", 0)) <= 0),
                           key=_poder_efetivo, reverse=True)[:3]
            if not alvos:
                return {"error": "Não há unidade sem escudo nessa fileira."}
            for unit in alvos:
                unit["escudo"] = 1
        elif effect == "veil_chorus":
            pool = [c for c in player["discard"] if not c.get("especial") and int(c["poder"]) <= 6]
            if not pool:
                return {"error": "Não há unidade elegível (poder 6 ou menos) no descarte."}
            revivida = deepcopy(max(pool, key=lambda c: int(c["poder"])))
            player["discard"] = [c for c in player["discard"] if c["id"] != revivida["id"]]
            revivida["bonus"] = 2
            revivida.pop("escudo", None)
            if revivida.get("row") not in ROWS:
                revivida["row"] = row
            player["board"].append(revivida)
        elif effect == "arcane_eclipse":
            had_weather = any(int(v or 0) > 0 for v in state["weather"].values())
            state["weather"] = {r: 0 for r in ROWS}
            if player.get("draw_pile"):
                player["hand"].append(player["draw_pile"].pop(0))
            for unit in player["board"]:
                if unit["row"] == row:
                    unit["bonus"] = int(unit.get("bonus", 0)) + (2 if had_weather else 1)
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
        eventos_especial: list[str] = []
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
                if target_id:
                    revived = next((c for c in candidates if c["id"] == str(target_id)), None)
                    if revived is None:
                        return {"error": "Essa unidade não pode ser recuperada (poder 4 ou menos, no seu descarte)."}
                else:
                    revived = candidates[-1]
                player["discard"].remove(revived)
                player["hand"].append(revived)
            elif skill == "gwent_queima":
                for side in (player, other):
                    if side["board"]:
                        strongest = max(side["board"], key=_poder_efetivo)
                        eventos_especial.append(_remover_unidade(side, strongest))
            elif skill == "gwent_purificar":
                state["weather"] = {r: 0 for r in ROWS}
            elif skill == "gwent_execucao":
                if row not in ROWS:
                    return {"error": "Escolha uma fileira válida."}
                targets = [c for c in other["board"] if c["row"] == row]
                if not targets:
                    return {"error": "Não há unidade inimiga nessa fileira."}
                if target_id:
                    victim = next((c for c in targets if c["id"] == str(target_id)), None)
                    if victim is None:
                        return {"error": "O alvo escolhido não está nessa fileira."}
                    if _poder_efetivo(victim) > 6:
                        return {"error": "A Sentença só alcança unidades com poder efetivo 6 ou menos."}
                else:
                    victim = min(targets, key=_poder_efetivo)
                eventos_especial.append(_remover_unidade(other, victim, "execucao"))
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
            elif skill == "gwent_egide":
                protegiveis = [u for u in player["board"] if int(u.get("escudo", 0)) <= 0]
                if not protegiveis:
                    return {"error": "Você não tem unidade sem escudo em campo."}
                if target_id:
                    alvo = next((u for u in protegiveis if u["id"] == str(target_id)), None)
                    if alvo is None:
                        return {"error": "Escolha uma unidade sua que ainda não tenha escudo."}
                else:
                    alvo = max(protegiveis, key=_poder_efetivo)
                alvo["escudo"] = 1
                eventos_especial.append(f"{alvo['nome']} recebeu um escudo.")
            elif skill == "gwent_requiem":
                elegiveis = [c for c in player["discard"] if not c.get("especial") and int(c["poder"]) <= 6]
                if not elegiveis:
                    return {"error": "Não há unidade elegível (poder 6 ou menos) no descarte."}
                if target_id:
                    revivida = next((c for c in elegiveis if c["id"] == str(target_id)), None)
                    if revivida is None:
                        return {"error": "Essa unidade não pode ser trazida de volta pelo Réquiem."}
                else:
                    revivida = max(elegiveis, key=lambda c: int(c["poder"]))
                player["discard"].remove(revivida)
                revivida = deepcopy(revivida)
                revivida["bonus"] = 0
                revivida.pop("escudo", None)
                if revivida.get("row") not in ROWS:
                    revivida["row"] = row if row in ROWS else "melee"
                player["board"].append(revivida)
                eventos_especial.append(f"{revivida['nome']} retornou ao campo.")
            elif skill == "gwent_passo":
                if row not in ROWS:
                    return {"error": "Escolha a fileira de destino."}
                moviveis = [u for u in player["board"] if u["row"] != row]
                if not moviveis:
                    return {"error": "Você não tem unidade fora dessa fileira para mover."}
                if target_id:
                    alvo = next((u for u in moviveis if u["id"] == str(target_id)), None)
                    if alvo is None:
                        return {"error": "Escolha uma unidade sua que não esteja na fileira de destino."}
                else:
                    alvo = min(moviveis, key=_poder_efetivo)
                origem = alvo["row"]
                alvo["row"] = row
                eventos_especial.append(f"{alvo['nome']} saiu de {ROW_LABELS[origem]} para {ROW_LABELS[row]}.")
            else:
                return {"error": "Efeito especial desconhecido."}
            player["hand"].remove(found)
            player["discard"].append(card)
            state["last_event"] = f"Carta especial {card['nome']} utilizada."
            detalhes = [d for d in eventos_especial if d]
            if detalhes:
                state["last_event"] += " " + " ".join(detalhes)
        else:
            if row not in ROWS:
                row = card["row"]
            card["row"] = row
            card["bonus"] = 0
            own_score = pontuacao(player, state.get("weather"))
            enemy_score = pontuacao(other, state.get("weather"))
            last_row = player.get("last_row")
            enemy_last_row = other.get("last_row")
            extras_entrada: list[str] = []
            unidade_revivida = None
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
            elif skill == "cacador_arcano":
                # Etapa 3: também caça unidades fortalecidas, para funcionar contra qualquer facção.
                if any(c.get("tipo") == "Magia" for c in other["board"]) or any(int(c.get("bonus", 0)) > 0 for c in other["board"]):
                    card["bonus"] += 1
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
                if not any(int(v or 0) > 0 for v in state["weather"].values()):
                    card["bonus"] += 1  # Etapa 3: sem clima ativo a resistência vira vigor.
            elif skill == "eco_arcano":
                if any(c.get("especial") for c in player["discard"]):
                    card["bonus"] += 2
            elif skill == "escudo_ferro":
                card["escudo"] = 1
            elif skill == "devorar":
                presas = [a for a in player["board"] if a["row"] == row]
                if presas:
                    presa = min(presas, key=_poder_efetivo)
                    ganho = min(4, max(1, _poder_efetivo(presa)))
                    _remover_unidade(player, presa, "sacrificio")
                    card["bonus"] += ganho
                    extras_entrada.append(f"Devorou {presa['nome']} (+{ganho}).")
            elif skill == "ressurgir":
                pool = [c for c in player["discard"] if not c.get("especial") and int(c["poder"]) <= 5]
                if pool:
                    revivida = max(pool, key=lambda c: int(c["poder"]))
                    player["discard"].remove(revivida)
                    revivida = deepcopy(revivida)
                    revivida["bonus"] = 0
                    revivida.pop("escudo", None)
                    revivida["row"] = revivida.get("row") if revivida.get("row") in ROWS else row
                    unidade_revivida = revivida
                    extras_entrada.append(f"Ressurgiu {revivida['nome']} do descarte.")
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
            # Habilidade exclusiva da carta, depois das habilidades gerais e antes dos combos.
            identidade_ativada = _aplicar_habilidade_identidade(player, other, card, state, row)
            if player.pop("astral_thread_ready", False) and "astral" in CARD_SYNERGY_TAGS.get(str(card.get("id", "")), set()):
                card["bonus"] += 1
                state["last_event"] += " O Fio Astral foi consumido (+1)."
            # Combos temáticos entre cartas específicas, além das sinergias de fileira acima.
            combo_ativado = _aplicar_combo_de_cartas(player, card)
            # Bônus de facção: uma vez por rodada, primeira unidade da facção recebe FACTION_BOOST (Véu: +2, demais: +1).
            if card.get("tipo") in FACTIONS and FACTIONS[card["tipo"]] == player["faction"] and not player["faction_boost_used"]:
                card["bonus"] += FACTION_BOOST.get(player["faction"], 1)
                player["faction_boost_used"] = True
            player["hand"].remove(found)
            player["board"].append(card)
            if unidade_revivida is not None:
                player["board"].append(unidade_revivida)
            player["last_row"] = row
            state["last_event"] = f"{card['nome']} entrou na fileira {ROW_LABELS[row]}."
            for texto_extra in extras_entrada:
                state["last_event"] += f" {texto_extra}"
            if identidade_ativada:
                state["last_event"] += f" Habilidade ativada: {identidade_ativada}."
            if combo_ativado:
                state["last_event"] += f" Combo ativado: {combo_ativado}."
    else:
        return {"error": "Ação desconhecida."}

    if state["status"] == "active" and not other["passed"]:
        state["turn"] = other_id
    elif state["status"] == "active" and other["passed"]:
        state["turn"] = uid
    if state["status"] == "active":
        _auto_pass_empty_hands(state)
    return _registrar_evento(state)


def calcular_delta_mmr(rating_a: int, rating_b: int, resultado_a: float, k_factor: int = 32) -> int:
    """Calcula a variação Elo do jogador A; o jogador B recebe o valor oposto."""
    rating_a = max(0, int(rating_a))
    rating_b = max(0, int(rating_b))
    resultado = float(resultado_a)
    if resultado not in (0.0, 0.5, 1.0):
        raise ValueError("resultado_a deve ser 0.0, 0.5 ou 1.0")
    k = max(1, int(k_factor))
    esperado_a = 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))
    return int(round(k * (resultado - esperado_a)))


def calcular_xp_partida(outcome: str, xp_recente: int = 0, limite_diario: int = 30) -> int:
    """Retorna XP da partida, respeitando o teto diário informado pelo chamador."""
    recompensas = {"win": 30, "draw": 20, "loss": 10}
    chave = str(outcome or "").strip().lower()
    if chave not in recompensas:
        raise ValueError("outcome deve ser 'win', 'draw' ou 'loss'")
    limite = max(0, int(limite_diario))
    acumulado = max(0, int(xp_recente))
    restante = max(0, limite - acumulado)
    return min(recompensas[chave], restante)
