# NARA — bot de Discord da comunidade Soulslike

Perfis, XP e patentes, platinas/zerados/runs com aprovação, Gwent do Coliseu como jogo principal no site,
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
site/             site principal do Gwent (login Discord, coleção, deck, mercado e arena)
```

## Comandos
Só dois slash commands são publicados: **`/nara`** (central dos membros, por botões) e **`/adm`**
(painel administrativo). Os demais cogs ficam carregados e são acionados pelos botões dessas centrais.

## Dados
Banco em `DATA_DIR/colizeu.db` (nome mantido). Faça backup de `data/` antes de atualizar e nunca
substitua `.env` nem `data/` ao copiar o código novo.

## Gwent do Coliseu — jogo principal

O Gwent é o único jogo de cartas ativo no bot e no site. O motor antigo de duelo de cinco cartas foi retirado do runtime: o cog legado e suas rotinas de deck/duelo não são carregados nem distribuídos. As tabelas históricas que já existirem no SQLite são preservadas sem DROP; instalações novas não criam as tabelas antigas. Elas não possuem rotas ou comandos ativos.

### Regras da partida

- Deck com 12 cartas únicas: 10 na mão inicial e 2 na reserva.
- Preparação inicial: cada jogador pode trocar até duas cartas.
- Melhor de três rodadas; duas coroas vencem a partida.
- Três fileiras: corpo a corpo, longa distância e cerco.
- Clima reduz o poder efetivo das unidades na fileira afetada; resistência climática é aplicada no servidor.
- Líderes são vinculados à facção e podem ser ativados uma vez por partida.
- Passar encerra as jogadas do jogador na rodada; quando ambos passam, a rodada é resolvida.
- Unidades que permanecem no campo ao fim da rodada são movidas ao descarte.
- O servidor valida turnos, cartas na mão, efeitos, pontuação e resultado; o navegador só envia ações.

### Cartas, coleção e progressão

- A coleção histórica é convertida na camada Gwent sem alterar os IDs, quantidades ou posse dos jogadores.
- No primeiro acesso autenticado ao site, o bot entrega os kits iniciais de unidades e especiais uma única vez, sincroniza cartas de jogos aprovados e libera patentes conforme o nível.
- Mercado do Coliseu: pacotes de três cartas por 120 Denários, limite de três pacotes em 24 horas, proteção de raridade e Primordiais únicas por servidor.
- Duplicatas são convertidas em Almas. A forja permite criar cartas não Primordiais com Almas.
- Vitórias, derrotas e empates atualizam ranking, MMR Elo, Denários e XP; XP de partidas tem limite de 30 por jogador a cada 24 horas, e o nível libera cartas de patente.
- O ranking e o histórico de partidas são exibidos no site.

### Apresentação visual

- Cartas usam moldura por raridade, paleta por facção, selo de poder, classe, fileira e painel de habilidade.
- O construtor tem busca e filtros por facção e raridade, além de prévia ampliada.
- O mercado exibe as cartas abertas e o resultado da forja.
- A arena apresenta pontuação por jogador e fileira, cartas no campo, mão privada, líder, clima, histórico recente e opção de concessão.
- As artes são geradas localmente e de forma determinística. Não dependem de imagens externas.

### API do Gwent

- `GET /api/gwent/cards`
- `GET /api/gwent/cards/{card_id}/image`
- `GET /api/gwent/deck` e `POST /api/gwent/deck`
- `GET /api/gwent/store`
- `POST /api/gwent/store/pack`
- `POST /api/gwent/store/forge`
- `GET /api/gwent/matches` e `POST /api/gwent/matches`
- `GET /api/gwent/matches/{match_id}`
- `POST /api/gwent/matches/{match_id}/action`

### Atualização

Faça backup de `data/` e do banco antes de atualizar. Desligue o bot, extraia o pacote sobre a pasta `narabot-main`, preserve `.env`, banco de dados e dados existentes, e reinicie com `python bot.py`. O pacote não executa migrações destrutivas. Depois, atualize o navegador com `Ctrl + F5`.

Os 23 testes locais cobrem regras do motor, efeitos especiais, validação do catálogo, renderização das 70 cartas estáticas e schema/migração SQLite. A validação final em produção ainda depende de executar o bot no seu servidor Discord e testar duas contas reais simultaneamente.
