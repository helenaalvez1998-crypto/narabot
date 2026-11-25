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

VERSAO_ARTES = 20

TIPOS = ("Destreza", "Força", "Magia")

RARIDADES = ("Comum", "Rara", "Épica", "Lendária", "Mítica", "Primordial", "Singular")
PESOS_RARIDADE = {"Comum": 69.47, "Rara": 22.02, "Épica": 7.01, "Lendária": 1.00, "Mítica": 0.50, "Primordial": 0.0, "Singular": 0.0}
CUSTO_RARIDADE = {"Comum": 1, "Rara": 2, "Épica": 3, "Lendária": 4, "Mítica": 5, "Primordial": 6, "Singular": 0}
FAIXA_PODER = {
    "Comum": (3, 5),
    "Rara": (4, 6),
    "Épica": (5, 7),
    "Lendária": (6, 8),
    "Mítica": (8, 9),
    "Primordial": (8, 9),
    "Singular": (8, 10),
}
ALMAS_DUPLICATA = {"Comum": 5, "Rara": 15, "Épica": 40, "Lendária": 100, "Mítica": 180, "Primordial": 250, "Singular": 0}
BONUS_EVOLUCAO_FRAGMENTOS = {"Comum": 20, "Rara": 40, "Épica": 80, "Lendária": 160}
CUSTO_APRIMORAMENTO_ALMAS = {"Comum": 10, "Rara": 20, "Épica": 40, "Lendária": 80, "Mítica": 150, "Primordial": 250}


def limite_poder_modelo(carta: "Carta") -> int:
    """Teto individual do modelo: parte do poder-base e nunca ultrapassa 12."""
    if str(getattr(carta, "categoria", "")).casefold() == "especial":
        return 0
    return min(12, max(5, int(getattr(carta, "poder", 1)) + 6))


def faixa_poder_exemplar(carta: "Carta", raridade: str) -> tuple[int, int]:
    """Faixa inicial da raridade limitada pelo teto próprio do modelo."""
    if str(getattr(carta, "categoria", "")).casefold() == "especial":
        return (0, 0)
    minimo, maximo = FAIXA_PODER.get(str(raridade), FAIXA_PODER["Comum"])
    maximo = min(int(maximo), limite_poder_modelo(carta))
    minimo = min(int(minimo), maximo)
    return (minimo, maximo)
