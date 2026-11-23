# NARA — bot de Discord da comunidade Soulslike

Perfis, XP e patentes, platinas/zerados/runs com aprovação, Coliseu de cartas com duelos pelo site,
catálogo de ports/mods, ofertas de jogos, YouTube e a assistente **Nara** (respostas locais + Gemini opcional).

## Rodar
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # preencha pelo menos DISCORD_TOKEN, GUILD_ID, MOD_CHANNEL_ID
python bot.py
```
Python 3.11+. Na FadeHost: Python 3.13, `DATA_DIR=/data`, start command `python bot.py`, variáveis no painel.
Intents necessárias no Developer Portal: Server Members, Message Content e Presence.

## Estrutura
```
bot.py            entrada: carrega cogs, API/site HTTP, tratamento de erros e interações
config.py         variáveis de ambiente, constantes e caminhos de dados
database.py       SQLite (aiosqlite): schema, migrações e consultas
admin_config.py   configuração por servidor (painel /adm), com fallback para config.py
levels.py loja.py utils.py   patentes/XP, itens da loja, utilitários e navegação de painéis
cogs/             funcionalidades Discord (um arquivo por área; comum.py = peças compartilhadas)
sistemas/         cartas do Coliseu: regras, arte, templates e Ateliê
ia/               Gemini com failover entre até 3 chaves, ferramentas e confirmação de ações
nara/             respostas locais, FAQ, personalidade e Central de Ajuda
prompts/ dados/   prompts da Nara e base de FAQ (lidos em runtime)
fonts/           fonte usada nas imagens
site/             site do Coliseu (login Discord, coleção, deck, duelos)
```

## Comandos
Só dois slash commands são publicados: **`/nara`** (central dos membros, por botões) e **`/adm`**
(painel administrativo). Os demais cogs ficam carregados e são acionados pelos botões dessas centrais.

## Dados
Banco em `DATA_DIR/colizeu.db` (nome mantido). Faça backup de `data/` antes de atualizar e nunca
substitua `.env` nem `data/` ao copiar o código novo.

## Arena Gwent (site)
A Arena Gwent foi adicionada como modo independente do duelo clássico. Ela usa a mesma coleção de cartas do Discord, mas possui deck próprio de 10 cartas (`cartas_gwent_decks`) e partidas próprias (`cartas_gwent_matches`). O deck clássico de cinco cartas e as recompensas/loja do Discord permanecem separados.

Ao abrir o painel de cartas no Discord, o membro recebe uma recompensa única de cinco unidades comuns extras (`gwent_kit_discord`), somadas ao kit inicial já existente, para alcançar as 10 cartas necessárias sem comprar um pacote. Recompensas por conquistas, patentes, pacotes, forja e compras atuais permanecem no fluxo original.

Regras implementadas: três fileiras (Força/corpo a corpo, Destreza/longa distância, Magia/cerco), alternância de turnos validada no servidor, unidades que permanecem no campo, passar rodada, melhor de três, habilidade de líder uma vez por partida e clima por fileira. As ações e o estado da partida são persistidos no SQLite; o navegador nunca define pontuação ou vencedor.

Novas rotas autenticadas: `GET/POST /api/gwent/deck`, `GET/POST /api/gwent/matches`, `GET /api/gwent/matches/{match_id}` e `POST /api/gwent/matches/{match_id}/action`. As tabelas novas são criadas automaticamente pela inicialização do banco. O sistema clássico continua disponível.
