# SoulsBot Card Game — protótipo de site

Interface inicial estática baseada no sistema existente **Cartas do Coliseu**.

## O que já está neste protótipo
- Painel inicial, coleção, filtros, montagem visual de deck e arena demonstrativa.
- Regras de catálogo alinhadas aos conceitos do projeto atual: tipos Destreza/Força/Magia, raridades, habilidades e deck de cinco cartas com custo máximo demonstrativo de 12.
- Layout responsivo para desktop e celular.
- Sem dependências de build: HTML, CSS e JavaScript puros.

## Limitações importantes
Este é um **protótipo de interface**, não está conectado ao bot, ao SQLite ou ao Discord. Os jogadores, saldos e cartas exibidos são dados fictícios. A batalha no navegador é uma simulação local e NÃO movimenta Denários/Almas nem registra resultados oficiais. Não use em produção nem solicite senhas/tokens no frontend.

## Publicar gratuitamente no GitHub Pages
1. Crie um repositório público chamado `soulsbot-cardgame`.
2. Envie `index.html`, `style.css`, `app.js` e este README para a raiz.
3. No GitHub: Settings → Pages → Build and deployment → Deploy from a branch.
4. Escolha `main` e `/ (root)` e salve.
5. O site ficará disponível no endereço Pages exibido pelo GitHub.

## Próxima etapa para virar jogo real
Criar uma API autenticada no backend Python da Fade Host. O frontend deverá chamar endpoints de leitura de coleção/deck e endpoints transacionais para convidar/aceitar duelo, registrar jogadas e consultar resultados. Toda validação de posse de cartas, custo, aposta, saldo e resolução deve permanecer no backend, reutilizando as funções existentes em `database.py` e `sistemas/cartas.py`. Nunca expor o arquivo SQLite nem segredos Discord no navegador.
