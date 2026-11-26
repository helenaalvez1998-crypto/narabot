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

  // Efeito de partículas ao redor da arena
  window.estourarParticulas = function (faction) {
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