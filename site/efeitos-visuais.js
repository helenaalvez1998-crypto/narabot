// ============================================================================
// NARABOT — Efeitos Visuais da Gameplay (Gwent Coliseu)
// Adiciona animações, feedbacks, clima, partículas e coroas na mesa de jogo
// ============================================================================

(function () {
  'use strict';

  // Só roda se houver área de arena Gwent carregada
  if (!document.getElementById('gwent-arena')) return;

  const style = document.createElement('style');
  style.textContent = `
    /* Overlay de turno */
    .turn-overlay{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;z-index:100;}
    .turn-overlay .turn-label{
      background:rgba(0,0,0,.6);border:2px solid var(--gold);color:var(--gold);
      padding:12px 24px;border-radius:30px;font:700 20px Cinzel,Georgia,serif;
      letter-spacing:.1em;min-width:180px;text-align:center;
      box-shadow:0 0 30px rgba(216,187,122,.3);
      animation: pulse-turn 2s ease-in-out infinite;
    }
    @keyframes pulse-turn{0%,100%{transform:scale(1);box-shadow:0 0 30px rgba(216,187,122,.3);}50%{transform:scale(1.05);box-shadow:0 0 50px rgba(216,187,122,.5);}}

    /* Carta selecionada com glow */
    .card-glow{position:relative;}
    .card-glow::before{
      content:'';position:absolute;inset:-8px;border-radius:16px;
      border:2px solid transparent;
      border-image:linear-gradient(90deg,#d8bb7a,#f3d69b,#d8bb7a) 1;
      z-index:-1;
      opacity:0;
      animation: card-glow 2s ease-in-out infinite;
    }
    @keyframes card-glow{0%,100%{opacity:0.3;}50%{opacity:1;}}

    /* Números flutuantes de poder */
    .power-float{
      position:absolute;pointer-events:none;
      color:var(--gold);font:700 16px Cinzel,Georgia,serif;
      text-shadow:0 2px 6px #000,0 0 8px var(--gold-bright);
      user-select:none;
    }
    .power-float.up{top:-24px;animation:float-up .6s ease-out forwards;}
    .power-float.down{top:4px;animation:float-down .6s ease-out forwards;}
    @keyframes float-up{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-30px) scale(1.2);}}
    @keyframes float-down{0%{opacity:1;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(30px) scale(1.2);}}

    /* Screen shake leve */
    .screen-shake{animation:shake .15s ease-out once;}

    @keyframes shake{0%,100%{transform:translate(0,0);}20%{transform:translate(-4px,4px);}40%{transform:translate(4px,-4px);}60%{transform:translate(-4px,-4px);}80%{transform:translate(4px,4px);}}

    /* Efeito de clima na arena */
    .climate-overlay{
      position:absolute;inset:0;pointer-events:none;opacity:0;z-index:80;
      background:var(--climate-bg,transparent);
      transition:opacity .4s ease;
    }
    .climate-overlay.active{opacity:1;}

    /* Botões com efeito de "pressionado" */
    .btn:active{transform:scale(0.97);transition:transform .05s ease;}
  `;
  document.head.appendChild(style);

  // Configurações por facção para partículas
  const factionParticles = {
    'Ordem Áurea': { color: '#d8bb7a', symbol: '✦', count: 3 },
    'Véu Carmesim': { color: '#c0392b', symbol: '血', count: 3 },
    'Lua Negra': { color: '#8e44ad', symbol: '☾', count: 3 },
    'Os Esquecidos': { color: '#2c3e50', symbol: '✝', count: 3 }
  };

  // Inicializar overlay de turno (será posicionado pelo controller)
  const turnOverlay = document.createElement('div');
  turnOverlay.className = 'turn-overlay';
  turnOverlay.innerHTML = '<div class="turn-label" id="turn-label">Sua Vez</div>';
  document.body.appendChild(turnOverlay);

  // Inicializar overlay de clima (será aplicado pelo controller)
  const climateOverlay = document.createElement('div');
  climateOverlay.className = 'climate-overlay';
  document.body.appendChild(climateOverlay);

  // ---------- Funções de efeito ----------

  // Mostraoverlay de turno
  window.mostrarTurno = function (eOponente = false) {
    const label = document.getElementById('turn-label');
    if (!label) return;
    label.textContent = eOponente ? 'Vez do Oponente' : 'Sua Vez';
    turnOverlay.classList.add('show');
    // Pequeno screen shake ao mudar de turno
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 150);
  };

  // Esconder overlay de turno
  window.esconderTurno = function () {
    if (turnOverlay.classList.contains('show')) {
      turnOverlay.classList.remove('show');
    }
  };

  // Aplicar efeito de clima (clima ativo na rodada)
  window.aplicarClima = function (faction, tipo = 'geral') {
    if (!climateOverlay) return;
    const p = factionParticles[faction] || { color: '#d8bb7a', symbol: '✦', count: 3 };
    const html = Array(p.count).fill(`<span style="color:${p.color};font-size:20px;">${p.symbol}</span>`).join(' ');
    climateOverlay.innerHTML = html;
    climateOverlay.className = 'climate-overlay active';
    climateOverlay.style.setProperty('--climate-bg', tipo === 'geada' ? 'rgba(142,68,173,.15)' : tipo === 'sangramento' ? 'rgba(192,57,43,.15)' : 'rgba(216,187,122,.15)');
    // Remove após 5s
    setTimeout(() => { climateOverlay.classList.remove('active'); }, 5000);
  };

  // Mostrar número flutuante de poder alterado
  window.mostrarPoderFlutuante = function (alvoElemento, valor, tipo = 'up') {
    if (!alvoElemento) return;
    const el = typeof alvoElemento === 'number' || typeof alvoElemento === 'string'
      ? document.querySelector(alvoElemento)
      : alvoElemento;
    if (!el) return;
    const pf = document.createElement('div');
    pf.className = `power-float ${tipo}`;
    pf.textContent = `${tipo === 'up' ? '+' : ''}${valor}`;
    el.parentNode.appendChild(pf);
    // Remove após animação
    setTimeout(() => { if (pf.parentNode) pf.parentNode.removeChild(pf); }, 600);
  };

  // Efeito glow na carta selecionada
  window.acionarGlowCarta = function (cardElement) {
    if (!cardElement) return;
    cardElement.classList.add('card-glow');
    setTimeout(() => { if (cardElement.classList) cardElement.classList.remove('card-glow'); }, 2000);
  };

  // Efeito especial de brilho ao ativar habilidade/efeito da carta
  window.acionarBrilhoEfeito = function (cardElement) {
    if (!cardElement) return;
    cardElement.classList.add('card-glow', 'card-effect-active');
    // Efeito pulsante mais forte
    setTimeout(() => { if (cardElement.classList) cardElement.classList.remove('card-effect-active'); }, 3000);
    // Partículas ao redor da carta
    const rect = cardElement.getBoundingClientRect();
    const arena = document.getElementById('gwent-arena') || document.body;
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;pointer-events:none;
        left:${rect.left + rect.width / 2}px;
        top:${rect.top + rect.height / 2}px;
        color:var(--gold);font-size:${8 + Math.random() * 6}px;
        text-shadow:0 0 8px var(--gold-bright);
        will-change:transform,opacity;
      `;
      p.textContent = '✦';
      arena.appendChild(p);
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      p.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
      ], { duration: 800, easing: 'ease-out' });
      setTimeout(() => p.remove(), 800);
    }
  };

  // ============================================================================
  // EFEITOS DE CLIMA ANIMADO NAS FILEIRAS (Clima tipo Gwent)
  // ============================================================================

  const climaAtivo = new Map(); // guarda o elemento de clima por fileira para não duplicar

  // Símbolos e cores por tipo de clima
  const climaTipos = {
    podricao: { cor: '#ff4d4d', simbolo: '☠', nome: 'Podridão Escarlate' },
    geada: { cor: '#a8d8ff', simbolo: '❄', nome: 'Geada' },
    sangue: { cor: '#c9184a', simbolo: '🩸', nome: 'Sangramento' },
    loucura: { cor: '#b56576', simbolo: '🌀', nome: 'Loucura' },
  };

  // Mapeamento de nomes/cores das cartas para o tipo de clima visual
  function resolverTipoClima(cardId, effectText = '') {
    const id = String(cardId || '').toLowerCase();
    const txt = String(effectText || '').toLowerCase();
    if (id.includes('podricao') || id.includes('podridão') || txt.includes('podridão')) return 'podricao';
    if (id.includes('geada') || id.includes('frio') || txt.includes('geada') || txt.includes('congel')) return 'geada';
    if (id.includes('sangue') || id.includes('sangramento') || txt.includes('sangramento')) return 'sangue';
    if (id.includes('loucura') || id.includes('frenet') || id.includes('frenetic') || txt.includes('loucura')) return 'loucura';
    return null;
  }

  // Aplica animação de clima sobre uma fileira
  window.aplicarClimaFileira = function (fileira, tipo, elementoRow) {
    if (!tipo || !climaTipos[tipo]) return;
    const arena = document.getElementById('gwent-arena');
    if (!arena) return;

    // Remove clima anterior da mesma fileira (só um por vez)
    if (climaAtivo.has(fileira)) {
      const antigo = climaAtivo.get(fileira);
      if (antigo && antigo.parentNode) antigo.parentNode.removeChild(antigo);
      climaAtivo.delete(fileira);
    }

    const info = climaTipos[tipo];

    const overlay = document.createElement('div');
    overlay.className = 'gwent-clima-overlay';
    overlay.style.cssText = `
      position:absolute;inset:0;pointer-events:none;z-index:40;
      overflow:hidden;border-radius:10px;
      background:rgba(${info.cor === '#ff4d4d' ? '255,77,77' : info.cor === '#a8d8ff' ? '168,216,255' : info.cor === '#c9184a' ? '201,24,74' : '181,101,118'}, .08);
    `;
    overlay.dataset.clima = tipo;
    overlay.dataset.fileira = fileira;

    // Título do clima
    const titulo = document.createElement('div');
    titulo.style.cssText = `
      position:absolute;top:8px;left:10px;z-index:45;
      color:${info.cor};font:700 11px Cinzel,Georgia,serif;letter-spacing:.12em;
      text-shadow:0 0 10px ${info.cor},0 0 20px rgba(0,0,0,.6);
      opacity:0;animation: clima-titulo 1.2s ease-out forwards;
    `;
    titulo.textContent = info.nome;
    overlay.appendChild(titulo);

    // Partículas flutuantes do clima
    const count = 14;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:absolute;pointer-events:none;
        left:${10 + Math.random() * 90}%;
        top:${-10 - Math.random() * 20}%;
        color:${info.cor};font-size:${14 + Math.random() * 10}px;
        text-shadow:0 0 12px ${info.cor},0 0 6px #000;
        opacity:0;
      `;
      p.textContent = info.simbolo;
      overlay.appendChild(p);

      const delay = Math.random() * 1.5;
      const dur = 2.5 + Math.random() * 2;
      p.animate([
        { transform: `translateY(${delay * -40}px) scale(0)`, opacity: 0 },
        { transform: `translateY(${60 + delay * 40}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translateY(120px) scale(0)`, opacity: 0 }
      ], { duration: dur * 1000, delay: delay * 1000, iterations: Infinity, easing: 'linear' });
    }

    if (elementoRow) {
      elementoRow.style.position = 'relative';
      elementoRow.appendChild(overlay);
    } else {
      arena.appendChild(overlay);
    }

    climaAtivo.set(fileira, overlay);

    // Remove automaticamente após 10s (ou quando o servidor avisar que acabou)
    setTimeout(() => {
      removerClimaFileira(fileira);
    }, 10000);
  };

  // Keyframes dos efeitos de clima
  const climaStyle = document.createElement('style');
  climaStyle.textContent = `
    @keyframes clima-titulo{
      0%{opacity:0;transform:translateY(-10px);}
      100%{opacity:1;transform:translateY(0);}
    }
    @keyframes clima-pulse{
      0%,100%{opacity:.6;transform:scale(1);}
      50%{opacity:1;transform:scale(1.05);}
    }
  `;
  document.head.appendChild(climaStyle);

  // Remove efeito de clima de uma fileira
  window.removerClimaFileira = function (fileira) {
    if (climaAtivo.has(fileira)) {
      const el = climaAtivo.get(fileira);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      climaAtivo.delete(fileira);
    }
  };

  // Limpa todos os climas (ex: Lei da Regressão)
  window.limparTodosClimas = function () {
    for (const [fileira] of climaAtivo) {
      removerClimaFileira(fileira);
    }
  };

  // Aplica efeito visual quando carta de clima é jogada (chamado pelo app.js após resposta do servidor)
  window.aplicarEfeitoClimaCarta = function (cardId, cardNome, effectText, fileira) {
    const tipo = resolverTipoClima(cardId, effectText);
    if (!tipo) return;

    // Encontra o elemento da fileira no DOM
    let rowEl = null;
    const rows = document.querySelectorAll('[data-gwent-row]');
    for (const r of rows) {
      if (r.getAttribute('data-gwent-row') === fileira || r.dataset.row === fileira) {
        rowEl = r;
        break;
      }
    }

    // Se não encontrar pelo atributo, tenta buscar o container da fileira na arena
    if (!rowEl) {
      const arena = document.getElementById('gwent-arena');
      if (arena) {
        const match = arena.querySelector(`[data-gwent-row="${fileira}"], [data-row="${fileira}"]`);
        if (match) rowEl = match;
      }
    }

    aplicarClimaFileira(fileira, tipo, rowEl || document.getElementById('gwent-arena'));
  };

  // ============================================================================
  // EFEITOS DE CLIMA ANIMADO NAS FILEIRAS (Clima tipo Gwent)
  // ============================================================================\n\n  const climaAtivo = new Map(); // guarda o elemento de clima por fileira para não duplicar\n\n  const climaTipos = {\n    podricao: { cor: '#ff4d4d', simbolo: '☠', nome: 'Podridão Escarlate' },\n    geada: { cor: '#a8d8ff', simbolo: '❄', nome: 'Geada' },\n    sangue: { cor: '#c9184a', simbolo: '🩸', nome: 'Sangramento' },\n    loucura: { cor: '#b56576', simbolo: '🌀', nome: 'Loucura' },\n  };\n\n  // Símbolos e cores por tipo de clima\n  function resolverTipoClima(cardId, effectText = '') {\n    const id = String(cardId || '').toLowerCase();\n    const txt = String(effectText || '').toLowerCase();\n    if (id.includes('podricao') || id.includes('podridão') || txt.includes('podridão')) return 'podricao';\n    if (id.includes('geada') || id.includes('frio') || txt.includes('geada') || txt.includes('congel')) return 'geada';\n    if (id.includes('sangue') || id.includes('sangramento') || txt.includes('sangramento')) return 'sangue';\n    if (id.includes('loucura') || id.includes('frenet') || id.includes('frenetic') || txt.includes('loucura')) return 'loucura';\n    return null;\n  }\n\n  // Aplica animação de clima sobre uma fileira\n  window.aplicarClimaFileira = function (fileira, tipo, elementoRow) {\n    if (!tipo || !climaTipos[tipo]) return;\n    const arena = document.getElementById('gwent-arena');\n    if (!arena) return;\n\n    // Remove clima anterior da mesma fileira (só um por vez)\n    if (climaAtivo.has(fileira)) {\n      const antigo = climaAtivo.get(fileira);\n      antigo.style.transition = 'opacity 0.5s ease, left 0.5s ease';\n      antigo.style.opacity = 0;\n      setTimeout(() => { if (antigo.parentNode) antigo.parentNode.removeChild(antigo); }, 500);\n    }\n\n    const info = climaTipos[tipo];\n    const climaEl = document.createElement('div');\n    climaEl.style.cssText = \n      \`position:absolute;pointer-events:none;\n        left:0;top:0;width:100%;height:100%;\n        pointer-events:none;\n        z-index:80;\n        color:\${info.cor};\n        font-size:clamp(20px,5vw,48px);\n        text-shadow:0 0 20px \${info.cor}33,0 0 40px \${info.cor}55;\n        animation:clima-titulo .4s ease-out both;\n        \`;\n    climaEl.textContent = info.simbolo;\n    climaEl.title = info.nome;\n    climaAtivo.set(fileira, climaEl);\n    elementoRow.appendChild(climaEl);\n    // Remove após 3 segundos\n    setTimeout(() => { if (climaAtivo.has(fileira)) { climaAtivo.get(fileira).parentNode.removeChild(climaAtivo.get(fileira)); climaAtivo.delete(fileira); } }, 3000);\n  };\n\n  // Remove todos os climas ao iniciar nova partida\n  window.limparClimas = function () {\n    climaAtivo.forEach((_, fileira) => {\n      const el = document.querySelector(`[data-fileira=\"${fileira}\"] .clima-efeito`);\n      if (el && el.parentNode) el.parentNode.removeChild(el);\n    });\n    climaAtivo.clear();\n  };\n\n  // ============================================================================\n  // EFEITO DE CLIMA NA INTERFACE (sobre a fileira)\n  // ============================================================================\n\n  // Chama quando o servidor detectou efeito de clima em uma jogada\n  window.mostrarClimaNaFileira = function (linha, tipo) {\n    const arena = document.getElementById('gwent-arena');\n    if (!arena) return;\n    const rows = {melee: '.fileira-melee', ranged: '.fileira-ranged', siege: '.fileira-sieg\'e}';\n    const rowEl = arena.querySelector(rows[linha]);\n    if (rowEl) aplicarClimaFileira(linha, tipo, rowEl);\n  };\n\n  // Remove clima ao mudar de turno\n  window.removerClimasTurno = function () {\n    climaAtivo.forEach((el) => {\n      el.style.transition = 'opacity 0.3s ease';\n      el.style.opacity = 0;\n      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);\n    });\n    climaAtivo.clear();\n  };\n\n  // Efeito de partículas de clima (ex.: gotículas de geada, manchas de sangue)\n  window.estourarParticulasClima = function (tipo, fileira) {\n    const climaTipos = {\n      podricao: { cor: '#ff4d4d', simbolo: '☠', count: 8 },\n      geada: { cor: '#a8d8ff', simbolo: '❄', count: 12 },\n      sangue: { cor: '#c9184a', simbolo: '🩸', count: 6 },\n      loucura: { cor: '#b56576', simbolo: '🌀', count: 8 },\n    };\n    const info = climaTipos[tipo];\n    if (!info) return;\n    const arena = document.getElementById('gwent-arena');\n    if (!arena) return;\n    const rowEl = arena.querySelector(`[data-fileira=\"${fileira}\"]`);\n    if (!rowEl) return;\n    const rect = rowEl.getBoundingClientRect();\n    for (let i = 0; i < info.count; i++) {\n      const p = document.createElement('div');\n      p.style.cssText = \`\n        position:absolute;pointer-events:none;\n        left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;\n        color:${info.cor};font-size:${8 + Math.random() * 8}px;text-shadow:0 0 6px ${info.cor}33;\n        will-change:transform,opacity;\n      \`;\n      p.textContent = info.simbolo;\n      arena.appendChild(p);\n      const angle = Math.random() * Math.PI * 2;\n      const dist = 15 + Math.random() * 25;\n      p.animate([\n        { transform: 'translate(0,0) scale(1)', opacity: 1 },\n        { transform: \`translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)\`, opacity: 0 }\n      ], { duration: 1000, easing: 'ease-out' });\n      setTimeout(() => p.remove(), 1000);\n    }\n  };\n\n  // ============================================================================\n  // PARTÍCULAS AUTOMÁTICAS AO DETECTAR CLIMA NO SERVIDOR\n  // ============================================================================\n\n  // Quando servidor detectou clima, dispara partículas automáticas\n  function detectarESoltarParticulas(tipo, fileira) {\n    if (tipo && info) {\n      estourarParticulasClima(tipo, fileira);\n    }\n  }\n
    const p = factionParticles[faction] || { color: '#d8bb7a', symbol: '✦', count: 3 };
    const arena = document.getElementById('gwent-arena');
    if (!arena) return;
    for (let i = 0; i < p.count * 3; i++) {
      const part = document.createElement('div');
      part.style.cssText = `
        position:absolute;pointer-events:none;
        left:calc(50% + (Math.random()-0.5)*200px);
        top:calc(50% + (Math.random()-0.5)*150px);
        color:${p.color};font-size:${10+Math.random()*10}px;
        text-shadow:0 0 6px ${p.color};
        will-change:transform;
        animation: particle-float 2s ease-out forwards;
      `;
      part.textContent = p.symbol;
      arena.appendChild(part);
      setTimeout(() => part.remove(), 2000);
    }
  };

  // Adicionar CSS da animação de partículas
  const particleStyle = document.createElement('style');
  particleStyle.textContent = `
    @keyframes particle-float{
      0%{transform:translate(0,0) scale(1);opacity:1;}
      100%{transform:translate(calc(-50vw + var(--tx,0)),calc(-50vh + var(--ty,0))) scale(0);opacity:0;}
    }
  `;
  document.head.appendChild(particleStyle);

  // Keyframes dos efeitos de clima
  const climaStyle = document.createElement('style');
  climaStyle.textContent = `
    @keyframes clima-titulo{
      0%{opacity:0;transform:translateY(-10px);}
      100%{opacity:1;transform:translateY(0);}
    }
    @keyframes clima-pulse{
      0%,100%{opacity:.6;transform:scale(1);}
      50%{opacity:1;transform:scale(1.05);}
    }
  `;
  document.head.appendChild(climaStyle);

  // Remove clima de uma fileira (chamado quando acaba o clima)
  window.removerClimaFileira = function (fileira) {
    if (climaAtivo.has(fileira)) {
      const el = climaAtivo.get(fileira);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      climaAtivo.delete(fileira);
    }
  };

  // Efeito de coroas quando alguém vence rodada
  window.mostrarCoroaVitoria = function (faction) {
    const arena = document.getElementById('gwent-arena');
    if (!arena) return;
    const coronas = Array(3).fill(`<span style="color:var(--gold);font-size:30px;">✦</span>`).join(' ');
    const crownDiv = document.createElement('div');
    crownDiv.style.cssText = `
      position:absolute;pointer-events:none;inset:0;
      display:flex;align-items:center;justify-content:center;
      z-index:99;color:var(--gold);
    `;
    crownDiv.innerHTML = `<div style="position:relative;">${coronas}</div>`;
    arena.appendChild(crownDiv);
    // Remove após 1s
    setTimeout(() => { if (crownDiv.parentNode) crownDiv.parentNode.removeChild(crownDiv); }, 1000);
  };

  // Console de debug
  console.log('🎨 Efeitos visuais NARABOT Gwent ativados com sucesso.');
})();