CUSTO_FORJA = {"Comum": 0, "Rara": 0, "Épica": 0, "Lendária": 0, "Mítica": 0, "Primordial": 0, "Singular": 0}
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
    "cacador_arcano": {"nome": "Caçador Arcano", "texto": "Recebe +1 se o adversário controlar uma unidade do Conclave da Lua Escura ou alguma unidade com bônus positivo."},
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
    "resistencia_climatica": {"nome": "Resistência Climática", "texto": "Ignora até 2 pontos de penalidade climática; sem clima ativo ao entrar, recebe +1."},
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
    "vinganca": {"nome": "Vingança", "texto": "Ao cair, concede +1 às unidades aliadas da mesma fileira."},
    "escudo_ferro": {"nome": "Escudo de Ferro", "texto": "Entra com escudo: ignora a primeira remoção sofrida."},
    "ressurgir": {"nome": "Ressurgir", "texto": "Ao entrar, traz do descarte a unidade mais forte de poder 5 ou menos direto ao campo."},
    "devorar": {"nome": "Devorar", "texto": "Ao entrar, consome a unidade aliada mais fraca da fileira e ganha seu poder (até +4)."},
    "sobrevivente": {"nome": "Sobrevivente", "texto": "Ao fim da rodada, permanece no campo (a mais forte, se houver várias)."},
    "espolios": {"nome": "Espólios", "texto": "Se você vencer a rodada com ela em campo, compra uma carta."},
    "gwent_egide": {"nome": "Égide de Campanha", "texto": "Concede escudo a uma unidade sua."},
    "gwent_requiem": {"nome": "Réquiem dos Caídos", "texto": "Traz do descarte, direto ao campo, uma unidade de poder 6 ou menos."},
    "gwent_passo": {"nome": "Passo Sombrio", "texto": "Move uma unidade sua para a fileira escolhida."},
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
        """Serializa somente campos canônicos do Gwent; nunca expõe categorias antigas."""
        data = asdict(self)
        faccoes = {"Força": "Ordens de Lorainne", "Destreza": "Não-Mortos do Véu", "Magia": "Conclave da Lua Escura"}
        fileiras = {"Força": "melee", "Destreza": "ranged", "Magia": "siege"}
        papeis = {
            ("Força", "melee"): "Vanguarda",
            ("Força", "ranged"): "Batedor de Guerra",
            ("Força", "siege"): "Artilheiro",
            ("Destreza", "melee"): "Duelista",
            ("Destreza", "ranged"): "Batedor",
            ("Destreza", "siege"): "Atirador de Elite",
            ("Magia", "melee"): "Guardião Rúnico",
            ("Magia", "ranged"): "Invocador",
            ("Magia", "siege"): "Arcanista",
        }
        especial = str(self.categoria or "").casefold() == "especial"
        faccao = faccoes.get(self.tipo, "Ordens de Lorainne")
        fileira = fileiras.get(self.tipo, "melee")
        data.update({
            "categoria": "Especial" if especial else "Unidade",
            "faccao": faccao,
            "fileira": fileira,
            "papel_gwent": "Tática" if especial else papeis[(self.tipo, fileira)],
            # Campos de compatibilidade não carregam mais nomes de categorias antigas.
            "categoria_arte": "Especial" if especial else "Unidade",
            "categoria_origem": "Especial" if especial else "Unidade",
            "jogo_origem": "",
        })
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
    Carta("gwent_unidade_mestre_forja", "Mestre da Forja Rubra", "Chefe", "Força", 5, "Rara", 2, "dupla_fornalha", "Luta melhor ao lado de outra unidade da Ordens de Lorainne."),
    Carta("gwent_unidade_dupla_veu", "Gêmea das Passagens", "Covenant", "Destreza", 5, "Rara", 2, "irmandade_veu", "Coordena ataques com aliados posicionados em outra fileira."),
    Carta("gwent_unidade_circulo", "Adepto do Círculo", "Magia", "Magia", 5, "Rara", 2, "circulo_arcano", "Amplifica a magia quando encontra aliados ou resíduos arcanos."),

    # Etapa 2: unidades de facção que usam os efeitos de ciclo de vida (escudo, queda, ressurreição...).
    # Ordens de Lorainne — muralha (escudo/sobrevivência/vingança) e banquete (devorar/espólios).
    Carta("gwent_unidade_sentinela_rubra", "Sentinela da Muralha Rubra", "Covenant", "Força", 4, "Comum", 1, "escudo_ferro", "Primeira a receber o golpe, última a recuar."),
    Carta("gwent_unidade_veterano_cercos", "Veterano de Mil Cercos", "Chefe", "Força", 5, "Rara", 2, "sobrevivente", "Já viu mais muralhas caírem do que rostos conhecidos."),
    Carta("gwent_unidade_herdeiro_portao", "Herdeiro do Último Portão", "Chefe", "Força", 6, "Épica", 3, "vinganca", "Quando cai, a formação inteira jura vingá-lo."),
    Carta("gwent_unidade_carniceiro_forja", "Carniceiro da Forja Sombria", "Arma", "Força", 4, "Rara", 2, "devorar", "Alimenta a fornalha com o que a guerra deixa para trás."),
    Carta("gwent_unidade_intendente", "Intendente da Vanguarda", "Covenant", "Força", 3, "Comum", 1, "espolios", "Cada vitória enche os depósitos da Ordem."),
    # Não-Mortos do Véu — fantasmas (retorno e persistência) e caravana (saque e blindagem).
    Carta("gwent_unidade_cacadora_fantasma", "Caçadora Fantasma", "Chefe", "Destreza", 5, "Rara", 2, "sobrevivente", "Some na névoa e reaparece quando a próxima rodada começa."),
    Carta("gwent_unidade_cantora_lamentos", "Cantora dos Lamentos", "Covenant", "Destreza", 4, "Rara", 2, "ressurgir", "Seu canto arrasta os caídos de volta ao campo."),
    Carta("gwent_unidade_senhor_cacada", "Senhor da Última Caçada", "Chefe", "Destreza", 6, "Épica", 3, "vinganca", "A presa que o derruba desperta a matilha inteira."),
    Carta("gwent_unidade_saqueadora_veu", "Saqueadora do Véu", "Arma", "Destreza", 4, "Comum", 1, "espolios", "Nenhuma rota é cara demais para quem leva o butim."),
    Carta("gwent_unidade_contrabandista", "Contrabandista das Rotas", "Covenant", "Destreza", 4, "Comum", 1, "escudo_ferro", "Sempre tem um truque guardado para a primeira emboscada."),
    # Conclave da Lua Escura — rúnico (proteção e retorno) e eclipse (consumo e conhecimento).
    Carta("gwent_unidade_guardiao_runas", "Guardião das Runas Antigas", "Magia", "Magia", 5, "Comum", 1, "escudo_ferro", "Runas gravadas na pele desviam o primeiro feitiço."),
    Carta("gwent_unidade_necromante", "Necromante de Cinzas Frias", "Magia", "Magia", 4, "Rara", 2, "ressurgir", "Desperta no campo os que o descarte ainda guarda."),
    Carta("gwent_unidade_detonador", "Detonador de Relíquias", "Arma", "Magia", 6, "Épica", 3, "vinganca", "Sua queda libera a energia que ele guardava."),
    Carta("gwent_unidade_devorador_mana", "Devorador de Mana", "Magia", "Magia", 5, "Rara", 2, "devorar", "Consome aliados menores para alimentar o eclipse."),
    Carta("gwent_unidade_bibliotecaria", "Bibliotecária do Eclipse", "Covenant", "Magia", 4, "Comum", 1, "espolios", "O conhecimento reunido na guerra vale mais que ouro."),

    # Etapa 2: cartas especiais novas (todas funcionam sem alvo escolhido; `target_id` apenas refina).
    Carta("gwent_especial_egide", "Égide de Campanha", "Especial", "Força", 0, "Rara", 2, "gwent_egide", "Concede escudo a uma unidade sua (a escolhida, ou a mais forte sem escudo)."),
    Carta("gwent_especial_requiem", "Réquiem dos Caídos", "Especial", "Magia", 0, "Épica", 3, "gwent_requiem", "Traz direto ao campo uma unidade de poder 6 ou menos do seu descarte (a escolhida, ou a mais forte)."),
    Carta("gwent_especial_passo", "Passo Sombrio", "Especial", "Destreza", 0, "Rara", 2, "gwent_passo", "Move uma unidade sua para a fileira escolhida (a escolhida, ou a mais fraca fora dela)."),
    Carta("gwent_mitica_coroa", "Herdeiro da Coroa Velada", "Relíquia", "Força", 8, "Mítica", 5, "estandarte", "Uma presença mítica que fortalece a formação aliada."),
    Carta("gwent_singular_primeiro", "O Primeiro Juramento", "Relíquia", "Destreza", 10, "Singular", 0, "cacador_solitario", "Exemplar singular conquistado por um feito extraordinário."),
    Carta("gwent_singular_intocavel", "A Lâmina Intocada", "Relíquia", "Destreza", 9, "Singular", 0, "precisao", "Conquistada ao concluir um desafio sem sofrer dano."),
    Carta("gwent_singular_nivel1", "A Vontade Inquebrável", "Relíquia", "Força", 10, "Singular", 0, "ultimo_folego", "Conquistada ao vencer um desafio no nível um."),
    Carta("gwent_singular_cacador_chefes", "A Coroa dos Vencidos", "Relíquia", "Magia", 9, "Singular", 0, "paradoxo_eterno", "Conquistada ao derrotar todos os chefes de um desafio."),
]

