"""Catálogo e regras puras do Cartas do Coliseu.

Todas as artes usam símbolos e geometria original; nenhum recurso visual de jogos
proprietários é incorporado ao catálogo.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import asdict, dataclass
from typing import Any

from levels import PATENTES

VERSAO_ARTES = 7

TIPOS = ("Destreza", "Força", "Magia")
EMOJIS_TIPO = {"Destreza": "🌀", "Força": "⚔️", "Magia": "🔮"}
CICLO_TIPOS = {"Destreza": "Força", "Força": "Magia", "Magia": "Destreza"}

RARIDADES = ("Comum", "Rara", "Épica", "Lendária", "Primordial")
PESOS_RARIDADE = {"Comum": 70, "Rara": 22, "Épica": 7, "Lendária": 1, "Primordial": 0}
CUSTO_RARIDADE = {"Comum": 1, "Rara": 2, "Épica": 3, "Lendária": 4, "Primordial": 4}
FAIXA_PODER = {
    "Comum": (3, 5),
    "Rara": (4, 6),
    "Épica": (5, 7),
    "Lendária": (6, 8),
    "Primordial": (8, 8),
}
ALMAS_DUPLICATA = {"Comum": 5, "Rara": 15, "Épica": 40, "Lendária": 100, "Primordial": 0}
CUSTO_FORJA = {"Comum": 40, "Rara": 120, "Épica": 320, "Lendária": 800, "Primordial": 0}
PRECO_PACOTE_FOGUEIRA = 120
CARTAS_POR_PACOTE = 3
PITY_CARTAS = 10

# Habilidades comuns: efeitos situacionais que permitem montar decks com estilos diferentes.
# As cinco habilidades Primordiais ficam separadas porque cada uma pertence a uma carta única.
HABILIDADES_COMUNS = (
    "primeira_luz", "retaliacao", "impeto", "ultimo_folego", "contragolpe",
    "encadeamento", "adaptacao", "sangue_frio", "instinto", "precisao",
    "drenagem", "cacador_arcano", "quebra_ritmo",
)
HABILIDADES_PRIMORDIAIS = (
    "lei_primeva", "decreto_soberano", "olho_tempestade", "fome_abismo", "paradoxo_eterno",
)

HABILIDADES: dict[str, dict[str, str]] = {
    "primeira_luz": {"nome": "Primeira Luz", "texto": "Recebe +1 de poder ao entrar na primeira rodada."},
    "retaliacao": {"nome": "Retaliação", "texto": "Recebe +1 de poder quando sua pontuação está abaixo da rival."},
    "impeto": {"nome": "Ímpeto", "texto": "Recebe +1 de poder quando sua pontuação está acima da rival."},
    "ultimo_folego": {"nome": "Último Fôlego", "texto": "Recebe +1 de poder na terceira rodada."},
    "contragolpe": {"nome": "Contragolpe", "texto": "Recebe +1 de poder quando sua pontuação está abaixo da rival."},
    "encadeamento": {"nome": "Encadeamento", "texto": "Recebe +2 ao jogar na mesma fileira da sua unidade anterior."},
    "adaptacao": {"nome": "Adaptação", "texto": "Recebe +1 ao jogar em uma fileira diferente da sua última unidade."},
    "sangue_frio": {"nome": "Sangue-frio", "texto": "Recebe +2 quando as pontuações atuais estão empatadas."},
    "instinto": {"nome": "Instinto", "texto": "Recebe +2 quando sua pontuação está abaixo da rival."},
    "precisao": {"nome": "Precisão", "texto": "Recebe +1 ao entrar na fileira de longa distância."},
    "drenagem": {"nome": "Drenagem", "texto": "Reduz em 1 o bônus de todas as unidades inimigas, até o limite de -2."},
    "cacador_arcano": {"nome": "Caçador Arcano", "texto": "Recebe +1 se o adversário controlar uma unidade do Conclave Arcano."},
    "quebra_ritmo": {"nome": "Quebra-ritmo", "texto": "Recebe +1 se o adversário jogou na mesma fileira em seu último turno."},
    # Efeitos exclusivos: somente a respectiva Primordial pode utilizá-los.
    "lei_primeva": {"nome": "Lei Primeva", "texto": "Recebe +2 de poder ao entrar na primeira rodada."},
    "decreto_soberano": {"nome": "Decreto Soberano", "texto": "Reduz em 2 o bônus de todas as unidades inimigas, até o limite de -2."},
    "olho_tempestade": {"nome": "Olho da Tempestade", "texto": "Recebe +2 quando sua fileira estiver sob efeito climático."},
    "fome_abismo": {"nome": "Fome do Abismo", "texto": "Recebe +2 quando sua pontuação está abaixo da rival."},
    "paradoxo_eterno": {"nome": "Paradoxo Eterno", "texto": "Recebe +2 na terceira rodada se o adversário venceu a segunda."},
    "guardiao_fileira": {"nome": "Guardião da Fileira", "texto": "+1 para cada outra unidade sua na mesma fileira, até +3."},
    "cacador_solitario": {"nome": "Caçador Solitário", "texto": "+2 se não houver outra unidade sua na fileira."},
    "estandarte": {"nome": "Estandarte", "texto": "Concede +1 às outras unidades aliadas da mesma fileira."},
    "resistencia_climatica": {"nome": "Resistência Climática", "texto": "Ignora até 2 pontos de penalidade climática."},
    "eco_arcano": {"nome": "Eco Arcano", "texto": "+2 se você tiver uma carta especial no descarte."},
    "gwent_nevoa": {"nome": "Névoa de Guerra", "texto": "Reduz em 2 o poder da fileira escolhida."},
    "gwent_geada": {"nome": "Geada Implacável", "texto": "Reduz em 1 o poder de todas as fileiras."},
    "gwent_chuva": {"nome": "Chuva de Ferro", "texto": "Reduz em 2 o poder da fileira de cerco."},
    "gwent_chifre": {"nome": "Chifre de Batalha", "texto": "Concede +2 às suas unidades na fileira escolhida."},
    "gwent_medico": {"nome": "Médico de Campanha", "texto": "Recupera uma unidade de poder 4 ou menos do descarte."},
    "gwent_queima": {"nome": "Queima Estratégica", "texto": "Remove a unidade mais forte de cada lado."},
    "gwent_purificar": {"nome": "Rito de Purificação", "texto": "Remove todos os efeitos climáticos."},
    "gwent_execucao": {"nome": "Sentença do Carrasco", "texto": "Elimina a unidade inimiga mais fraca da fileira escolhida."},
    "gwent_vinculo": {"nome": "Juramento de Sangue", "texto": "Concede +2 às suas unidades da fileira escolhida se houver pelo menos duas."},
    "gwent_batedor": {"nome": "Batedor do Véu", "texto": "Compra uma carta da reserva, se disponível."},
    "gwent_muralha": {"nome": "Muralha dos Ancestrais", "texto": "Concede +1 às suas unidades na fileira escolhida."},
    "dupla_fornalha": {"nome": "Pacto da Fornalha", "texto": "+2 se houver outra unidade de Força na mesma fileira."},
    "irmandade_veu": {"nome": "Formação do Véu", "texto": "+2 se houver uma unidade de Destreza em outra fileira."},
    "circulo_arcano": {"nome": "Círculo de Ressonância", "texto": "+2 se houver Magia aliada na mesma fileira ou especial no descarte."},
}


@dataclass(frozen=True, slots=True)
class Carta:
    id: str
    nome: str
    categoria: str
    tipo: str
    poder: int
    raridade: str
    custo: int
    habilidade: str
    descricao: str = ""
    jogo_origem: str = ""

    def para_dict(self) -> dict[str, Any]:
        """Serializa a carta no padrão atual do Gwent sem alterar seu ID histórico.

        categoria_arte preserva a identidade visual de origem para o renderizador;
        categoria passa a representar somente os tipos aceitos no Gwent.
        """
        data = asdict(self)
        categoria_origem = str(self.categoria or "Unidade")
        faccoes = {"Força": "Ordem de Ferro", "Destreza": "Errantes do Véu", "Magia": "Conclave Arcano"}
        fileiras = {"Força": "melee", "Destreza": "ranged", "Magia": "siege"}
        papeis = {
            "Chefe": "Elite", "Arma": "Combatente", "Magia": "Místico",
            "Covenant": "Aliado", "Jogo": "Campeão", "Patente": "Veterano",
            "Relíquia": "Primordial", "Especial": "Tática",
        }
        data["categoria_arte"] = categoria_origem
        data["categoria_origem"] = categoria_origem
        data["categoria"] = "Especial" if categoria_origem.casefold() == "especial" else "Unidade"
        data["faccao"] = faccoes.get(self.tipo, "Ordem de Ferro")
        data["fileira"] = fileiras.get(self.tipo, "melee")
        data["papel_gwent"] = papeis.get(categoria_origem, "Unidade")
        data["jogo_origem"] = self.jogo_origem
        return data


# Catálogo inicial. As cartas de jogos e patentes são geradas deterministicamente.
_CARTAS_BASE = [
    # Chefes
    Carta("chefe_guardiao_cinzas", "Guardião das Cinzas", "Chefe", "Força", 5, "Rara", 2, "quebra_ritmo"),
    Carta("chefe_dama_vazio", "Dama do Vazio", "Chefe", "Magia", 6, "Épica", 3, "ultimo_folego"),
    Carta("chefe_cervo_sombrio", "Cervo Sombrio", "Chefe", "Destreza", 4, "Comum", 1, "contragolpe"),
    Carta("chefe_rei_afogado", "Rei Afogado", "Chefe", "Força", 7, "Épica", 3, "primeira_luz"),
    Carta("chefe_oraculo_ruina", "Oráculo da Ruína", "Chefe", "Magia", 7, "Lendária", 4, "impeto"),
    Carta("chefe_cacador_sem_rosto", "Caçador sem Rosto", "Chefe", "Destreza", 5, "Rara", 2, "retaliacao"),
    Carta("chefe_vigia_cinzento", "Vigia Cinzento", "Chefe", "Força", 4, "Comum", 1, "drenagem"),
    Carta("chefe_aparicao_veio", "Aparição do Véu", "Chefe", "Destreza", 3, "Comum", 1, "adaptacao"),
    # Armas
    Carta("arma_lamina_peregrino", "Duelista do Peregrino", "Arma", "Destreza", 4, "Comum", 1, "primeira_luz"),
    Carta("arma_martelo_fornalha", "Ferreiro de Guerra da Fornalha", "Arma", "Força", 6, "Rara", 2, "encadeamento"),
    Carta("arma_cajado_marulho", "Oráculo do Marulho", "Arma", "Magia", 5, "Rara", 2, "cacador_arcano"),
    Carta("arma_duas_luas", "Dançarina das Duas Luas", "Arma", "Destreza", 7, "Épica", 3, "precisao"),
    Carta("arma_grande_sino", "Guardião do Sino de Ferro", "Arma", "Força", 8, "Lendária", 4, "instinto"),
    Carta("arma_agulha_astro", "Tecelã da Agulha Astral", "Arma", "Magia", 3, "Comum", 1, "primeira_luz"),
    Carta("arma_lanca_fornalha", "Lanceiro da Fornalha", "Arma", "Força", 4, "Comum", 1, "primeira_luz"),
    Carta("arma_arco_peregrino", "Batedor do Peregrino", "Arma", "Destreza", 5, "Comum", 1, "impeto"),
    # Magias
    Carta("magia_brasa_errante", "Piromante da Brasa Errante", "Magia", "Magia", 3, "Comum", 1, "sangue_frio"),
    Carta("magia_selo_vigilia", "Guardiã do Selo da Vigília", "Magia", "Destreza", 5, "Rara", 2, "adaptacao"),
    Carta("magia_trovao_oco", "Evocador do Trovão Oco", "Magia", "Força", 6, "Épica", 3, "drenagem"),
    Carta("magia_nevoa_antiga", "Oráculo da Névoa Antiga", "Magia", "Magia", 7, "Épica", 3, "encadeamento"),
    Carta("magia_sol_negro", "Arauto do Sol Negro", "Magia", "Magia", 8, "Lendária", 4, "quebra_ritmo"),
    Carta("magia_fagulha", "Acólita da Fagulha", "Magia", "Destreza", 4, "Comum", 1, "cacador_arcano"),
    Carta("magia_orbe_eco", "Guardião do Orbe do Eco", "Magia", "Magia", 4, "Comum", 1, "precisao"),
    Carta("magia_chama_fria", "Feiticeira da Chama Fria", "Magia", "Magia", 3, "Comum", 1, "sangue_frio"),
    # Covenants / juramentos
    Carta("covenant_lobos_cinza", "Lobos da Cinza", "Covenant", "Força", 5, "Rara", 2, "instinto"),
    Carta("covenant_lua_velada", "Lua Velada", "Covenant", "Destreza", 6, "Épica", 3, "primeira_luz"),
    Carta("covenant_sentinelas", "Sentinelas do Véu", "Covenant", "Magia", 4, "Comum", 1, "adaptacao"),
    Carta("covenant_coroa_abismo", "Coroa do Abismo", "Covenant", "Força", 7, "Lendária", 4, "drenagem"),
    Carta("covenant_ultimos", "Os Últimos Juramentados", "Covenant", "Destreza", 5, "Rara", 2, "ultimo_folego"),
    Carta("covenant_filhos_brasa", "Filhos da Brasa", "Covenant", "Força", 5, "Comum", 1, "contragolpe"),
    Carta("covenant_peregrinos_nevoa", "Peregrinos da Névoa", "Covenant", "Destreza", 4, "Comum", 1, "primeira_luz"),
    Carta("covenant_irmandade_ferro", "Irmandade de Ferro", "Covenant", "Força", 4, "Comum", 1, "retaliacao"),
    # Cartas especiais do modo Gwent: entram na coleção por recompensas/pacotes do Discord.
    Carta("gwent_especial_nevoa", "Névoa de Guerra", "Especial", "Magia", 0, "Rara", 2, "gwent_nevoa", "Reduz em 2 o poder de todas as unidades da fileira escolhida até o fim da rodada."),
    Carta("gwent_especial_geada", "Geada Implacável", "Especial", "Magia", 0, "Rara", 2, "gwent_geada", "Reduz em 1 o poder de todas as unidades das três fileiras até o fim da rodada."),
    Carta("gwent_especial_chuva", "Chuva de Ferro", "Especial", "Magia", 0, "Comum", 1, "gwent_chuva", "Reduz em 2 o poder das unidades da fileira de cerco até o fim da rodada."),
    Carta("gwent_especial_chifre", "Chifre de Batalha", "Especial", "Força", 0, "Épica", 3, "gwent_chifre", "Concede +2 de poder às suas unidades na fileira escolhida até o fim da rodada."),
    Carta("gwent_especial_medico", "Médico de Campanha", "Especial", "Destreza", 0, "Rara", 2, "gwent_medico", "Recupera para a mão uma unidade de poder 4 ou menos do seu descarte."),
    Carta("gwent_especial_queima", "Queima Estratégica", "Especial", "Magia", 0, "Épica", 3, "gwent_queima", "Remove a unidade mais forte de cada lado do campo."),
    Carta("gwent_especial_purificar", "Rito de Purificação", "Especial", "Magia", 0, "Rara", 2, "gwent_purificar", "Remove todos os efeitos climáticos das três fileiras."),
    Carta("gwent_especial_execucao", "Sentença do Carrasco", "Especial", "Força", 0, "Épica", 3, "gwent_execucao", "Elimina a unidade inimiga mais fraca da fileira escolhida."),
    Carta("gwent_especial_vinculo", "Juramento de Sangue", "Especial", "Força", 0, "Rara", 2, "gwent_vinculo", "Concede +2 às suas unidades da fileira escolhida se houver pelo menos duas."),
    Carta("gwent_especial_batedor", "Batedor do Véu", "Especial", "Destreza", 0, "Rara", 2, "gwent_batedor", "Compra uma carta da reserva para sua mão, se ainda houver."),
    Carta("gwent_especial_muralha", "Muralha dos Ancestrais", "Especial", "Força", 0, "Comum", 1, "gwent_muralha", "Concede +1 às suas unidades na fileira escolhida."),
    # Novas unidades de facção e sinergia.
    Carta("gwent_unidade_baluarte", "Baluarte da Fornalha", "Chefe", "Força", 6, "Rara", 2, "guardiao_fileira", "Quanto maior a formação aliada, mais difícil é derrubá-lo."),
    Carta("gwent_unidade_lamina_sem_juramento", "Lâmina sem Juramento", "Arma", "Destreza", 6, "Rara", 2, "cacador_solitario", "Ataca melhor quando opera sem apoio na fileira."),
    Carta("gwent_unidade_portaestandarte", "Porta-estandarte de Ferro", "Covenant", "Força", 4, "Comum", 1, "estandarte", "Fortalece as demais unidades aliadas na mesma fileira."),
    Carta("gwent_unidade_oraculo_clima", "Oráculo das Chuvas", "Magia", "Magia", 5, "Rara", 2, "resistencia_climatica", "Sua visão atravessa tempestades e geadas."),
    Carta("gwent_unidade_eco", "Arauto do Eco", "Magia", "Magia", 5, "Rara", 2, "eco_arcano", "Canaliza o poder das cartas especiais já utilizadas."),
    Carta("gwent_unidade_cavaleira", "Cavaleira do Véu Partido", "Chefe", "Destreza", 5, "Comum", 1, "quebra_ritmo", "Uma duelista que pune movimentos previsíveis."),
    Carta("gwent_unidade_gigante", "Gigante do Portão Antigo", "Chefe", "Força", 7, "Épica", 3, "instinto", "Uma presença colossal na linha de frente."),
    Carta("gwent_unidade_cartografa", "Cartógrafa das Marés", "Covenant", "Destreza", 4, "Comum", 1, "adaptacao", "Encontra rotas onde os outros veem obstáculos."),
    Carta("gwent_unidade_invocador", "Invocador do Sol Negro", "Magia", "Magia", 7, "Épica", 3, "cacador_arcano", "Converte conhecimento arcano em força de combate."),
    Carta("gwent_unidade_mestre_forja", "Mestre da Forja Rubra", "Chefe", "Força", 5, "Rara", 2, "dupla_fornalha", "Luta melhor ao lado de outra unidade da Ordem de Ferro."),
    Carta("gwent_unidade_dupla_veu", "Gêmea das Passagens", "Covenant", "Destreza", 5, "Rara", 2, "irmandade_veu", "Coordena ataques com aliados posicionados em outra fileira."),
    Carta("gwent_unidade_circulo", "Adepto do Círculo", "Magia", "Magia", 5, "Rara", 2, "circulo_arcano", "Amplifica a magia quando encontra aliados ou resíduos arcanos."),
]

CARTAS_PRIMORDIAIS = [
    Carta("primordial_origem", "Avatar da Origem Inominável", "Relíquia", "Magia", 8, "Primordial", 4, "lei_primeva", "Única do servidor. Sua habilidade é a Lei Primeva."),
    Carta("primordial_trono", "Soberano do Primeiro Trono", "Relíquia", "Força", 8, "Primordial", 4, "decreto_soberano", "Única do servidor. Seu decreto enfraquece a vantagem de tipo rival."),
    Carta("primordial_tempestade", "Arauto do Coração da Tempestade", "Relíquia", "Destreza", 8, "Primordial", 4, "olho_tempestade", "Única do servidor. Amplifica a vantagem de tipo."),
    Carta("primordial_abismo", "Entidade do Abismo Onírico", "Relíquia", "Magia", 8, "Primordial", 4, "fome_abismo", "Única do servidor. Cresce quando está atrás no confronto."),
    Carta("primordial_eternidade", "Guardião da Eternidade Partida", "Relíquia", "Força", 8, "Primordial", 4, "paradoxo_eterno", "Única do servidor. Pode inverter a última rodada."),
]
CARTAS_POR_ID: dict[str, Carta] = {c.id: c for c in [*_CARTAS_BASE, *CARTAS_PRIMORDIAIS]}


def slug_jogo(nome: str) -> str:
    normalizado = unicodedata.normalize("NFKD", str(nome or ""))
    ascii_nome = "".join(ch for ch in normalizado if not unicodedata.combining(ch)).lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_nome).strip("_") or "jogo_sem_nome"
    # Sufixo estável evita colisões entre títulos que normalizam para o mesmo slug.
    suffix = hashlib.sha256(str(nome or "").casefold().encode("utf-8")).hexdigest()[:6]
    return f"{slug[:62]}_{suffix}"


def _hash_int(valor: str) -> int:
    return int.from_bytes(hashlib.sha256(valor.encode("utf-8")).digest()[:8], "big")


def carta_jogo(nome_jogo: str, marco: str) -> Carta:
    """Gera carta fixa por jogo/marco: zerado e platina nunca compartilham ID."""
    marco = "platina" if str(marco).lower() == "platina" else "zerado"
    slug = slug_jogo(nome_jogo)
    seed = f"{slug}:{marco}:soulsbot-card-v1"
    n = _hash_int(seed)
    tipo = TIPOS[n % len(TIPOS)]
    habilidade = HABILIDADES_COMUNS[(n // 7) % len(HABILIDADES_COMUNS)]
    if marco == "zerado":
        raridade = "Rara"
        minimo, maximo = FAIXA_PODER[raridade]
        poder = minimo + ((n // 11) % (maximo - minimo + 1))
        sufixo = "Alma Desperta"
    else:
        raridade = "Épica"
        minimo, maximo = FAIXA_PODER[raridade]
        poder = minimo + ((n // 13) % (maximo - minimo + 1))
        sufixo = "Eco da Platina"
    titulo = str(nome_jogo or "Jogo")[:62]
    return Carta(
        id=f"jogo_{slug}_{marco}",
        nome=f"Campeão de {titulo} — {sufixo}"[:95],
        categoria="Jogo",
        tipo=tipo,
        poder=int(poder),
        raridade=raridade,
        custo=CUSTO_RARIDADE[raridade],
        habilidade=habilidade,
        descricao=f"Carta exclusiva por {('zerar' if marco == 'zerado' else 'platinar')} {titulo}.",
        jogo_origem=titulo,
    )


def carta_patente(indice: int, nivel_minimo: int, nome_patente: str) -> Carta:
    seed = f"patente:{indice}:{nome_patente}:soulsbot-card-v1"
    n = _hash_int(seed)
    if nivel_minimo >= 75:
        raridade = "Lendária"
    elif nivel_minimo >= 30:
        raridade = "Épica"
    elif nivel_minimo >= 10:
        raridade = "Rara"
    else:
        raridade = "Comum"
    minimo, maximo = FAIXA_PODER[raridade]
    poder = minimo + (n % (maximo - minimo + 1))
    tipo = TIPOS[(n // 9) % len(TIPOS)]
    habilidade = HABILIDADES_COMUNS[(n // 17) % len(HABILIDADES_COMUNS)]
    card_id = f"patente_{indice + 1}"
    return Carta(
        id=card_id,
        nome=f"Veterano da Ordem — {nome_patente}"[:95],
        categoria="Patente",
        tipo=tipo,
        poder=int(poder),
        raridade=raridade,
        custo=CUSTO_RARIDADE[raridade],
        habilidade=habilidade,
        descricao=f"Desbloqueada ao alcançar o nível {nivel_minimo}.",
    )


CARTAS_PATENTE = [carta_patente(i, nivel, nome) for i, (nivel, nome) in enumerate(PATENTES)]
CARTAS_POR_ID.update({c.id: c for c in CARTAS_PATENTE})

# Pacotes não entregam cartas de patente ou de jogos: essas são recompensas de marcos.
CARTAS_PACOTE = [c for c in _CARTAS_BASE]
CARTAS_PACOTE_POR_RARIDADE = {
    raridade: [c for c in [*CARTAS_PACOTE, *CARTAS_PRIMORDIAIS] if c.raridade == raridade]
    for raridade in RARIDADES
}


def get_carta(card_id: str) -> Carta | None:
    if card_id in CARTAS_POR_ID:
        return CARTAS_POR_ID[card_id]
    if str(card_id).startswith("jogo_"):
        m = re.fullmatch(r"jogo_(.+)_(zerado|platina)", str(card_id))
        if m:
            slug, marco = m.groups()
            # O slug não é reversível em nome original; a função é usada após
            # carregar o snapshot persistido ou com o nome de jogo do registro.
            return None
    return None


def carta_de_jogo_por_id(card_id: str, nome_jogo: str) -> Carta:
    carta = carta_jogo(nome_jogo, "platina" if str(card_id).endswith("_platina") else "zerado")
    if carta.id != card_id:
        raise ValueError("ID de carta de jogo não corresponde ao título armazenado.")
    return carta


def carta_dict(card_id: str, nome_jogo: str | None = None) -> dict[str, Any] | None:
    carta = get_carta(card_id)
    if carta is None and card_id.startswith("jogo_") and nome_jogo:
        try:
            carta = carta_de_jogo_por_id(card_id, nome_jogo)
        except ValueError:
            return None
    return carta.para_dict() if carta else None


def vantagem_tipo(tipo_a: str, tipo_b: str) -> int:
    """Retorna +3 se A vence B, -3 se B vence A, ou 0."""
    if CICLO_TIPOS.get(tipo_a) == tipo_b:
        return 3
    if CICLO_TIPOS.get(tipo_b) == tipo_a:
        return -3
    return 0


def _efeito_habilidade(
    carta: dict[str, Any], round_no: int, resultado_anterior: str | None,
    tem_desvantagem: bool, tem_vantagem: bool, *, tipo_anterior: str | None = None,
    tipo_oponente: str | None = None, tipo_anterior_oponente: str | None = None,
    poder_oponente: int | None = None,
) -> dict[str, Any]:
    """Calcula o efeito da habilidade sem alterar o estado do duelo."""
    habilidade = str(carta.get("habilidade", ""))
    poder_proprio = int(carta.get("poder", 0) or 0)
    poder_rival = int(poder_oponente if poder_oponente is not None else poder_proprio)
    bonus = 0
    reducao_tipo_rival = 0
    ativada = False

    if habilidade == "primeira_luz" and round_no == 1:
        bonus, ativada = 1, True
    elif habilidade == "retaliacao" and resultado_anterior == "perdeu":
        bonus, ativada = 1, True
    elif habilidade == "impeto" and resultado_anterior == "venceu":
        bonus, ativada = 1, True
    elif habilidade == "ultimo_folego" and round_no == 5:
        bonus, ativada = 1, True
    elif habilidade == "contragolpe" and tem_desvantagem:
        bonus, ativada = 1, True
    elif habilidade == "encadeamento" and resultado_anterior == "venceu" and tipo_anterior == carta.get("tipo"):
        bonus, ativada = 2, True
    elif habilidade == "adaptacao" and tipo_anterior and tipo_anterior != carta.get("tipo"):
        bonus, ativada = 1, True
    elif habilidade == "sangue_frio" and resultado_anterior == "empatou":
        bonus, ativada = 2, True
    elif habilidade == "instinto" and poder_proprio <= poder_rival - 2:
        bonus, ativada = 1, True
    elif habilidade == "precisao" and round_no in (2, 4):
        bonus, ativada = 1, True
    elif habilidade == "drenagem" and tem_desvantagem:
        reducao_tipo_rival, ativada = 1, True
    elif habilidade == "cacador_arcano" and tipo_oponente == "Magia":
        bonus, ativada = 1, True
    elif habilidade == "quebra_ritmo" and tipo_anterior_oponente and tipo_oponente == tipo_anterior_oponente:
        bonus, ativada = 1, True
    elif habilidade == "lei_primeva" and round_no == 1:
        bonus, ativada = 2, True
    elif habilidade == "decreto_soberano" and tem_desvantagem:
        reducao_tipo_rival, ativada = 2, True
    elif habilidade == "olho_tempestade" and tem_vantagem:
        bonus, ativada = 2, True
    elif habilidade == "fome_abismo" and (tem_desvantagem or poder_proprio <= poder_rival - 2):
        bonus, ativada = 2, True
    elif habilidade == "paradoxo_eterno" and round_no == 5 and resultado_anterior == "perdeu":
        bonus, ativada = 2, True

    nome = HABILIDADES.get(habilidade, {}).get("nome", "Habilidade")
    detalhes = ""
    if ativada:
        partes = []
        if bonus:
            partes.append(f"+{bonus} de poder")
        if reducao_tipo_rival:
            partes.append(f"- {reducao_tipo_rival} no bônus de tipo rival")
        detalhes = f"{nome}: " + "; ".join(partes)
    return {
        "bonus": bonus,
        "reducao_tipo_rival": reducao_tipo_rival,
        "ativada": ativada,
        "texto": detalhes,
    }


def _bonus_triada_elemental(
    tipos_anteriores: list[str] | tuple[str, ...] | None,
    tipo_atual: str,
    combo_ja_usado: bool,
) -> dict[str, Any]:
    """Premia uma única vez a primeira sequência que completa os três tipos.

    A tríade exige que o jogador já tenha usado exatamente dois tipos diferentes e
    escolha o terceiro. O bônus é pequeno e limitado a uma ativação por duelo, para
    recompensar planejamento sem criar uma vantagem acumulativa.
    """
    usados = {str(tipo) for tipo in (tipos_anteriores or ()) if str(tipo) in TIPOS}
    if not combo_ja_usado and len(usados) == 2 and tipo_atual in TIPOS and tipo_atual not in usados:
        return {
            "bonus": 2,
            "nome": "Tríade Elemental",
            "texto": "Tríade Elemental: +2 de poder ao completar Destreza, Força e Magia (uma vez por duelo).",
        }
    return {"bonus": 0, "nome": "", "texto": ""}


def resolver_rodada(
    carta_a: dict[str, Any], carta_b: dict[str, Any], round_no: int,
    resultado_a_anterior: str | None, resultado_b_anterior: str | None,
    tipo_anterior_a: str | None = None, tipo_anterior_b: str | None = None,
    *, tipos_anteriores_a: list[str] | tuple[str, ...] | None = None,
    tipos_anteriores_b: list[str] | tuple[str, ...] | None = None,
    combo_ja_usado_a: bool = False, combo_ja_usado_b: bool = False,
) -> dict[str, Any]:
    """Resolve o confronto no servidor; habilidades e combos são calculados aqui."""
    vantagem_a = vantagem_tipo(carta_a["tipo"], carta_b["tipo"])
    tipo_a_base = max(0, vantagem_a)
    tipo_b_base = max(0, -vantagem_a)
    efeito_a = _efeito_habilidade(
        carta_a, round_no, resultado_a_anterior, vantagem_a < 0, vantagem_a > 0,
        tipo_anterior=tipo_anterior_a, tipo_oponente=carta_b.get("tipo"),
        tipo_anterior_oponente=tipo_anterior_b, poder_oponente=int(carta_b.get("poder", 0) or 0),
    )
    efeito_b = _efeito_habilidade(
        carta_b, round_no, resultado_b_anterior, vantagem_a > 0, vantagem_a < 0,
        tipo_anterior=tipo_anterior_b, tipo_oponente=carta_a.get("tipo"),
        tipo_anterior_oponente=tipo_anterior_a, poder_oponente=int(carta_a.get("poder", 0) or 0),
    )
    # A redução é aplicada ao bônus de tipo do adversário, nunca abaixo de zero.
    tipo_a = max(0, tipo_a_base - int(efeito_b["reducao_tipo_rival"]))
    tipo_b = max(0, tipo_b_base - int(efeito_a["reducao_tipo_rival"]))
    habilidade_a = int(efeito_a["bonus"])
    habilidade_b = int(efeito_b["bonus"])
    combo_a = _bonus_triada_elemental(tipos_anteriores_a, str(carta_a.get("tipo", "")), combo_ja_usado_a)
    combo_b = _bonus_triada_elemental(tipos_anteriores_b, str(carta_b.get("tipo", "")), combo_ja_usado_b)
    combo_bonus_a = int(combo_a["bonus"])
    combo_bonus_b = int(combo_b["bonus"])
    poder_a = int(carta_a["poder"]) + tipo_a + habilidade_a + combo_bonus_a
    poder_b = int(carta_b["poder"]) + tipo_b + habilidade_b + combo_bonus_b
    vencedor = "a" if poder_a > poder_b else "b" if poder_b > poder_a else "empate"
    return {
        "power_a": poder_a,
        "power_b": poder_b,
        "type_bonus_a": tipo_a,
        "type_bonus_b": tipo_b,
        "skill_bonus_a": habilidade_a,
        "skill_bonus_b": habilidade_b,
        "skill_text_a": efeito_a["texto"],
        "skill_text_b": efeito_b["texto"],
        "combo_bonus_a": combo_bonus_a,
        "combo_bonus_b": combo_bonus_b,
        "combo_name_a": str(combo_a["nome"]),
        "combo_name_b": str(combo_b["nome"]),
        "combo_text_a": str(combo_a["texto"]),
        "combo_text_b": str(combo_b["texto"]),
        "winner": vencedor,
    }

def narrar_rodada(round_no: int, carta_a: dict[str, Any], carta_b: dict[str, Any], resultado: dict[str, Any]) -> str:
    """Narração local determinística e curta; não chama IA nem serviços externos."""
    nomes = [
        "As lâminas se cruzam e a arena prende a respiração.",
        "A fogueira estala enquanto os poderes colidem.",
        "Um movimento calculado muda o ritmo do confronto.",
        "A arquibancada sente que a decisão se aproxima.",
        "Última rodada. Não há espaço para hesitação.",
    ]
    texto = nomes[min(max(round_no - 1, 0), 4)]
    if resultado["winner"] == "a":
        decisao = f"**{carta_a['nome']}** supera **{carta_b['nome']}**."
    elif resultado["winner"] == "b":
        decisao = f"**{carta_b['nome']}** supera **{carta_a['nome']}**."
    else:
        decisao = f"**{carta_a['nome']}** e **{carta_b['nome']}** empatam."
    efeitos = []
    if resultado.get("skill_text_a"):
        efeitos.append(f"**{carta_a['nome']}** ativa {resultado['skill_text_a']}.")
    if resultado.get("skill_text_b"):
        efeitos.append(f"**{carta_b['nome']}** ativa {resultado['skill_text_b']}.")
    if resultado.get("combo_text_a"):
        efeitos.append(f"✨ **{carta_a['nome']}** ativa o combo {resultado['combo_text_a']}.")
    if resultado.get("combo_text_b"):
        efeitos.append(f"✨ **{carta_b['nome']}** ativa o combo {resultado['combo_text_b']}.")
    if resultado.get("match_note"):
        efeitos.append(f"🏟️ **{resultado['match_note']}**")
    complemento = "\n" + "\n".join(efeitos) if efeitos else ""
    return f"{texto}\n{decisao}{complemento}"


def vencedor_matematicamente_garantido(
    vitorias_a: int,
    vitorias_b: int,
    rodada_atual: int,
    total_rodadas: int = 5,
) -> str | None:
    """Retorna o lado que já não pode ser alcançado, ou None se a partida segue."""
    restantes = max(0, int(total_rodadas) - int(rodada_atual))
    a, b = int(vitorias_a), int(vitorias_b)
    if a > b + restantes:
        return "a"
    if b > a + restantes:
        return "b"
    return None


def poder_total_deck(cards: list[dict[str, Any]]) -> int:
    """Soma o poder base das cinco cartas para pareamento de força aproximada."""
    return sum(int(c.get("poder", 0)) for c in cards)


def cards_em_deck_validos(cards: list[dict[str, Any]]) -> tuple[bool, str]:
    if len(cards) != 5:
        return False, "O deck precisa ter exatamente cinco cartas."
    if any(str(c.get("categoria", "")).casefold() == "especial" for c in cards):
        return False, "Cartas especiais são exclusivas da Arena Gwent."
    ids = [c["id"] for c in cards]
    if len(set(ids)) != 5:
        return False, "Não é permitido repetir uma carta no mesmo deck."
    custo = sum(int(c["custo"]) for c in cards)
    if custo > 12:
        return False, f"Seu deck custa {custo} pontos; o limite é 12."
    lendarias = sum(1 for c in cards if c["raridade"] == "Lendária")
    if lendarias > 1:
        return False, "O deck pode conter no máximo uma carta Lendária."
    return True, "Deck válido."
