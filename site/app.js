const $ = (selector) => document.querySelector(selector);
let collection = [];
let currentUser = null;
const text = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const number = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
const imageUrl = (card) => card.image_url || `/api/gwent/cards/${encodeURIComponent(card.id)}/image`;
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function showNotice(message, kind = 'info') { const el = $('#notice'); if (el) { el.textContent = message; el.className = `notice ${kind}`; el.hidden = !message; } }
async function loadAccount() {
  try {
    const meResponse = await fetch('/api/me', {credentials:'same-origin', cache:'no-store'});
    if (!meResponse.ok) {
      currentUser = null;
      $('#profile-name').textContent = 'Visitante';
      $('#profile-status').textContent = 'Conecte sua conta Discord';
      $('#login-button').hidden = false; $('#logout-button').hidden = true;
      collection = [];
      showNotice('Entre com sua conta Discord para acessar o Gwent.');
      return;
    }
    const me = await meResponse.json(); currentUser = me.user;
    $('#profile-name').textContent = 'Conta Discord';
    $('#profile-status').textContent = `ID ${text(currentUser?.id)}`;
    $('#login-button').hidden = true; $('#logout-button').hidden = false;
    const response = await fetch('/api/gwent/cards', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao carregar cartas do Gwent.');
    collection = Array.isArray(data.cards) ? data.cards : [];
    $('#souls').textContent = number(data.summary?.souls);
    $('#denarios').textContent = number(data.summary?.denarios);
    $('#gwent-xp').textContent = `${number(data.summary?.xp)} · Nv ${number(data.summary?.level)}`;
    showNotice(`Gwent sincronizado: ${collection.length} cartas disponíveis.`, 'success');
  } catch (error) { showNotice(error.message || 'Falha ao conectar ao servidor.', 'error'); }
}
$('#login-button').addEventListener('click', () => { const next = window.location.pathname + window.location.search; window.location.href = `/auth/discord/login?next=${encodeURIComponent(next)}`; });
$('#logout-button').addEventListener('click', async () => { await fetch('/auth/logout', {method:'POST', credentials:'same-origin'}); window.location.href = '/'; });

// --- Motor e interface do Gwent do Coliseu. ---
let gwentDeckIds = [];
let gwentSavedIds = [];
let gwentSavedFaction = 'Ordem de Ferro';
let gwentSavedLeader = 'comandante_fornalha';
let gwentLeaderOptions = [];
let currentGwentMatch = null;
let gwentPoll = null;
let gwentListPoll = null;

const gwentRows = [
  ['melee', 'Corpo a corpo'], ['ranged', 'Longa distância'], ['siege', 'Cerco']
];

const gwentFactionInfo = {
  'Ordem de Ferro': { description: 'Formação e resistência na linha de frente.', leaders: [
    ['comandante_fornalha', 'Comandante da Fornalha', '+2 às unidades de corpo a corpo.'],
    ['bastiao_ancestral', 'Bastião Ancestral', '+1 às unidades de corpo a corpo e resistência climática +1.']
  ]},
  'Errantes do Véu': { description: 'Mobilidade e coordenação entre fileiras.', leaders: [
    ['mestre_veu', 'Mestre do Véu', '+2 às unidades de longa distância.'],
    ['sombra_caminhante', 'Sombra Caminhante', '+1 às unidades de longa distância; com 2 ou mais, concede +1 adicional.']
  ]},
  'Conclave Arcano': { description: 'Controle climático e amplificação arcana.', leaders: [
    ['arquimaga_eclipse', 'Arquimaga do Eclipse', 'Dissipa o clima e concede +1 ao cerco.'],
    ['oraculo_tempestade', 'Oráculo da Tempestade', 'Dissipa o clima e concede +2 ao cerco se havia clima ativo; caso contrário, +1.']
  ]}
};
function renderGwentLeaderOptions(selected = '') {
  const faction = $('#gwent-faction')?.value || 'Ordem de Ferro';
  const info = gwentFactionInfo[faction] || gwentFactionInfo['Ordem de Ferro'];
  const select = $('#gwent-leader');
  if (!select) return;
  select.innerHTML = info.leaders.map(([id, name]) => `<option value="${id}">${escapeHTML(name)}</option>`).join('');
  select.value = info.leaders.some(([id]) => id === selected) ? selected : info.leaders[0][0];
  $('#gwent-faction-description').textContent = info.description;
}
function gwentCardTile(card, selected = false) {
  const special = card.categoria === 'Especial';
  const subtitle = special ? 'Especial · efeito tático' : `${card.faccao || card.tipo} · ${card.row_label || card.fileira || 'Unidade'}`;
  return `<article class="gwent-card-tile ${selected ? 'is-selected' : ''} rarity-${String(card.raridade || 'comum').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}">
    <div class="gwent-card-art"><img loading="lazy" src="${escapeHTML(imageUrl(card))}" alt="Arte de ${escapeHTML(card.nome)}"><span class="gwent-card-rarity">${escapeHTML(card.raridade || 'Comum')}</span>${Number(card.quantidade || 1) > 1 ? `<span class="gwent-card-quantity">×${number(card.quantidade)}</span>` : ''}${!special ? `<strong class="gwent-power">${number(card.poder)}</strong>` : '<span class="gwent-special-mark">✦</span>'}</div>
    <div class="gwent-card-copy"><small>${escapeHTML(subtitle)}</small><b>${escapeHTML(card.nome)}</b><span>${escapeHTML(card.habilidade_nome || 'Tática')}</span><p>${escapeHTML(card.habilidade_texto || card.descricao || 'Sem habilidade adicional.')}</p>
    <button type="button" ${selected ? `data-gwent-remove="${escapeHTML(card.id)}"` : `data-gwent-add="${escapeHTML(card.id)}"`} ${!selected && gwentDeckIds.length >= 12 ? 'disabled' : ''}>${selected ? 'Remover do deck' : 'Adicionar ao deck'}</button></div>
  </article>`;
}
function renderGwentBuilder() {
  const selected = gwentDeckIds.map(id => collection.find(c => c.id === id)).filter(Boolean);
  const specialCount = selected.filter(card => card.categoria === 'Especial').length;
  const unitCount = selected.length - specialCount;
  $('#gwent-deck-count').textContent = `${selected.length}/12 cartas · ${unitCount} unidades · ${specialCount} especiais`;
  $('#gwent-deck-selected').innerHTML = selected.map(card => gwentCardTile(card, true)).join('') || '<div class="empty-state">Seu deck está vazio. Escolha cartas da coleção para começar a montar sua estratégia.</div>';
  const q = ($('#gwent-card-search')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const factionFilter = $('#gwent-filter-faction')?.value || '';
  const rarityFilter = $('#gwent-filter-rarity')?.value || '';
  const selectedSet = new Set(gwentDeckIds);
  const pool = collection.filter(c => !selectedSet.has(c.id)
    && (!factionFilter || c.faccao === factionFilter)
    && (!rarityFilter || c.raridade === rarityFilter)
    && (`${c.nome} ${c.tipo} ${c.categoria} ${c.habilidade} ${c.habilidade_nome} ${c.habilidade_texto} ${c.faccao}`.toLocaleLowerCase('pt-BR').includes(q)));
  $('#gwent-card-pool').innerHTML = pool.map(card => gwentCardTile(card)).join('') || '<div class="empty-state">Nenhuma carta corresponde aos filtros selecionados.</div>';
  const configChanged = ($('#gwent-faction')?.value || 'Ordem de Ferro') !== gwentSavedFaction
    || ($('#gwent-leader')?.value || 'comandante_fornalha') !== gwentSavedLeader;
  $('#gwent-save-deck').disabled = selected.length !== 12 || unitCount < 8
    || specialCount > 4 || (JSON.stringify(gwentDeckIds) === JSON.stringify(gwentSavedIds) && !configChanged);
  $('#gwent-deck-status').textContent = selected.length !== 12
    ? `Faltam ${12 - selected.length} carta(s) para completar o deck.`
    : unitCount < 8 ? 'Inclua pelo menos 8 unidades no deck.'
    : specialCount > 4 ? 'O limite é de 4 cartas especiais por deck.'
    : `${unitCount}/12 unidades e ${specialCount}/4 especiais. Deck válido.`;
}
async function loadGwentDeck() {
  if (!currentUser) return;
  try {
    const r = await fetch('/api/gwent/deck', {credentials:'same-origin', cache:'no-store'});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Não foi possível carregar o deck Gwent.');
    gwentSavedIds = (data.deck || []).map(c => c.id);
    gwentDeckIds = [...gwentSavedIds];
    gwentSavedFaction = data.faction || 'Ordem de Ferro';
    gwentSavedLeader = data.leader_id || 'comandante_fornalha';
    $('#gwent-faction').value = gwentSavedFaction;
    renderGwentLeaderOptions(gwentSavedLeader);
    $('#gwent-deck-status').textContent = gwentSavedIds.length === 12 ? 'Deck carregado.' : 'Monte seu deck Gwent com 12 cartas únicas para liberar a arena.';
    renderGwentBuilder();
  } catch (e) { $('#gwent-deck-status').textContent = e.message; }
}


let gwentForgeCards = [];
let gwentPackPrice = 120;
async function loadGwentStore() {
  if (!currentUser) return;
  try {
    const response = await fetch('/api/gwent/store', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o mercado.');
    gwentForgeCards = data.forge_cards || [];
    $('#gwent-store-wallet').textContent = `${number(data.summary?.denarios)} Denários · ${number(data.summary?.souls)} Almas`;
    const pack = data.pack || {};
    gwentPackPrice = Number(pack.price || 120);
    $('#gwent-open-pack').textContent = `Abrir por ${number(gwentPackPrice)} Denários`;
    $('#gwent-pack-limit').textContent = `${number(pack.remaining)} de ${number(pack.daily_limit)} pacotes disponíveis nas últimas 24 horas · proteção de raridade: ${number(data.summary?.pity)}/${number(pack.pity_limit || 10)} comuns`;
    $('#gwent-open-pack').disabled = Number(pack.remaining || 0) <= 0 || Number(data.summary?.denarios || 0) < gwentPackPrice;
    $('#gwent-forge-select').innerHTML = '<option value="">Selecione uma carta para forjar</option>' + gwentForgeCards.map(card =>
      `<option value="${escapeHTML(card.id)}">${escapeHTML(card.nome)} · ${escapeHTML(card.raridade)} · ${number(card.custo_almas)} Almas</option>`
    ).join('');
    $('#gwent-forge-button').disabled = gwentForgeCards.length === 0;
    $('#gwent-store-status').textContent = gwentForgeCards.length
      ? `${gwentForgeCards.length} cartas disponíveis para forja.`
      : 'Você já possui todas as cartas atualmente disponíveis para forja.';
  } catch (error) {
    $('#gwent-store-status').textContent = error.message;
    $('#gwent-open-pack').disabled = true;
    $('#gwent-forge-button').disabled = true;
  }
}
async function openGwentPack() {
  const button = $('#gwent-open-pack');
  button.disabled = true;
  button.textContent = 'Abrindo pacote...';
  try {
    const response = await fetch('/api/gwent/store/pack', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o pacote.');
    await loadAccount();
    await loadGwentStore();
    const cards = data.cards || [];
    $('#gwent-pack-results').innerHTML = `<div class="pack-result-head"><b>Pacote aberto</b><span>${number(data.souls_gained)} Almas recebidas · ${number(data.packs_remaining)} pacotes restantes</span></div><div class="gwent-pack-grid">${cards.map(card => {
      const ownedCard = collection.find(item => item.id === card.id) || card;
      return `<article class="gwent-pack-result">${gwentCardTile(ownedCard)}${card.duplicata ? `<small class="duplicate-note">Duplicata convertida em ${number(card.almas_ganhas)} Almas</small>` : card.primordial ? '<small class="unique-note">Carta única do servidor</small>' : '<small class="new-card-note">Nova carta adicionada à coleção</small>'}</article>`;
    }).join('')}</div>`;
    showNotice('Pacote aberto e coleção atualizada.', 'success');
  } catch (error) {
    $('#gwent-store-status').textContent = error.message;
    showNotice(error.message, 'error');
  } finally {
    button.textContent = `Abrir por ${number(gwentPackPrice)} Denários`;
    await loadGwentStore();
  }
}
async function forgeGwentCard() {
  const cardId = $('#gwent-forge-select').value;
  if (!cardId) return showNotice('Selecione uma carta para forjar.', 'error');
  const button = $('#gwent-forge-button');
  button.disabled = true; button.textContent = 'Forjando...';
  try {
    const response = await fetch('/api/gwent/store/forge', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({card_id:cardId})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível forjar a carta.');
    await loadAccount();
    await loadGwentStore();
    const card = collection.find(item => item.id === cardId) || data.card;
    $('#gwent-pack-results').innerHTML = `<div class="pack-result-head"><b>Carta forjada</b><span>Adicionada à sua coleção</span></div><div class="gwent-pack-grid">${gwentCardTile(card)}</div>`;
    showNotice(`${card.nome} foi adicionada à sua coleção.`, 'success');
  } catch (error) {
    showNotice(error.message, 'error');
    $('#gwent-store-status').textContent = error.message;
  } finally {
    button.textContent = 'Forjar';
    await loadGwentStore();
  }
}

async function saveGwentDeck() {
  const button = $('#gwent-save-deck'); button.disabled = true; button.textContent = 'Salvando...';
  try {
    const r = await fetch('/api/gwent/deck', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({card_ids:gwentDeckIds, faction:$('#gwent-faction').value, leader_id:$('#gwent-leader').value})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Falha ao salvar deck.');
    gwentSavedIds = [...gwentDeckIds]; gwentSavedFaction = $('#gwent-faction').value; gwentSavedLeader = $('#gwent-leader').value;
    $('#gwent-deck-status').textContent = 'Deck, facção e líder salvos. Seu exército está pronto para a arena.';
    showNotice('Deck Gwent atualizado.', 'success');
  } catch(e) { $('#gwent-deck-status').textContent = e.message; }
  finally { button.textContent = 'Salvar deck Gwent'; renderGwentBuilder(); }
}

async function loadGwentMatches() {
  if (!currentUser) return;
  try {
    const r = await fetch('/api/gwent/matches', {credentials:'same-origin', cache:'no-store'}); const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Falha ao carregar partidas.');
    const rank = data.ranking || {mmr:1000,wins:0,losses:0,draws:0,tier:'Bronze'};
    const leaderboard = `<article class="duel-item gwent-leaderboard"><div><small class="eyebrow">TOP 10 DO SERVIDOR</small><h3>Classificação</h3><p>${(data.leaderboard || []).map((p,i) => `${i+1}. ${escapeHTML(p.name)} — ${number(p.mmr)} MMR`).join('<br>') || 'Ainda sem partidas ranqueadas.'}</p></div></article>`;
    $('#gwent-match-list').innerHTML = `<article class="duel-item gwent-rank"><div><small class="eyebrow">SEU RANKING</small><h3>${escapeHTML(rank.tier)} · ${number(rank.mmr)} MMR</h3><p>${number(rank.wins)} vitórias · ${number(rank.losses)} derrotas · ${number(rank.draws)} empates</p></div><span>MMR Elo · até 30 XP a cada 24h</span></article>` + leaderboard + ((data.matches || []).map(m => `<article class="duel-item"><div><small class="eyebrow">GWENT #${number(m.id)}</small><h3>Partida ${m.status === 'active' ? 'em andamento' : 'finalizada'}</h3><p>${m.creator_id === String(currentUser.id) ? 'Você é o desafiante' : 'Você foi desafiado'} · ${escapeHTML(m.created_at || '')}</p></div><button class="primary" data-gwent-open="${m.id}">Abrir arena</button></article>`).join('') || '<div class="empty-state">Nenhuma partida Gwent registrada.</div>');
  } catch(e) { $('#gwent-match-list').innerHTML = `<div class="empty-state">${escapeHTML(e.message)}</div>`; }
}

async function createGwentMatch() {
  const opponent_id = $('#gwent-opponent').value;
  if (!opponent_id) return showNotice('Selecione um adversário.', 'error');
  if (gwentSavedIds.length !== 12) return showNotice('Salve primeiro um deck Gwent com 12 cartas.', 'error');
  const button = $('#gwent-create-match'); button.disabled = true;
  try {
    const r = await fetch('/api/gwent/matches', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({opponent_id})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Não foi possível iniciar partida.');
    await openGwentMatch(data.match_id); await loadGwentMatches();
  } catch(e) { showNotice(e.message, 'error'); }
  finally { button.disabled = false; }
}

function gwentCardView(card) {
  return `<article class="gwent-board-card"><img loading="lazy" src="${escapeHTML(imageUrl(card))}" alt="Arte de ${escapeHTML(card.nome)}"><div><b>${escapeHTML(card.nome)}</b><small>${number(card.poder_final ?? (Number(card.poder) + Number(card.bonus || 0)))} poder · ${escapeHTML(card.habilidade_nome || card.row_label || 'Unidade')}</small></div></article>`;
}

function renderGwentArena(data) {
  const arena = $('#gwent-arena'); arena.hidden = false;
  const score = data.score || {}; const ids = Object.keys(score);
  const my = data.your_id; const enemy = ids.find(id => id !== my);
  const mine = score[my]; const theirs = score[enemy] || {};
  const board = (side) => gwentRows.map(([key,label]) => `<div class="gwent-row"><h4>${label} <span>${number(side.row_scores?.[key] ?? (side.board || []).filter(c => c.row === key).reduce((n,c) => n + Number(c.poder_final ?? c.poder + Number(c.bonus || 0)),0))} poder</span></h4><div class="gwent-board-cards">${(side.board || []).filter(c => c.row === key).map(gwentCardView).join('') || '<small class="muted">Nenhuma unidade</small>'}</div></div>`).join('');
  const prep = data.phase === 'mulligan';
  const mulliganControls = prep ? `<div class="gwent-prep"><b>Preparação inicial</b><p>Selecione até duas cartas para trocar. Você tem ${number(data.draw_count || 0)} carta(s) de reserva.</p><button class="secondary" data-gwent-keep ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Manter minha mão</button><button class="primary" data-gwent-mulligan ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Trocar selecionadas</button></div>` : '';
  const rewardPanel = data.reward ? `<div class="gwent-reward"><b>Recompensas da partida</b><span>+${number(data.reward.reward_denarios)} Denários</span><span>+${number(data.reward.reward_xp)} XP</span><span>${Number(data.reward.mmr_delta) > 0 ? '+' : ''}${number(data.reward.mmr_delta)} MMR</span></div>` : '';
  arena.innerHTML = `<div class="gwent-arena-head"><div><small class="eyebrow">RODADA ${number(data.round)} / 3</small><h2>Arena Gwent</h2><p class="gwent-log">${escapeHTML(data.last_event || '')}</p></div><b>${data.status === 'finished' ? (data.winner_id === my ? 'Vitória' : data.winner_id ? 'Derrota' : 'Empate') : (prep ? (data.is_your_turn ? 'Sua preparação' : 'Preparação do adversário') : (data.is_your_turn ? 'Sua vez' : 'Vez do adversário'))}</b></div>${rewardPanel}
    <div class="gwent-faction">Facção: <strong>${escapeHTML(data.faction || mine.faction || '—')}</strong> · Líder: <strong>${escapeHTML(data.leader_name || 'Líder')}</strong> · ${escapeHTML(data.leader_description || (gwentFactionInfo[data.faction || mine.faction] || {}).description || 'Sinergias de facção ativas.')}</div>${mulliganControls}
    <div class="gwent-opponent-line"><span>Adversário: <b>${escapeHTML(data.opponent?.name || 'Gladiador rival')}</b></span><span>${escapeHTML(data.opponent?.faction || '')} · ${escapeHTML(data.opponent?.leader_name || '')}</span></div><div class="gwent-score"><article><small>VOCÊ</small><h3>${number(mine.score)} poder</h3><small>${number(mine.crowns)} coroas · ${number(mine.hand)} cartas na mão ${mine.passed ? '· passou' : ''}</small></article><article><small>ADVERSÁRIO</small><h3>${number(theirs.score)} poder</h3><small>${number(theirs.crowns)} coroas · ${number(theirs.hand)} cartas na mão ${theirs.passed ? '· passou' : ''}</small></article></div>
    <h3>Seu campo</h3>${board(mine)}<h3>Campo adversário</h3>${board(theirs)}
    <details class="gwent-history"><summary>Histórico recente da batalha</summary><ol>${(data.event_log || []).slice().reverse().map(entry => `<li><span>Rodada ${number(entry.round)}</span>${escapeHTML(entry.event || '')}</li>`).join('') || '<li>A batalha ainda não começou.</li>'}</ol></details>
    <div class="gwent-actions"><button class="secondary" data-gwent-pass ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>Passar rodada</button><select id="gwent-leader-row"><option value="melee">Fileira: Corpo a corpo</option><option value="ranged">Fileira: Longa distância</option><option value="siege">Fileira: Cerco</option></select><button class="secondary" data-gwent-leader ${!data.is_your_turn || data.leader_used || data.status !== 'active' || prep ? 'disabled' : ''}>Usar líder</button><button class="secondary" data-gwent-weather ${!data.is_your_turn || data.weather_used || data.status !== 'active' || prep ? 'disabled' : ''}>Clima</button><button class="gwent-forfeit" data-gwent-forfeit ${data.status !== 'active' ? 'disabled' : ''}>Conceder partida</button></div>
    <h3>Sua mão</h3><div class="gwent-hand">${(data.hand || []).map(c => `<article class="gwent-unit"><img loading="lazy" src="${escapeHTML(imageUrl(c))}" alt="Arte de ${escapeHTML(c.nome)}"><b>${escapeHTML(c.nome)}</b><small>${c.especial ? 'Carta especial' : `${number(c.poder)} poder · ${escapeHTML(c.row_label)}`}</small><small title="${escapeHTML(c.habilidade_texto || '')}">${escapeHTML(c.habilidade_nome || 'Unidade')} · ${escapeHTML(c.habilidade_texto || 'Sem efeito adicional')}</small>${prep ? `<label><input type="checkbox" data-gwent-swap value="${escapeHTML(c.id)}" ${data.mulligan_done || !data.is_your_turn || !(data.draw_count > 0) ? 'disabled' : ''}> Trocar</label>` : `<select data-gwent-row="${escapeHTML(c.id)}"><option value="${c.row}">${escapeHTML(c.row_label)}</option>${gwentRows.filter(([r])=>r!==c.row).map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select><button data-gwent-play="${escapeHTML(c.id)}" ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>${c.especial ? 'Usar especial' : 'Jogar unidade'}</button>`}</article>`).join('') || '<div class="empty-state">Sua mão está vazia.</div>'}</div>`;
}

async function refreshGwentMatch() {
  if (!currentGwentMatch) return;
  try { const r = await fetch(`/api/gwent/matches/${currentGwentMatch}`, {credentials:'same-origin', cache:'no-store'}); const data = await r.json(); if (r.ok) renderGwentArena(data); }
  catch (_) {}
}
async function openGwentMatch(id) {
  currentGwentMatch = Number(id); if (gwentPoll) clearInterval(gwentPoll);
  await refreshGwentMatch(); gwentPoll = setInterval(refreshGwentMatch, 3500);
  $('#gwent-arena').scrollIntoView({behavior:'smooth', block:'start'});
}
async function sendGwentAction(action, card_id = '', row = '', card_ids = []) {
  if (!currentGwentMatch) return;
  try {
    const r = await fetch(`/api/gwent/matches/${currentGwentMatch}/action`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, card_id, row, card_ids})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Jogada recusada.');
    await refreshGwentMatch();
  } catch(e) { showNotice(e.message, 'error'); }
}

$('#gwent-faction').addEventListener('change', () => { renderGwentLeaderOptions(); renderGwentBuilder(); });
$('#gwent-leader').addEventListener('change', renderGwentBuilder);
$('#gwent-card-search').addEventListener('input', renderGwentBuilder);
$('#gwent-filter-faction').addEventListener('change', renderGwentBuilder);
$('#gwent-filter-rarity').addEventListener('change', renderGwentBuilder);
$('#gwent-save-deck').addEventListener('click', saveGwentDeck);
$('#gwent-open-pack').addEventListener('click', openGwentPack);
$('#gwent-forge-button').addEventListener('click', forgeGwentCard);
$('#gwent-create-match').addEventListener('click', createGwentMatch);
document.addEventListener('change', event => {
  if (event.target.matches('[data-gwent-swap]') && event.target.checked) {
    const checked = document.querySelectorAll('[data-gwent-swap]:checked');
    if (checked.length > 2) {
      event.target.checked = false;
      showNotice('Você pode trocar no máximo duas cartas.', 'error');
    }
  }
});
document.addEventListener('click', event => {
  const add = event.target.closest('[data-gwent-add]'); const remove = event.target.closest('[data-gwent-remove]');
  const play = event.target.closest('[data-gwent-play]'); const open = event.target.closest('[data-gwent-open]');
  if (add && gwentDeckIds.length < 12) {
    const card = collection.find(c => c.id === add.dataset.gwentAdd);
    const selected = gwentDeckIds.map(id => collection.find(c => c.id === id)).filter(Boolean);
    const specials = selected.filter(c => c.categoria === 'Especial').length;
    if (card?.categoria === 'Especial' && specials >= 4) return showNotice('O deck aceita no máximo quatro cartas especiais.', 'error');
    gwentDeckIds.push(add.dataset.gwentAdd); renderGwentBuilder();
  }
  if (remove) { gwentDeckIds = gwentDeckIds.filter(id => id !== remove.dataset.gwentRemove); renderGwentBuilder(); }
  if (play) { const row = document.querySelector(`[data-gwent-row="${CSS.escape(play.dataset.gwentPlay)}"]`)?.value || ''; sendGwentAction('play', play.dataset.gwentPlay, row); }
  if (open) openGwentMatch(open.dataset.gwentOpen);
  if (event.target.closest('[data-gwent-mulligan]')) {
    const card_ids = [...document.querySelectorAll('[data-gwent-swap]:checked')].map(x => x.value);
    sendGwentAction('mulligan', '', '', card_ids);
  }
  if (event.target.closest('[data-gwent-keep]')) sendGwentAction('keep');
  if (event.target.closest('[data-gwent-pass]')) sendGwentAction('pass');
  if (event.target.closest('[data-gwent-leader]')) sendGwentAction('leader', '', $('#gwent-leader-row').value);
  if (event.target.closest('[data-gwent-weather]')) sendGwentAction('weather', '', $('#gwent-leader-row').value);
  if (event.target.closest('[data-gwent-forfeit]')) { if (window.confirm('Conceder a partida? Esta ação encerra o confronto.')) sendGwentAction('forfeit'); }
});

function showGwentPage() {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('show', el.id === 'gwent'));
}
async function loadPlayers() {
  if (!currentUser) return;
  try {
    await fetch('/api/presence/heartbeat', {method:'POST', credentials:'same-origin'});
    const response = await fetch('/api/players', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar jogadores.');
    const players = (data.players || []).filter(player => !player.is_self);
    $('#gwent-opponent').innerHTML = '<option value="">Selecione um adversário</option>' + players.map(player => {
      const status = player.web_online ? ' · online no site' : ` · Discord: ${player.discord_presence}`;
      return `<option value="${escapeHTML(player.id)}">${escapeHTML(player.name)}${escapeHTML(status)}</option>`;
    }).join('');
  } catch (error) { showNotice(error.message, 'error'); }
}

loadAccount().then(async () => {
  showGwentPage();
  if (!currentUser) return;
  await Promise.all([loadGwentDeck(), loadGwentMatches(), loadPlayers(), loadGwentStore()]);
  window.setInterval(loadPlayers, 30000);
  gwentListPoll = window.setInterval(loadGwentMatches, 12000);
  const requested = new URLSearchParams(window.location.search).get('gwent');
  if (requested && /^\d+$/.test(requested)) openGwentMatch(requested);
});