CARTAS_PRIMORDIAIS = [
    Carta("primordial_origem", "Avatar da Origem Inominável", "Relíquia", "Magia", 8, "Primordial", 4, "lei_primeva", "Uma cópia por jogador. Sua habilidade é a Lei Primeva."),
    Carta("primordial_trono", "Soberano do Primeiro Trono", "Relíquia", "Força", 8, "Primordial", 4, "decreto_soberano", "Uma cópia por jogador. Seu decreto enfraquece a vantagem de tipo rival."),
    Carta("primordial_tempestade", "Arauto do Coração da Tempestade", "Relíquia", "Destreza", 8, "Primordial", 4, "olho_tempestade", "Uma cópia por jogador. Amplifica a vantagem de tipo."),
    Carta("primordial_abismo", "Entidade do Abismo Onírico", "Relíquia", "Magia", 8, "Primordial", 4, "fome_abismo", "Uma cópia por jogador. Cresce quando está atrás no confronto."),
    Carta("primordial_eternidade", "Guardião da Eternidade Partida", "Relíquia", "Força", 8, "Primordial", 4, "paradoxo_eterno", "Uma cópia por jogador. Pode inverter a última rodada."),
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
    """Gera recompensa temática do universo Gwent sem expor o título do jogo externo."""
    marco = "platina" if str(marco).lower() == "platina" else "zerado"
    slug = slug_jogo(nome_jogo)
    n = _hash_int(f"{slug}:{marco}:gwent-reward-v2")
    tipo = TIPOS[n % len(TIPOS)]
    habilidade = HABILIDADES_COMUNS[(n // 7) % len(HABILIDADES_COMUNS)]
    raridade = "Épica" if marco == "platina" else "Rara"
    minimo, maximo = FAIXA_PODER[raridade]
    poder = minimo + ((n // 11) % (maximo - minimo + 1))
    nomes = {
        "Força": ("Campeão da Fornalha", "Vanguarda de Ferro", "Juramentado da Coroa"),
        "Destreza": ("Lâmina Errante", "Batedor do Véu", "Dançarina das Cinzas"),
        "Magia": ("Oráculo do Eclipse", "Invocador Astral", "Guardião das Runas"),
    }
    epitetos = ("da Aurora", "do Último Bastião", "das Sete Chamas", "do Véu Partido", "da Vigília")
    titulo = nomes[tipo][(n // 13) % len(nomes[tipo])] + " " + epitetos[(n // 19) % len(epitetos)]
    return Carta(
        id=f"jogo_{slug}_{marco}", nome=titulo[:95], categoria="Chefe", tipo=tipo,
        poder=int(poder), raridade=raridade, custo=CUSTO_RARIDADE[raridade],
        habilidade=habilidade,
        descricao=("Recompensa de domínio: unidade de elite do Gwent." if marco == "platina"
                   else "Recompensa de conquista: unidade veterana do Gwent."),
        jogo_origem="",
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
        nome=("Marechal da Ordem" if nivel_minimo >= 75 else "Veterano da Ordem" if nivel_minimo >= 30 else "Escudeiro da Ordem" if nivel_minimo >= 10 else "Recruta da Ordem"),
        categoria="Patente",
        tipo=tipo,
        poder=int(poder),
        raridade=raridade,
        custo=CUSTO_RARIDADE[raridade],
        habilidade=habilidade,
        descricao=f"Recompensa de progressão do Gwent — nível {nivel_minimo}.",
    )


CARTAS_PATENTE = [carta_patente(i, nivel, nome) for i, (nivel, nome) in enumerate(PATENTES)]
CARTAS_POR_ID.update({c.id: c for c in CARTAS_PATENTE})

# Catálogo estático global usado pelos drops. Patentes e cartas dinâmicas de jogos antigos
# ficam fora do pool; Singular e Primordial possuem fluxos especiais.
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
