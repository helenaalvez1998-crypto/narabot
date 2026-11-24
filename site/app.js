const $ = (selector) => document.querySelector(selector);
let collection = [];
let currentUser = null;
const text = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const number = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
const imageUrl = (card) => card.image_url || `/api/gwent/cards/${encodeURIComponent(card.id)}/image`;
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function showNotice(message, kind = 'info') {
  const el = $('#notice'); if (el) { el.textContent = message; el.className = `notice ${kind}`; el.hidden = !message; }
  if (!message) return;
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = message; t.className = `toast ${kind} show`;
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 5000);
}
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
    $('#profile-name').textContent = $('#profile-name').dataset.n || 'Conta Discord';
    $('#profile-status').textContent = $('#profile-status').dataset.s || `ID ${text(currentUser?.id)}`;
    $('#login-button').hidden = true; $('#logout-button').hidden = false;
    const response = await fetch('/api/gwent/cards', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao carregar cartas do Gwent.');
    collection = Array.isArray(data.cards) ? data.cards : [];
    $('#souls').textContent = number(data.summary?.souls);
    $('#fragments').textContent = number(data.summary?.fragments);
    $('#denarios').textContent = number(data.summary?.denarios);
    $('#gwent-xp').textContent = number(data.summary?.xp);
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
let gwentMatchFinished = false;
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
  const leader = info.leaders.find(([id]) => id === select.value) || info.leaders[0];
  const leaderHelp = $('#gwent-leader-description');
  if (leaderHelp) leaderHelp.textContent = `${leader[1]}: ${leader[2]}`;
}
function renderGwentBuilder() {
  const selected = gwentDeckIds.map(id => collection.find(c => c.id === id)).filter(Boolean);
  const evolutionCost = {Comum:20, Rara:40, 'Épica':80, 'Lendária':160};
  const upgradeCost = {Comum:10, Rara:20, 'Épica':40, 'Lendária':80, 'Mítica':150, 'Primordial':250};
  const specialCount = selected.filter(card => card.categoria === 'Especial').length;
  const unitCount = selected.length - specialCount;
  $('#gwent-deck-count').textContent = `${selected.length}/12 cartas · ${unitCount} unidades · ${specialCount} especiais`;
  $('#gwent-deck-selected').innerHTML = selected.map(card => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>Exemplar #${number(card.exemplar_id)} · ${escapeHTML(card.raridade)} · ${escapeHTML(card.categoria === "Especial" ? "Especial" : `${card.faccao || card.tipo} · ${card.row_label || card.fileira || "Unidade"}`)} · ${card.categoria === "Especial" ? "Efeito tático" : `${number(card.poder)} poder`}</small>${card.exemplar_id && card.categoria !== 'Especial' && evolutionCost[card.raridade] ? `<button type="button" class="secondary" data-gwent-evolve="${escapeHTML(String(card.exemplar_id))}">Evoluir · ${evolutionCost[card.raridade]} fragmentos</button>` : ''}${card.exemplar_id && card.categoria !== 'Especial' && upgradeCost[card.raridade] && Number(card.poder) < Number(card.max_power) ? `<button type="button" class="secondary" data-gwent-upgrade="${escapeHTML(String(card.exemplar_id))}">Lapidar +1 · ${upgradeCost[card.raridade]} Almas</button>` : ''}<button type="button" data-gwent-remove="${escapeHTML(card.id)}">Remover</button></article>`).join('') || '<div class="empty-state">Selecione 12 cartas (unidades e especiais) da coleção.</div>';
  const q = ($('#gwent-card-search').value || '').trim().toLocaleLowerCase('pt-BR');
  const selectedSet = new Set(selected.map(card => card.card_id || card.id));
  const factionFilter = $('#gwent-filter-faction')?.value || '';
  const rarityFilter = $('#gwent-filter-rarity')?.value || '';
  const pool = collection.filter(c => !selectedSet.has(c.card_id || c.id)
    && (!factionFilter || c.faccao === factionFilter)
    && (!rarityFilter || c.raridade === rarityFilter)
    && (`${c.nome} ${c.faccao} ${c.row_label || c.fileira} ${c.papel_gwent} ${c.categoria} ${c.habilidade}`.toLocaleLowerCase('pt-BR').includes(q)));
  $('#gwent-card-pool').innerHTML = pool.map(card => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>Exemplar #${number(card.exemplar_id)} · ${escapeHTML(card.raridade)} · ${escapeHTML(card.categoria === "Especial" ? "Especial" : `${card.faccao || card.tipo} · ${card.row_label || card.fileira || "Unidade"}`)} · ${card.categoria === "Especial" ? "Efeito tático" : `${number(card.poder)} poder`}</small><button type="button" data-gwent-add="${escapeHTML(card.id)}" ${gwentDeckIds.length >= 12 ? 'disabled' : ''}>Adicionar</button>${card.exemplar_id && card.categoria !== 'Especial' && evolutionCost[card.raridade] ? `<button type="button" class="secondary" data-gwent-evolve="${escapeHTML(String(card.exemplar_id))}">Evoluir · ${evolutionCost[card.raridade]} fragmentos</button>` : ''}${card.exemplar_id && card.categoria !== 'Especial' && upgradeCost[card.raridade] && Number(card.poder) < Number(card.max_power) ? `<button type="button" class="secondary" data-gwent-upgrade="${escapeHTML(String(card.exemplar_id))}">Lapidar +1 · ${upgradeCost[card.raridade]} Almas</button>` : ''}</article>`).join('') || '<div class="empty-state">Nenhuma unidade disponível.</div>';
  const configChanged = ($('#gwent-faction')?.value || 'Ordem de Ferro') !== gwentSavedFaction
    || ($('#gwent-leader')?.value || 'comandante_fornalha') !== gwentSavedLeader;
  $('#gwent-save-deck').disabled = selected.length !== 12 || unitCount < 8 || specialCount > 4
    || (JSON.stringify(gwentDeckIds) === JSON.stringify(gwentSavedIds) && !configChanged);
  $('#gwent-deck-status').textContent = selected.length === 12 && unitCount < 8
    ? 'Inclua pelo menos 8 unidades no deck.'
    : specialCount > 4 ? 'O limite é de 4 cartas especiais por deck.'
    : `${unitCount}/12 unidades e ${specialCount}/4 especiais. Deck válido exige ao menos 8 unidades.`;
}

let atelierPromptText = '';
let atelierPreviewUrl = '';

function renderAtelierCardOptions() {
  const select = $('#atelier-card');
  if (!select) return;
  const models = new Map();
  collection.forEach(card => { const key = card.card_id || card.id; if (!models.has(key)) models.set(key, card); });
  select.innerHTML = '<option value="">Selecione uma carta</option>' + [...models.entries()].map(([key, card]) =>
    `<option value="${escapeHTML(key)}">${escapeHTML(card.nome)} · ${escapeHTML(card.faccao || card.raridade || 'Carta')}</option>`
  ).join('');
}

async function loadAtelierHistory() {
  const target = $('#atelier-history');
  if (!target || !currentUser) return;
  try {
    const response = await fetch('/api/gwent/atelier/history', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico do Ateliê.');
    target.innerHTML = (data.history || []).map(item => {
      const labels = {pending:'Em análise', approved:'Aprovada · arte oficial', rejected:'Rejeitada', archived:'Substituída por versão mais recente'};
      return `<article class="atelier-history-item"><b>${escapeHTML(item.card_id)}</b><span>${escapeHTML(labels[item.status] || item.status)}</span><small>${escapeHTML(item.created_at || '')}</small>${item.rejection_reason ? `<p>${escapeHTML(item.rejection_reason)}</p>` : ''}</article>`;
    }).join('') || '<p class="muted">Você ainda não enviou ilustrações.</p>';
  } catch (error) { target.innerHTML = `<p class="muted">${escapeHTML(error.message)}</p>`; }
}

async function loadAtelierReviewQueue() {
  const panel = $('#atelier-review-panel');
  if (!panel || !currentUser) return;
  try {
    const response = await fetch('/api/gwent/atelier/review', {credentials:'same-origin', cache:'no-store'});
    if (response.status === 403) { panel.hidden = true; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar a fila.');
    panel.hidden = false;
    $('#atelier-review-queue').innerHTML = (data.pending || []).map(item =>
      `<article class="atelier-review-item"><img src="/api/gwent/atelier/submission/${Number(item.id)}/image" alt="Arte submetida"><div><b>${escapeHTML(item.card_id)}</b><small>Artista: ${escapeHTML(item.artist_name || `Discord ${item.user_id}`)}</small><small>${escapeHTML(item.created_at || '')}</small><div class="atelier-review-actions"><button class="primary" type="button" data-atelier-approve="${Number(item.id)}">Aprovar</button><button class="secondary" type="button" data-atelier-reject="${Number(item.id)}">Rejeitar</button></div></div></article>`
    ).join('') || '<p class="muted">Nenhuma arte aguardando aprovação.</p>';
  } catch (error) { panel.hidden = true; showNotice(error.message, 'error'); }
}

async function loadAtelier() {
  if (!currentUser) return;
  renderAtelierCardOptions();
  await Promise.all([loadAtelierHistory(), loadAtelierReviewQueue(), loadAtelierOfficialArt()]);
}

async function loadAtelierOfficialArt() {
  const cardId = $('#atelier-card')?.value;
  const target = $('#atelier-official-art');
  if (!target) return;
  if (!cardId) { target.innerHTML = '<p class="muted">Selecione uma carta para verificar a arte oficial.</p>'; return; }
  try {
    const response = await fetch(`/api/gwent/atelier/official/${encodeURIComponent(cardId)}`, {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar arte oficial.');
    target.innerHTML = data.official
      ? `<img class="atelier-official-preview" src="${escapeHTML(data.image_url)}" alt="Arte oficial comunitária"><small>Arte oficial por <b>${escapeHTML(data.artist_name)}</b> · ${escapeHTML(data.created_at)}</small>`
      : '<p class="muted">Esta carta ainda utiliza a arte-base. Sua submissão pode se tornar a primeira arte oficial.</p>';
  } catch (error) { target.innerHTML = `<p class="muted">${escapeHTML(error.message)}</p>`; }
}

async function generateAtelierPrompt() {
  const cardId = $('#atelier-card').value;
  if (!cardId) return showNotice('Selecione uma carta da sua coleção.', 'error');
  const button = $('#atelier-generate-prompt'); button.disabled = true;
  try {
    const response = await fetch(`/api/gwent/atelier/prompt?card_id=${encodeURIComponent(cardId)}`, {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o prompt.');
    atelierPromptText = data.prompt || '';
    $('#atelier-prompt').value = atelierPromptText;
    $('#atelier-copy-prompt').disabled = !atelierPromptText;
    showNotice(`Prompt individual gerado para ${data.name}.`, 'success');
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function submitAtelierArt() {
  const cardId = $('#atelier-card').value;
  const file = $('#atelier-image').files?.[0];
  if (!cardId || !file) return showNotice('Selecione a carta e a imagem.', 'error');
  if (!atelierPromptText) return showNotice('Gere o prompt individual da carta antes de enviar.', 'error');
  if (file.size > 8 * 1024 * 1024) return showNotice('A imagem ultrapassa o limite de 8 MB.', 'error');
  const form = new FormData(); form.append('card_id', cardId); form.append('prompt_text', atelierPromptText); form.append('artist_name', ($('#atelier-artist-name').value || '').trim()); form.append('image', file);
  const button = $('#atelier-submit'); button.disabled = true;
  try {
    const response = await fetch('/api/gwent/atelier/submit', {method:'POST', credentials:'same-origin', body:form});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a ilustração.');
    showNotice(`Ilustração enviada para aprovação · submissão #${data.submission_id}.`, 'success');
    $('#atelier-image').value = ''; $('#atelier-preview').hidden = true;
    await loadAtelierHistory(); await loadAtelierReviewQueue();
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function decideAtelierSubmission(id, approve) {
  document.querySelectorAll('[data-atelier-approve],[data-atelier-reject]').forEach(b => b.disabled = true);
  let reason = '';
  if (!approve) { reason = window.prompt('Informe o motivo da rejeição (opcional):', '') ?? null; if (reason === null) { await loadAtelierReviewQueue(); return; } }
  try {
    const response = await fetch(`/api/gwent/atelier/review/${id}`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({approve, reason})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a decisão.');
    showNotice(approve ? 'Arte aprovada e publicada como ilustração oficial.' : 'Arte rejeitada; o motivo foi registrado.', 'success');
    await loadAtelierReviewQueue();
    await loadAtelierOfficialArt();
  } catch (error) { showNotice(error.message, 'error'); await loadAtelierReviewQueue(); }
}

async function loadGwentStore() {
  if (!currentUser) return;
  const status = $('#gwent-store-status');
  try {
    const response = await fetch('/api/gwent/store', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o mercado.');
    const pack = data.pack || {};
    $('#gwent-store-wallet').textContent = `${number(data.summary?.denarios)} Denários disponíveis`;
    $('#gwent-pack-limit').textContent = `${number(pack.remaining)} de ${number(pack.daily_limit || 3)} pacotes restantes nas próximas 24 horas.`;
    const button = $('#gwent-open-pack');
    button.disabled = !pack.available || Number(data.summary?.denarios || 0) < Number(pack.price || 120);
    button.textContent = Number(data.summary?.denarios || 0) < Number(pack.price || 120)
      ? 'Denários insuficientes' : `Abrir por ${number(pack.price || 120)} Denários`;
    if (status) status.textContent = `Cada pacote contém ${number(pack.cards || 3)} cartas. Duplicatas geram recursos; a coleção é compartilhada com os drops.`;
  } catch (error) { if (status) status.textContent = error.message; }
}

async function buyGwentPack() {
  const button = $('#gwent-open-pack');
  if (!button || button.disabled || !currentUser) return;
  if (!window.confirm('Comprar um pacote com 3 cartas por 120 Denários?')) return;
  button.disabled = true;
  const status = $('#gwent-store-status');
  try {
    const response = await fetch('/api/gwent/store/pack', {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível comprar o pacote.');
    const cards = Array.isArray(data.cards) ? data.cards : [];
    $('#gwent-pack-results').innerHTML = `<div class="gwent-pack-opened"><h4>Pacote aberto</h4><div class="gwent-pack-opened-cards">${cards.map(card => `<article class="pk" data-r="${escapeHTML(String(card.rarity||'comum').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))}"><b>${escapeHTML(card.card_name || card.card_id)}</b><span>${escapeHTML(card.rarity)} · ${number(card.power)} poder</span><small>${card.outcome === 'carta' ? 'Novo exemplar' : card.outcome === 'almas' ? `Duplicata · +${number(card.almas)} Almas` : `Duplicata · +${number(card.fragmentos)} fragmentos`}</small></article>`).join('')}</div></div>`;
    revealPack();
    showNotice('Pacote comprado e aberto. As cartas já estão na sua coleção.', 'success');
    await loadAccount(); await loadGwentStore(); await loadDropHistory();
  } catch (error) {
    showNotice(error.message, 'error');
    if (status) status.textContent = error.message;
    await loadGwentStore();
  }
}

async function loadDropHistory() {
  const target = $('#gwent-drop-history');
  if (!target || !currentUser) return;
  try {
    const response = await fetch('/api/gwent/drops/history', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
    const history = Array.isArray(data.history) ? data.history : [];
    const movements = Array.isArray(data.movements) ? data.movements : [];
    const entries = [
      ...history.map(item => ({...item, entry_type:'drop'})),
      ...movements.map(item => ({...item, entry_type:'movement'})),
    ].sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    target.innerHTML = entries.map(item => {
      if (item.entry_type === 'movement') {
        const evolved = item.action === 'evolucao';
        const title = evolved ? 'Carta evoluída' : 'Carta lapidada';
        const detail = evolved
          ? `${item.rarity_before} → ${item.rarity_after} · -${number(item.amount)} fragmentos`
          : `${item.rarity_after} · ${number(item.power_before)} → ${number(item.power_after)} poder · -${number(item.amount)} Almas`;
        return `<article class="gwent-drop-history-item"><div><b>${escapeHTML(title)}</b><small>${escapeHTML(item.card_name || item.card_id || 'Carta')} · ${escapeHTML(detail)}</small></div><strong>#${number(item.exemplar_id)}</strong></article>`;
      }
      const outcome = item.outcome === 'revertido' ? 'Recompensa revertida'
        : item.outcome === 'almas' ? `Duplicata · +${number(item.almas_delta)} Almas`
        : item.outcome === 'fragmentos' ? `Duplicata · +${number(item.fragmentos_delta)} fragmentos`
        : item.outcome === 'singular' ? 'Feito especial · Singular conquistada'
        : item.outcome === 'singular_ja_possui' ? 'Feito especial · Singular já conquistada'
        : 'Carta adicionada à coleção';
      const sourceNames = {zerado:'Jogo zerado', platina:'Platina', run:'Run Soulslike', comunidade:'Comunidade', port:'Port enviado', mod:'Mod enviado', boas_vindas:'Boas-vindas', patente:'Patente', feito_singular:'Feito especial'};
      const source = sourceNames[item.origin] || (item.origin ? item.origin.replaceAll('_', ' ') : 'Atividade');
      return `<article class="gwent-drop-history-item"><div><b>${escapeHTML(item.card_name || 'Carta')}</b><small>${escapeHTML(item.rarity || 'Comum')} · ${escapeHTML(outcome)} · ${escapeHTML(source)}</small></div><strong>${item.power ? `${number(item.power)} poder` : ''}</strong></article>`;
    }).join('') || '<p class="muted">Ainda não há movimentações registradas.</p>';
  } catch (error) { target.innerHTML = `<p class="muted">${escapeHTML(error.message)}</p>`; }
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

async function saveGwentDeck() {
  const button = $('#gwent-save-deck'); button.disabled = true; button.textContent = 'Salvando...';
  try {
    const r = await fetch('/api/gwent/deck', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cards:gwentDeckIds.map(key => { const card = collection.find(c => c.id === key); return {card_id:card?.card_id || card?.id, exemplar_id:Number(card?.exemplar_id || 0)}; }), faction:$('#gwent-faction').value, leader_id:$('#gwent-leader').value})});
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
    const matchCards = (data.matches || []).map(m => {
      const isCreator = m.creator_id === String(currentUser.id);
      const role = isCreator ? 'Você enviou o convite' : 'Você recebeu o convite';
      if (m.status === 'pending') {
        const controls = isCreator
          ? '<span class="muted">Aguardando resposta</span><button class="secondary" data-gwent-respond="cancel" data-match-id="' + m.id + '">Cancelar convite</button>'
          : '<button class="primary" data-gwent-respond="accept" data-match-id="' + m.id + '">Aceitar</button><button class="secondary" data-gwent-respond="decline" data-match-id="' + m.id + '">Recusar</button>';
        return `<article class="duel-item"><div><small class="eyebrow">CONVITE #${number(m.id)}</small><h3>Desafio aguardando resposta</h3><p>${role} · ${escapeHTML(m.created_at || '')}</p></div><div class="duel-controls">${controls}</div></article>`;
      }
      if (m.status === 'active') return `<article class="duel-item"><div><small class="eyebrow">GWENT #${number(m.id)}</small><h3>Partida em andamento</h3><p>${role} · ${escapeHTML(m.created_at || '')}</p></div><button class="primary" data-gwent-open="${m.id}">Abrir arena</button></article>`;
      const statusLabel = m.status === 'finished' ? 'Finalizada' : m.status === 'declined' ? 'Convite recusado' : m.status === 'cancelled' ? 'Convite cancelado' : 'Partida encerrada';
      return `<article class="duel-item"><div><small class="eyebrow">GWENT #${number(m.id)}</small><h3>${statusLabel}</h3><p>${role} · ${escapeHTML(m.created_at || '')}</p></div>${m.status === 'finished' ? `<button class="secondary" data-gwent-open="${m.id}">Ver resultado</button>` : ''}</article>`;
    }).join('');
    $('#gwent-match-list').innerHTML = `<article class="duel-item gwent-rank"><div><small class="eyebrow">SEU RANKING</small><h3>${escapeHTML(rank.tier)} · ${number(rank.mmr)} MMR</h3><p>${number(rank.wins)} vitórias · ${number(rank.losses)} derrotas · ${number(rank.draws)} empates</p></div><span>MMR Elo variável por resultado</span></article>` + leaderboard + (matchCards || '<div class="empty-state">Nenhuma partida Gwent registrada.</div>');
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
    showNotice('Convite enviado. A partida só começa quando o adversário aceitar.', 'success');
    await loadGwentMatches();
  } catch(e) { showNotice(e.message, 'error'); }
  finally { button.disabled = false; }
}

function gwentCardView(card) {
  return `<article class="gwent-board-card"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>${number(Number(card.poder) + Number(card.bonus || 0))} poder · ${escapeHTML(card.row_label)}</small></article>`;
}

function renderGwentArena(data) {
  const arena = $('#gwent-arena'); arena.hidden = false;
  const score = data.score || {}; const ids = Object.keys(score);
  const my = data.your_id; const enemy = ids.find(id => id !== my);
  const mine = score[my] || {board:[], score:0, crowns:0, hand:0, passed:false};
  const theirs = score[enemy] || {board:[], score:0, crowns:0, hand:0, passed:false};
  const opponentName = data.opponent?.name || `Jogador ${String(enemy || '').slice(-4)}`;
  const winnerLabel = data.winner_id ? (String(data.winner_id) === String(my) ? 'Você venceu' : `${opponentName} venceu`) : 'Empate';
  const board = (side) => gwentRows.map(([key,label]) => `<div class="gwent-row"><h4>${label} · ${number((side.board || []).filter(c => c.row === key).reduce((n,c) => n + Math.max(1, c.poder + Number(c.bonus || 0) - Number((data.weather && data.weather[key]) || 0)),0))} poder</h4><div class="gwent-board-cards">${(side.board || []).filter(c => c.row === key).map(gwentCardView).join('') || '<small class="muted">Nenhuma unidade</small>'}</div></div>`).join('');
  const prep = data.phase === 'mulligan';
  const mulliganControls = prep ? `<div class="gwent-prep"><b>Preparação inicial</b><p>Selecione até duas cartas para trocar. Você tem ${number(data.draw_count || 0)} carta(s) de reserva.</p><button class="secondary" data-gwent-keep ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Manter minha mão</button><button class="primary" data-gwent-mulligan ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Trocar selecionadas</button></div>` : '';
  const eventHistory = Array.isArray(data.event_log) ? data.event_log : [];
  const eventPanel = `<section class="gwent-event-history"><h3>Histórico da partida</h3><ol>${eventHistory.slice().reverse().map(item => `<li>${escapeHTML(item)}</li>`).join('') || '<li>A partida ainda não possui jogadas registradas.</li>'}</ol></section>`;
  const reward = data.reward;
  const rewardPanel = data.status === 'finished' && reward ? `<aside class="gwent-reward-panel"><b>Recompensas da partida</b><p>+${number(reward.reward_xp)} XP · +${number(reward.reward_denarios)} Denários · ${number(reward.mmr_delta)} MMR</p>${(reward.drops || []).map(drop => { const result = drop.outcome === 'carta' || drop.outcome === 'singular' ? `Exemplar #${drop.exemplar_id} · ${number(drop.power)} poder` : drop.outcome === 'almas' ? `Duplicata · +${number(drop.almas_delta)} Almas` : drop.outcome === 'fragmentos' ? `Duplicata · +${number(drop.fragmentos_delta)} fragmentos` : drop.outcome; return `<small>Drop: ${escapeHTML(drop.rarity)} · ${escapeHTML(drop.card_name || drop.card_id)} · ${escapeHTML(result)}</small>`; }).join('')}</aside>` : '';
  arena.innerHTML = `<div class="gwent-arena-head"><div><small class="eyebrow">RODADA ${number(data.round)} / 3</small><h2>Arena Gwent</h2><p class="gwent-log">${escapeHTML(data.last_event || '')}</p><p class="muted">Adversário: <strong>${escapeHTML(opponentName)}</strong> · ${escapeHTML(data.opponent?.faction || 'Facção não informada')}</p></div><b>${data.status === 'finished' ? winnerLabel : (prep ? (data.is_your_turn ? 'Sua preparação' : 'Preparação do adversário') : (data.is_your_turn ? 'Sua vez' : 'Vez do adversário'))}</b></div>${rewardPanel}
    <div class="gwent-faction">Facção: <strong>${escapeHTML(data.faction || mine.faction || '—')}</strong> · Líder: <strong>${escapeHTML(data.leader_name || 'Líder')}</strong> · ${escapeHTML(data.leader_description || (gwentFactionInfo[data.faction || mine.faction] || {}).description || 'Sinergias de facção ativas.')}</div>${mulliganControls}
    <div class="gwent-score"><article><small>VOCÊ</small><h3>${number(mine.score)} poder</h3><small>${number(mine.crowns)} coroas · ${number(mine.hand)} cartas na mão ${mine.passed ? '· passou' : ''}</small></article><article><small>${escapeHTML(opponentName)}</small><h3>${number(theirs.score)} poder</h3><small>${number(theirs.crowns)} coroas · ${number(theirs.hand)} cartas na mão ${theirs.passed ? '· passou' : ''}</small></article></div>
    <h3>Seu campo</h3>${board(mine)}<h3>Campo adversário</h3>${board(theirs)}
    <div class="gwent-actions"><button class="secondary" data-gwent-pass ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>Passar rodada</button><select id="gwent-leader-row"><option value="melee">Fileira: Corpo a corpo</option><option value="ranged">Fileira: Longa distância</option><option value="siege">Fileira: Cerco</option></select><button class="secondary" data-gwent-leader ${!data.is_your_turn || data.leader_used || data.status !== 'active' || prep ? 'disabled' : ''}>Usar líder</button><button class="secondary" data-gwent-weather ${!data.is_your_turn || data.weather_used || data.status !== 'active' || prep ? 'disabled' : ''}>Clima</button><button class="danger" data-gwent-surrender ${data.status !== 'active' ? 'disabled' : ''}>Desistir da partida</button></div>
    ${eventPanel}<h3>Sua mão</h3><div class="gwent-hand">${(data.hand || []).map(c => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(c))}" alt=""><b>${escapeHTML(c.nome)}</b><small>${c.especial ? 'Carta especial' : `${number(c.poder)} poder · ${escapeHTML(c.row_label)}`}</small><small title="${escapeHTML(c.habilidade_texto || '')}">${escapeHTML(c.habilidade_nome || 'Unidade')} · ${escapeHTML(c.habilidade_texto || 'Sem efeito adicional')}</small>${prep ? `<label><input type="checkbox" data-gwent-swap value="${escapeHTML(c.id)}" ${data.mulligan_done || !data.is_your_turn || !(data.draw_count > 0) ? 'disabled' : ''}> Trocar</label>` : `<select data-gwent-row="${escapeHTML(c.id)}"><option value="${c.row}">${escapeHTML(c.row_label)}</option>${gwentRows.filter(([r])=>r!==c.row).map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select><button data-gwent-play="${escapeHTML(c.id)}" ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>${c.especial ? 'Usar especial' : 'Jogar unidade'}</button>`}</article>`).join('') || '<div class="empty-state">Sua mão está vazia.</div>'}</div>`;
}

async function refreshGwentMatch() {
  if (!currentGwentMatch) return false;
  try {
    const response = await fetch(`/api/gwent/matches/${currentGwentMatch}`, {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível abrir a partida.');
    if (data.status === 'pending') {
      showNotice('Este convite ainda aguarda resposta. Consulte a lista de desafios para aceitar ou cancelar.', 'info');
      await loadGwentMatches();
      return false;
    }
    if (data.status === 'declined' || data.status === 'cancelled') {
      showNotice(data.status === 'declined' ? 'Este convite foi recusado.' : 'Este convite foi cancelado.', 'info');
      await loadGwentMatches();
      return false;
    }
    renderGwentArena(data);
    gwentMatchFinished = data.status === 'finished';
    if (gwentMatchFinished && gwentPoll) { clearInterval(gwentPoll); gwentPoll = null; }
    return true;
  } catch (error) { showNotice(error.message, 'error'); return false; }
}
async function openGwentMatch(id) {
  currentGwentMatch = Number(id);
  gwentMatchFinished = false;
  if (gwentPoll) clearInterval(gwentPoll);
  const canOpen = await refreshGwentMatch();
  if (!canOpen) { currentGwentMatch = null; return; }
  if (!gwentMatchFinished) gwentPoll = setInterval(refreshGwentMatch, 3500);
  $('#gwent-arena').scrollIntoView({behavior:'smooth', block:'start'});
}
async function respondGwentMatch(matchId, action) {
  try {
    const response = await fetch(`/api/gwent/matches/${Number(matchId)}/respond`, {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível responder ao convite.');
    await loadGwentMatches();
    if (action === 'accept') {
      showNotice('Convite aceito. A partida começou.', 'success');
      await openGwentMatch(data.match_id);
    } else {
      showNotice(action === 'decline' ? 'Convite recusado.' : 'Convite cancelado.', 'success');
    }
  } catch (error) { showNotice(error.message, 'error'); }
}
async function sendGwentAction(action, card_id = '', row = '', card_ids = []) {
  if (!currentGwentMatch) return;
  try {
    const r = await fetch(`/api/gwent/matches/${currentGwentMatch}/action`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, card_id, row, card_ids})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Jogada recusada.');
    await refreshGwentMatch();
  } catch(e) { showNotice(e.message, 'error'); }
}

$('#atelier-card').addEventListener('change', () => {
  atelierPromptText = ''; $('#atelier-prompt').value = ''; $('#atelier-copy-prompt').disabled = true;
  loadAtelierOfficialArt();
});
$('#atelier-generate-prompt').addEventListener('click', generateAtelierPrompt);
$('#atelier-copy-prompt').addEventListener('click', async () => {
  if (!atelierPromptText) return;
  try { await navigator.clipboard.writeText(atelierPromptText); showNotice('Prompt copiado.', 'success'); }
  catch { $('#atelier-prompt').focus(); $('#atelier-prompt').select(); showNotice('Selecione e copie o prompt manualmente.', 'info'); }
});
$('#atelier-image').addEventListener('change', () => {
  const file = $('#atelier-image').files?.[0];
  const preview = $('#atelier-preview');
  if (atelierPreviewUrl) URL.revokeObjectURL(atelierPreviewUrl);
  atelierPreviewUrl = '';
  if (!file) { preview.hidden = true; $('#atelier-submit').disabled = true; return; }
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    showNotice('Formato inválido ou arquivo acima de 8 MB.', 'error'); preview.hidden = true; $('#atelier-submit').disabled = true; return;
  }
  atelierPreviewUrl = URL.createObjectURL(file); preview.src = atelierPreviewUrl; preview.hidden = false; $('#atelier-submit').disabled = false;
});
$('#atelier-submit').addEventListener('click', submitAtelierArt);
document.addEventListener('click', event => {
  const approve = event.target.closest('[data-atelier-approve]');
  const reject = event.target.closest('[data-atelier-reject]');
  if (approve) decideAtelierSubmission(Number(approve.dataset.atelierApprove), true);
  if (reject) decideAtelierSubmission(Number(reject.dataset.atelierReject), false);
});

$('#gwent-faction').addEventListener('change', () => { renderGwentLeaderOptions(); renderGwentBuilder(); });
$('#gwent-leader').addEventListener('change', () => { renderGwentLeaderOptions($('#gwent-leader').value); renderGwentBuilder(); });
$('#gwent-card-search').addEventListener('input', renderGwentBuilder);
$('#gwent-filter-faction').addEventListener('change', renderGwentBuilder);
$('#gwent-filter-rarity').addEventListener('change', renderGwentBuilder);
$('#gwent-save-deck').addEventListener('click', saveGwentDeck);
$('#gwent-create-match').addEventListener('click', createGwentMatch);
$('#gwent-open-pack').addEventListener('click', buyGwentPack);
document.addEventListener('click', async event => {
  const add = event.target.closest('[data-gwent-add]'); const remove = event.target.closest('[data-gwent-remove]');
  const play = event.target.closest('[data-gwent-play]'); const open = event.target.closest('[data-gwent-open]');
  const respond = event.target.closest('[data-gwent-respond]');
  const evolve = event.target.closest('[data-gwent-evolve]');
  if (evolve) {
    evolve.disabled = true;
    try {
      const response = await fetch('/api/gwent/evolve', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({exemplar_id:Number(evolve.dataset.gwentEvolve)})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (result.status === 'fragmentos_insuficientes' ? `Você precisa de ${result.necessarios} fragmentos; possui ${result.saldo}.` : result.status === 'destino_ja_possuido' ? `Você já possui um exemplar ${result.rarity} deste modelo. Lapide esse exemplar ou escolha outra evolução.` : 'Não foi possível evoluir esta carta.'));
      showNotice(`Carta evoluída para ${result.rarity} · ${result.power} poder.`, 'success');
      await loadAccount(); await loadGwentDeck(); await loadDropHistory();
    } catch (error) { showNotice(error.message, 'error'); evolve.disabled = false; }
  }
  const upgrade = event.target.closest('[data-gwent-upgrade]');
  if (upgrade) {
    upgrade.disabled = true;
    try {
      const response = await fetch('/api/gwent/upgrade', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({exemplar_id:Number(upgrade.dataset.gwentUpgrade)})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (result.status === 'almas_insuficientes' ? `Você precisa de ${result.necessarias} Almas; possui ${result.saldo}.` : 'Não foi possível lapidar esta carta.'));
      showNotice(`Carta lapidada: ${result.power}/${result.max_power} poder.`, 'success');
      await loadAccount(); await loadGwentDeck(); await loadDropHistory();
    } catch (error) { showNotice(error.message, 'error'); upgrade.disabled = false; }
  }
  if (add && gwentDeckIds.length < 12) {
    const card = collection.find(c => c.id === add.dataset.gwentAdd);
    const selected = gwentDeckIds.map(id => collection.find(c => c.id === id)).filter(Boolean);
    if (selected.some(item => (item.card_id || item.id) === (card?.card_id || card?.id))) return showNotice('O deck não pode repetir o mesmo modelo, mesmo usando exemplares diferentes.', 'error');
    const specials = selected.filter(c => c.categoria === 'Especial').length;
    if (card?.categoria === 'Especial' && specials >= 4) return showNotice('O deck aceita no máximo quatro cartas especiais.', 'error');
    gwentDeckIds.push(add.dataset.gwentAdd); renderGwentBuilder();
  }
  if (remove) { gwentDeckIds = gwentDeckIds.filter(id => id !== remove.dataset.gwentRemove); renderGwentBuilder(); }
  if (play) { const row = document.querySelector(`[data-gwent-row="${CSS.escape(play.dataset.gwentPlay)}"]`)?.value || ''; sendGwentAction('play', play.dataset.gwentPlay, row); }
  if (open) openGwentMatch(open.dataset.gwentOpen);
  if (respond) respondGwentMatch(respond.dataset.matchId, respond.dataset.gwentRespond);
  if (event.target.closest('[data-gwent-mulligan]')) {
    const card_ids = [...document.querySelectorAll('[data-gwent-swap]:checked')].map(x => x.value);
    sendGwentAction('mulligan', '', '', card_ids);
  }
  if (event.target.closest('[data-gwent-keep]')) sendGwentAction('keep');
  if (event.target.closest('[data-gwent-pass]')) sendGwentAction('pass');
  if (event.target.closest('[data-gwent-leader]')) sendGwentAction('leader', '', $('#gwent-leader-row').value);
  if (event.target.closest('[data-gwent-weather]')) sendGwentAction('weather', '', $('#gwent-leader-row').value);
  if (event.target.closest('[data-gwent-surrender]')) {
    if (window.confirm('Tem certeza de que deseja desistir? A vitória será concedida ao adversário.')) sendGwentAction('surrender');
  }
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
  await Promise.all([loadGwentDeck(), loadGwentMatches(), loadPlayers(), loadDropHistory(), loadAtelier(), loadGwentStore()]);
  window.setInterval(loadPlayers, 30000);
  gwentListPoll = window.setInterval(loadGwentMatches, 12000);
  const requested = new URLSearchParams(window.location.search).get('gwent');
  if (requested && /^\d+$/.test(requested)) openGwentMatch(requested);
});

/* Abertura de pacote: cartas viradas que se revelam uma a uma (clique para pular) */
function revealPack() {
  const box = document.querySelector('#gwent-pack-results .gwent-pack-opened');
  if (!box) return;
  const items = [...box.querySelectorAll('article.pk')];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  items.forEach(el => el.classList.add('pk-hide'));
  const order = items.map((el, i) => i).sort((x, y) => (RARANK[items[x].dataset.r] || 0) - (RARANK[items[y].dataset.r] || 0));
  let timers = [];
  const show = el => { el.classList.remove('pk-hide'); el.classList.add('pk-show'); };
  order.forEach((idx, n) => timers.push(setTimeout(() => show(items[idx]), 500 + n * 750)));
  box.addEventListener('click', () => { timers.forEach(clearTimeout); items.forEach(show); }, { once: true });
  const h = box.querySelector('h4'); if (h) h.insertAdjacentHTML('afterend', '<small class="pk-skip">Clique para revelar tudo</small>');
}
const RARANK = { comum: 0, rara: 1, epica: 2, lendaria: 3, mitica: 4, primordial: 5, singular: 6 };

// --- Hub: início, comunidade e Nara (dados locais, sem custo de IA). ---
const hubFmt = (iso) => { const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') || String(iso).includes('+') ? '' : 'Z')); if (isNaN(d)) return ''; const m = Math.max(0, (Date.now() - d) / 60000); return m < 60 ? `${Math.floor(m) || 1} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
const hubAvatar = (url, name) => url ? `<img class="hub-av" src="${escapeHTML(url)}" alt="" loading="lazy">` : `<span class="hub-av">${escapeHTML((name || '?')[0].toUpperCase())}</span>`;
const hubName = (r) => `<span class="rank-name"${/^#[0-9a-f]{6}$/i.test(r.cor || '') ? ` style="color:${r.cor}"` : ''}>${r.emblema ? escapeHTML(r.emblema) + ' ' : ''}${escapeHTML(r.name)}</span>`;
const hubRows = (rows, unit) => rows.length ? rows.map(r => `<div class="rank-row${r.pos <= 3 ? ' top' + r.pos : ''}"><b class="rank-pos">${r.pos <= 3 ? ['🥇','🥈','🥉'][r.pos - 1] : r.pos}</b>${hubAvatar(r.avatar, r.name)}${hubName(r)}<strong>${number(r.valor)} <small>${unit}</small></strong></div>`).join('') : '<p class="muted">Ainda sem dados.</p>';
async function loadHub() {
  try {
    const r = await fetch('/api/hub/overview', {credentials: 'same-origin', cache: 'no-store'});
    if (!r.ok) return;
    const d = await r.json(), s = d.server;
    $('#hub-server').textContent = s.name;
    $('#hub-members').textContent = number(s.members); $('#hub-online').textContent = number(s.online); $('#hub-onsite').textContent = number(s.on_site);
    const icon = $('#hub-icon'); if (s.icon) { icon.src = s.icon; icon.hidden = false; }
    const inv = $('#hub-invite'); if (s.invite) { inv.href = s.invite; inv.hidden = false; }
    if (!d.authenticated) return;
    const m = d.me;
    $('#profile-name').dataset.n = m.name || 'Conta Discord'; $('#profile-status').dataset.s = m.patente; $('#profile-name').textContent = m.name || 'Conta Discord'; $('#profile-status').textContent = m.patente;
    if (m.avatar) $('.profile .avatar').innerHTML = `<img src="${escapeHTML(m.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%">`;
    $('#hub-me-name').textContent = m.name || 'Você'; $('#hub-me-rank').textContent = `#${number(m.posicao)} no ranking`;
    if (m.prefs) { visSet(m.prefs, false); window.visServer = m.prefs; }
    const pf = m.prefs || {};
    const pct = Math.min(100, Math.round(m.xp_nivel_atual / Math.max(1, m.xp_nivel_total) * 100));
    $('#hub-me-body').innerHTML = `<div class="me-banner"><span class="me-emb">${escapeHTML(pf.emblema || '⚔')}</span><b>${escapeHTML(m.patente)}</b></div>${pf.frase ? `<p class="me-quote">“${escapeHTML(pf.frase)}”</p>` : ''}<div class="me-level"><b>Nível ${m.nivel}</b><span>${escapeHTML(m.patente)}</span></div><div class="xpbar" title="${pct}%"><i style="width:${pct}%"></i></div><small class="muted">${number(m.xp_nivel_atual)} / ${number(m.xp_nivel_total)} XP para o próximo nível</small><div class="me-stats"><div><b>${number(m.platinas)}</b><small>Platinas</small></div><div><b>${number(m.zerados)}</b><small>Zerados</small></div><div><b>${number(m.runs)}</b><small>Runs</small></div><div><b>${number(m.denarios)}</b><small>Denários</small></div></div>${m.pendentes ? `<p class="muted">⏳ ${m.pendentes} envio(s) aguardando aprovação.</p>` : ''}`;
    $('#hub-tops').innerHTML = [['xp','Mais XP','XP'],['platinas','Platinas','plat.'],['zerados','Zerados','jogos']].map(([k, t, u]) => `<section class="hub-card"><h4>${t}</h4>${hubRows(d.top[k], u)}</section>`).join('');
    $('#hub-recent').innerHTML = d.recent.length ? d.recent.map(a => `<div class="recent-item"><i>${a.tipo === 'platina' ? '💎' : '🏆'}</i><div><b>${escapeHTML(a.user)}</b> ${a.tipo === 'platina' ? 'platinou' : 'zerou'} <b>${escapeHTML(a.game)}</b></div><small>${hubFmt(a.quando)}</small></div>`).join('') : '<p class="muted">Nenhuma conquista recente.</p>';
  } catch (e) { /* hub é complementar: falha silenciosa */ }
}
let hubRank = 'xp';
async function loadRank(tipo = hubRank) {
  hubRank = tipo;
  document.querySelectorAll('#rank-seg button').forEach(b => b.classList.toggle('on', b.dataset.rank === tipo));
  try {
    const r = await fetch(`/api/hub/ranking?tipo=${tipo}&limite=25`, {credentials: 'same-origin', cache: 'no-store'});
    if (!r.ok) return;
    const d = await r.json(), u = d.label.toLowerCase(), t = d.rows.slice(0, 3);
    $('#rank-podium').innerHTML = t.length === 3 ? `<div class="podium">${[1, 0, 2].map(i => `<div class="pod p${i + 1}">${hubAvatar(t[i].avatar, t[i].name)}<b>${hubName(t[i])}</b><small>${number(t[i].valor)} ${u}</small><div class="pod-step">${i + 1}</div></div>`).join('')}</div>` : '';
    $('#rank-list').innerHTML = hubRows(t.length === 3 ? d.rows.slice(3) : d.rows, u);
  } catch (e) {}
}
async function loadPlayers() {
  try {
    const r = await fetch('/api/players', {credentials: 'same-origin', cache: 'no-store'});
    if (!r.ok) return;
    const d = await r.json(), q = ($('#players-search').value || '').toLowerCase();
    const st = {online: 'Online', idle: 'Ausente', dnd: 'Ocupado', offline: 'Offline'};
    $('#players-list').innerHTML = d.players.filter(p => p.name.toLowerCase().includes(q)).slice(0, 60).map(p => `<div class="player-chip"><i class="dot ${p.web_online ? 'on' : p.discord_presence}"></i><span>${escapeHTML(p.name)}</span><small>${p.web_online ? 'no site' : st[p.discord_presence] || ''}</small></div>`).join('') || '<p class="muted">Ninguém encontrado.</p>';
  } catch (e) {}
}
function naraSay(txt, who) { const log = $('#nara-log'), p = document.createElement('p'); p.className = `nara-msg ${who}`; p.textContent = txt; log.appendChild(p); log.scrollTop = log.scrollHeight; return p; }
async function naraAsk(q) {
  if (!currentUser) { naraSay('Entre com Discord para falar comigo.', 'bot'); return; }
  naraSay(q, 'me'); const wait = naraSay('…', 'bot');
  try {
    const r = await fetch('/api/hub/nara', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: q})});
    const d = await r.json(); wait.textContent = d.reply || d.error || 'Algo deu errado.';
    (d.suggestions || []).forEach(s => { const b = document.createElement('button'); b.type = 'button'; b.className = 'nara-sug'; b.textContent = s; b.onclick = () => naraAsk(s); $('#nara-log').appendChild(b); });
  } catch (e) { wait.textContent = 'Sem conexão com o servidor.'; }
}
$('#nara-form')?.addEventListener('submit', (e) => { e.preventDefault(); const i = $('#nara-input'), q = i.value.trim(); if (q) { i.value = ''; naraAsk(q); } });
$('#rank-seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-rank]'); if (b) loadRank(b.dataset.rank); });
$('#players-search')?.addEventListener('input', loadPlayers);
document.addEventListener('click', (e) => { if (e.target.closest('[data-tab="community"],[data-goto="community"]')) { loadRank(); loadPlayers(); } });
loadHub(); setTimeout(() => { if (currentUser) { loadRank(); loadPlayers(); } }, 1200);
setInterval(() => { if (!document.hidden && $('#tab-home')?.classList.contains('show')) loadHub(); }, 60000);

// --- Personalização visual: tema + cor + emblema + frase (salvos no perfil). ---
const VIS_TEMAS = [['cinzas', 'Cinzas', '#9b78c4'], ['fogueira', 'Fogueira', '#ff9a3c'], ['abismo', 'Abismo', '#5fd0d6'], ['veneno', 'Veneno', '#9be564'], ['sangue', 'Sangue', '#e0525c'], ['ametista', 'Ametista', '#d9a8ff']];
const VIS_EMB = ['⚔', '🛡', '🔥', '💀', '🐉', '🌙', '👑', '🗡', '🏹', '☠', '🦅', '⚜'];
let vis = {tema: 'cinzas', cor: '', frase: '', emblema: '⚔'};
try { vis = Object.assign(vis, JSON.parse(localStorage.getItem('vis') || '{}')); } catch (e) {}
function visSet(v, save = true) {
  vis = Object.assign(vis, v); const h = document.documentElement;
  h.dataset.theme = vis.tema || 'cinzas';
  if (/^#[0-9a-f]{6}$/i.test(vis.cor || '')) { h.style.setProperty('--gold', vis.cor); h.style.setProperty('--gold-bright', `color-mix(in srgb, ${vis.cor} 70%, #fff)`); }
  else { h.style.removeProperty('--gold'); h.style.removeProperty('--gold-bright'); }
  try { localStorage.setItem('vis', JSON.stringify(vis)); } catch (e) {}
}
function visPanel() {
  let p = $('#vis-panel');
  if (!p) {
    p = document.createElement('div'); p.id = 'vis-panel'; p.className = 'vis-panel'; p.hidden = true;
    p.innerHTML = `<div class="vis-box" role="dialog" aria-label="Personalizar visual"><button class="vis-x" type="button" aria-label="Fechar">×</button><small class="eyebrow">PERSONALIZAR</small><h3>Seu visual</h3>
<h4>Tema</h4><div class="vis-themes">${VIS_TEMAS.map(([id, n, c]) => `<button type="button" data-t="${id}" style="--sw:${c}"><i></i>${n}</button>`).join('')}</div>
<h4>Cor de destaque</h4><div class="vis-row"><input type="color" id="vis-cor" value="#9b78c4"><button type="button" class="secondary" id="vis-cor-reset">Usar cor do tema</button></div>
<h4>Emblema</h4><div class="vis-emb">${VIS_EMB.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
<h4>Frase do perfil</h4><input id="vis-frase" maxlength="80" placeholder="Ex.: Louvado seja o sol!" class="deck-search">
<button class="primary" id="vis-save" type="button">Salvar no meu perfil</button><small class="muted" id="vis-msg"></small></div>`;
    document.body.appendChild(p);
    p.addEventListener('click', (e) => {
      if (e.target === p || e.target.closest('.vis-x')) { p.hidden = true; return; }
      const t = e.target.closest('[data-t]'), em = e.target.closest('[data-e]');
      if (t) visSet({tema: t.dataset.t}); if (em) visSet({emblema: em.dataset.e});
      if (e.target.id === 'vis-cor-reset') visSet({cor: ''});
      if (e.target.id === 'vis-save') visSave();
      visMark();
    });
    $('#vis-cor').addEventListener('input', (e) => { visSet({cor: e.target.value}); visMark(); });
    $('#vis-frase').addEventListener('input', (e) => { vis.frase = e.target.value; });
  }
  $('#vis-frase').value = vis.frase || ''; if (vis.cor) $('#vis-cor').value = vis.cor; visMark(); return p;
}
function visMark() {
  document.querySelectorAll('#vis-panel [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === vis.tema));
  document.querySelectorAll('#vis-panel [data-e]').forEach(b => b.classList.toggle('on', b.dataset.e === vis.emblema));
}
async function visSave() {
  const msg = $('#vis-msg');
  if (!currentUser) { msg.textContent = 'Aplicado neste navegador. Entre com Discord para salvar no perfil.'; return; }
  try {
    const r = await fetch('/api/hub/prefs', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tema: vis.tema, cor: vis.cor || '', frase: vis.frase || '', emblema: vis.emblema})});
    const d = await r.json(); msg.textContent = r.ok ? 'Salvo! Aparece no seu perfil e no ranking.' : (d.error || 'Falha ao salvar.');
    if (r.ok) loadHub();
  } catch (e) { msg.textContent = 'Sem conexão com o servidor.'; }
}
$('#vis-open')?.addEventListener('click', () => { visPanel().hidden = false; });


// --- Portal NARA: envios web de platinas e jogos zerados. ---
(() => {
  const form = document.getElementById('portal-submit-form');
  if (!form) return;
  const kindInput = form.querySelector('[name="kind"]');
  const title = document.getElementById('portal-form-title');
  const proofInput = document.getElementById('portal-proofs');
  const fileList = document.getElementById('portal-file-list');
  const feedback = document.getElementById('portal-submit-feedback');
  const list = document.getElementById('portal-submission-list');
  const labels = {pending:'Aguardando análise', approved:'Aprovado', rejected:'Rejeitado'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setKind(kind) {
    kindInput.value = kind;
    title.textContent = kind === 'platina' ? 'Enviar uma platina' : 'Registrar jogo zerado';
    form.querySelector('[name="date"]').closest('label').childNodes[0].textContent = kind === 'platina' ? 'Data da conquista' : 'Data em que zerou';
    form.querySelector('.optional-field').hidden = false;
    proofInput.required = kind === 'platina';
    document.querySelectorAll('[data-submit-kind]').forEach(b => b.classList.toggle('on', b.dataset.submitKind === kind));
    document.querySelector('.pending-pill').textContent = 'Revisão da equipe';
  }
  document.querySelectorAll('[data-submit-kind]').forEach(b => b.addEventListener('click', () => setKind(b.dataset.submitKind)));
  proofInput.addEventListener('change', () => {
    const files = [...proofInput.files];
    fileList.textContent = files.length ? files.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`).join(' · ') : 'Nenhum arquivo selecionado';
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) { showNotice('Entre com sua conta Discord antes de enviar.', 'error'); return; }
    const files = [...proofInput.files];
    if (files.length > 5) { feedback.hidden=false; feedback.className='portal-feedback error'; feedback.textContent='Envie no máximo 5 comprovantes.'; return; }
    if (files.some(f => f.size > 8*1024*1024)) { feedback.hidden=false; feedback.className='portal-feedback error'; feedback.textContent='Cada arquivo deve ter no máximo 8 MB.'; return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = 'Enviando…';
    feedback.hidden = true;
    try {
      const body = new FormData(form);
      const response = await fetch(`/api/portal/submit/${kindInput.value}`, {method:'POST', credentials:'same-origin', body});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar.');
      feedback.hidden = false; feedback.className = 'portal-feedback';
      feedback.textContent = `Solicitação #${data.id} enviada. Ela está aguardando aprovação da equipe.`;
      const submittedKind = kindInput.value; form.reset(); setKind(submittedKind); fileList.textContent='Nenhum arquivo selecionado';
      await loadPortalSubmissions();
      showNotice('Seu envio foi registrado para análise.', 'success');
    } catch (err) {
      feedback.hidden = false; feedback.className = 'portal-feedback error'; feedback.textContent = err.message;
    } finally { button.disabled=false; button.innerHTML='Enviar para análise <span>→</span>'; }
  });
  async function loadPortalSubmissions() {
    if (!currentUser) { list.innerHTML='<div class="portal-empty">Entre com Discord para consultar seus envios.</div>'; return; }
    list.innerHTML='<div class="portal-empty">Carregando histórico…</div>';
    try {
      const r=await fetch('/api/portal/mine',{credentials:'same-origin',cache:'no-store'});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Falha ao carregar.');
      if(!d.items?.length){list.innerHTML='<div class="portal-empty">Você ainda não enviou platinas ou jogos zerados.</div>';return;}
      list.innerHTML=d.items.map(item=>{
        const status=labels[item.status]||item.status;
        const proofs=(item.proofs||[]).map(p=>`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.filename||'Comprovante')}</a>`).join('');
        return `<article class="portal-submission"><div><h4>${item.kind==='platina'?'💎':item.kind==='run'?'⚔':'🏆'} ${esc(item.game)}</h4><p>${item.kind==='platina'?'Platina':item.kind==='run'?'Run Soulslike':'Jogo zerado'} · ${esc(item.platform)} · ${esc(item.date)}<br>${esc(item.comment||'')}</p>${proofs?`<div class="portal-proof-links">${proofs}</div>`:''}${item.status==='pending'?`<div class="portal-proof-links"><button data-cancel-kind="${esc(item.kind)}" data-cancel-id="${item.id}">Cancelar envio</button></div>`:''}</div><span class="portal-status ${esc(item.status)}">${esc(status)}</span></article>`;
      }).join('');
    } catch(e){list.innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
  }
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-cancel-kind]');if(!b)return;if(!confirm('Cancelar este envio pendente?'))return;try{await fetch(`/api/portal/mine/${b.dataset.cancelKind}/${b.dataset.cancelId}`,{method:'DELETE',credentials:'same-origin'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao cancelar');});loadPortalSubmissions();showNotice('Envio cancelado.','success');}catch(err){showNotice(err.message,'error');}});
  document.getElementById('portal-refresh')?.addEventListener('click',loadPortalSubmissions);
  document.addEventListener('click',e=>{if(e.target.closest('[data-tab="submissions"]'))loadPortalSubmissions();});
  document.addEventListener('click',e=>{if(e.target.closest('[data-tab="submit"]')&&!currentUser)showNotice('Entre com Discord para enviar suas conquistas.','info');});
  window.loadPortalSubmissions=loadPortalSubmissions;
  setKind('platina');
})();


// --- NARA Portal: módulos complementares e operações compartilhadas. ---
(() => {
 const $=s=>document.querySelector(s), esc=s=>escapeHTML(s??'');
 const api=async(url,opts={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Falha na operação.');return d;};
 const json=(method,data)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const feedback=(id,msg,bad=false)=>{const e=$(id);if(e){e.hidden=false;e.className='portal-feedback'+(bad?' error':'');e.textContent=msg;}};
 const statusLabel=s=>({pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',changes_requested:'Ajustes solicitados'}[s]||s);
 // Runs: catálogos e submissão com comprovante.
 async function loadRunOptions(){
  if(!currentUser)return;
  try{const d=await api('/api/portal/runs/options');const g=$('#run-game'),c=$('#run-challenge');
   g.innerHTML='<option value="">Selecione o jogo</option>'+d.games.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
   const fill=()=>{const gid=Number(g.value);c.innerHTML='<option value="">Selecione o desafio</option>'+d.challenges.filter(x=>!x.game_id||Number(x.game_id)===gid).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');};
   g.onchange=fill;fill();
  }catch(e){$('#run-game').innerHTML='<option value="">Não foi possível carregar jogos</option>';feedback('#run-feedback',e.message,true);}
 }
 $('#run-proofs')?.addEventListener('change',e=>$('#run-file-list').textContent=[...e.target.files].map(f=>f.name).join(' · ')||'Nenhum arquivo selecionado');
 $('#portal-run-form')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser)return showNotice('Entre com Discord para enviar uma run.','error');
  const form=e.currentTarget,btn=form.querySelector('button[type="submit"],button.primary'),files=[...$('#run-proofs').files];
  if(!files.length||files.length>5||files.some(f=>f.size>8*1024*1024))return feedback('#run-feedback','Anexe de 1 a 5 arquivos de até 8 MB cada.',true);
  btn.disabled=true;btn.textContent='Enviando…';
  try{const d=await api('/api/portal/runs',{method:'POST',body:new FormData(form)});feedback('#run-feedback',`Run #${d.id} enviada e aguardando aprovação.`);form.reset();$('#run-file-list').textContent='Nenhum arquivo selecionado';}
  catch(err){feedback('#run-feedback',err.message,true);}finally{btn.disabled=false;btn.textContent='Enviar run →';}
 });
 // Ports e mods.
 let catalogKind='ports';
 async function loadCatalog(){
  const q=$('#catalog-search')?.value||'';
  $('#catalog-title').textContent=catalogKind==='ports'?'Ports disponíveis':'Mods disponíveis';
  try{const d=await api(`/api/portal/catalog?kind=${catalogKind}&q=${encodeURIComponent(q)}`);
   $('#catalog-list').innerHTML=d.items.length?d.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.name)}</h4><p>${esc(x.platform||x.game||'')} · ${esc(x.description||'Sem descrição')}</p><div class="portal-proof-links"><a href="${esc(x.link)}" target="_blank" rel="noopener">Abrir download</a>${x.tutorial?`<a href="${esc(x.tutorial)}" target="_blank" rel="noopener">Tutorial</a>`:''}${x.iso?`<a href="${esc(x.iso)}" target="_blank" rel="noopener">ISO</a>`:''}</div></div><span class="portal-status approved">Publicado</span></article>`).join(''):'<div class="portal-empty">Nenhum item encontrado.</div>';
  }catch(e){$('#catalog-list').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 document.querySelectorAll('[data-catalog-kind]').forEach(b=>b.addEventListener('click',()=>{catalogKind=b.dataset.catalogKind;const gf=$('.catalog-game-field');if(gf){gf.hidden=catalogKind==='ports';gf.querySelector('input').required=catalogKind==='mods';}document.querySelectorAll('[data-catalog-kind]').forEach(x=>x.classList.toggle('on',x===b));$('#catalog-item-label').innerHTML=(catalogKind==='ports'?'Nome do port':'Nome do mod')+'<input name="name" required maxlength="120">';$('.catalog-extra').hidden=catalogKind!=='ports';loadCatalog();}));
 $('#catalog-search')?.addEventListener('input',()=>{clearTimeout(window._catalogTimer);window._catalogTimer=setTimeout(loadCatalog,250);});
 $('#catalog-suggest-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser)return showNotice('Entre com Discord para sugerir conteúdo.','error');
  const f=new FormData(e.currentTarget),data=Object.fromEntries(f.entries());try{await api(`/api/portal/catalog/${catalogKind}`,json('POST',data));feedback('#catalog-feedback','Sugestão enviada. Ela ficará pendente até aprovação.');e.currentTarget.reset();}catch(err){feedback('#catalog-feedback',err.message,true);}
 });
 // Contribuições comunitárias.
 async function loadContributions(){
  try{const d=await api('/api/portal/contributions?status=approved');$('#contribution-list').innerHTML=d.items.length?d.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.title)}</h4><p>${esc(x.game_name||'Comunidade')} · ${esc(x.kind)}<br>${esc(x.summary||x.content.slice(0,240))}</p><div class="portal-proof-links"><button data-community-action="like" data-id="${x.id}">♡ Curtir</button><button data-community-action="bookmark" data-id="${x.id}">☆ Favoritar</button>${x.kind==='challenge'?`<button data-community-action="challenge" data-id="${x.id}">Participar</button>`:''}</div></div><span class="portal-status approved">Publicado</span></article>`).join(''):'<div class="portal-empty">Ainda não há contribuições publicadas.</div>';
   if(currentUser){const mine=await api('/api/portal/contributions?mine=1');$('#my-contribution-list').innerHTML=mine.items.length?mine.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.title)}</h4><p>${esc(x.kind)} · ${esc(x.game_name||'Comunidade')}<br>${esc(x.review_note||'')}</p></div><span class="portal-status">${esc(statusLabel(x.status))}</span></article>`).join(''):'<div class="portal-empty">Você ainda não enviou contribuições.</div>';}
   if(currentUser){const fav=await api('/api/portal/community/favorites');$('#community-favorites').innerHTML=fav.items.length?fav.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.target_type)} #${x.target_id}</h4><p>Salvo nos favoritos</p></div></article>`).join(''):'<div class="portal-empty">Nenhum favorito salvo.</div>';}
  }catch(e){$('#contribution-list').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 $('#contribution-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser)return showNotice('Entre com Discord para contribuir.','error');const data=Object.fromEntries(new FormData(e.currentTarget).entries());try{const d=await api('/api/portal/contributions',json('POST',data));feedback('#contribution-feedback',`Contribuição #${d.id} enviada para revisão.`);e.currentTarget.reset();}catch(err){feedback('#contribution-feedback',err.message,true);}});
 $('#contribution-refresh')?.addEventListener('click',loadContributions);
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-community-action]');if(!b)return;if(!currentUser)return showNotice('Entre com Discord para interagir.','error');try{if(b.dataset.communityAction==='like')await api('/api/portal/community/interact',json('POST',{target_type:'contribution',target_id:Number(b.dataset.id),reaction:'like'}));else if(b.dataset.communityAction==='challenge')await api('/api/portal/community/challenge',json('POST',{contribution_id:Number(b.dataset.id),action:'join'}));else await api('/api/portal/community/bookmark',json('POST',{target_type:'contribution',target_id:Number(b.dataset.id)}));b.textContent=b.dataset.communityAction==='like'?'♥ Curtido':b.dataset.communityAction==='challenge'?'✓ Inscrito':'★ Salvo';}catch(err){showNotice(err.message,'error');}});
 // Perfil persistente do banco do bot.
 async function loadPortalProfile(){
  if(!currentUser)return;try{const d=await api('/api/portal/profile'),p=d.profile||{},f=$('#portal-profile-form');
   for(const k of ['tagline','fav_game','theme','bio'])if(f.elements[k])f.elements[k].value=p[k]||'';
   let links={};try{links=JSON.parse(p.links||'{}')}catch(_){}f.elements.social.value=links.social||'';
  }catch(e){feedback('#profile-feedback',e.message,true);}
 }
 $('#portal-profile-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser)return showNotice('Entre com Discord para editar o perfil.','error');const f=e.currentTarget;const data={tagline:f.elements.tagline.value,fav_game:f.elements.fav_game.value,theme:f.elements.theme.value,bio:f.elements.bio.value,links:{social:f.elements.social.value}};try{await api('/api/portal/profile',json('POST',data));feedback('#profile-feedback','Perfil atualizado.');}catch(err){feedback('#profile-feedback',err.message,true);}});
 // Caixa de notificações e preferências.
 const prefNames={approvals:'Aprovações',rejections:'Rejeições',levels:'Subida de nível',replies:'Respostas',challenges:'Desafios'};
 async function loadNotifications(){
  if(!currentUser){$('#notifications-list').innerHTML='<div class="portal-empty">Entre com Discord para ver notificações.</div>';return;}
  try{const d=await api('/api/portal/notifications');$('#notifications-list').innerHTML=d.items.length?d.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.category)}</h4><p>${esc(x.message)}<br>${esc(x.created_at)}</p></div><span class="portal-status">Nova</span></article>`).join(''):'<div class="portal-empty">Você não tem notificações pendentes.</div>';
   $('#notification-prefs').innerHTML=Object.entries(d.preferences).map(([k,v])=>`<label class="portal-pref"><span>${prefNames[k]||k}</span><input type="checkbox" data-notif-pref="${k}" ${v?'checked':''}></label>`).join('');
  }catch(e){$('#notifications-list').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 $('#notifications-read')?.addEventListener('click',async()=>{try{await api('/api/portal/notifications',json('POST',{action:'read_all'}));loadNotifications();}catch(e){showNotice(e.message,'error');}});
 $('#notification-prefs')?.addEventListener('change',async e=>{const c=e.target.closest('[data-notif-pref]');if(!c)return;try{await api('/api/portal/notifications',json('POST',{key:c.dataset.notifPref,enabled:c.checked}));}catch(err){showNotice(err.message,'error');}});
 // Fila de moderação; a mesma lógica de recompensa do bot.
 async function loadAdminQueue(){
  if(!currentUser)return;try{const d=await api('/api/portal/admin/queue');$('#admin-queue').innerHTML=d.items.length?d.items.map(x=>`<article class="portal-submission"><div><h4>#${x.id} · ${esc(x.game||x.title||x.name||'Solicitação')}</h4><p>${esc(x.kind)} · usuário ${esc(x.user_id||x.autor_id||'—')} · ${esc(x.platform||x.challenge||x.status||'')}</p>${(x.proof_url||(x.proofs||[]).length)?`<div class="portal-proof-links">${x.proof_url?`<a href="${esc(x.proof_url)}" target="_blank" rel="noopener">Ver comprovante</a>`:''}${(x.proofs||[]).map(p=>`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.filename||'Comprovante')}</a>`).join('')}</div>`:''}<div class="portal-proof-links"><button data-admin-action="approved" data-kind="${esc(x.queue_kind||x.kind)}" data-id="${x.id}">Aprovar</button><button data-admin-action="rejected" data-kind="${esc(x.queue_kind||x.kind)}" data-id="${x.id}">Rejeitar</button>${x.queue_kind==='contribution'?`<button data-admin-action="changes_requested" data-kind="contribution" data-id="${x.id}">Pedir ajustes</button>`:''}</div></div><span class="portal-status">Pendente</span></article>`).join(''):'<div class="portal-empty">Nenhuma solicitação pendente.</div>';}
  catch(e){$('#admin-queue').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 $('#admin-refresh')?.addEventListener('click',loadAdminQueue);
 async function loadAdminConfig(){try{const d=await api('/api/portal/admin/config');$('#admin-config-fields').innerHTML=d.settings.map(x=>`<label>${esc(x.label)}<input name="${esc(x.key)}" value="${esc(x.value)}"></label>`).join('');}catch(e){$('#admin-config-fields').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}}
 $('#admin-config-refresh')?.addEventListener('click',loadAdminConfig);
 $('#admin-config-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{for(const [key,value] of new FormData(f).entries())await api('/api/portal/admin/config',json('POST',{key,value}));feedback('#admin-config-feedback','Configurações salvas.');}catch(err){feedback('#admin-config-feedback',err.message,true);}});
 async function loadAdminNews(){try{const d=await api('/api/portal/admin/news');$('#admin-news-channel-form').elements.channel_id.value=d.channel_id||'';$('#admin-news-feeds').innerHTML=d.feeds.length?d.feeds.map(x=>`<article class="portal-submission"><div><h4>#${x.id} · ${esc(x.nome)}</h4><p><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a><br>${x.ativo?'Ativo':'Inativo'} · ${x.inicializado?'Sincronizado':'Aguardando sincronização'}</p></div><button class="secondary" data-news-remove="${x.id}">Remover</button></article>`).join(''):'<div class="portal-empty">Nenhum feed cadastrado.</div>';}catch(e){$('#admin-news-feeds').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}}
 $('#admin-news-refresh')?.addEventListener('click',loadAdminNews);
 $('#admin-news-channel-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/portal/admin/news',json('POST',{action:'channel',channel_id:e.currentTarget.elements.channel_id.value.trim()}));feedback('#admin-news-channel-feedback','Canal do Radar salvo.');}catch(err){feedback('#admin-news-channel-feedback',err.message,true);}});
 $('#admin-news-add-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/api/portal/admin/news',json('POST',{action:'add',name:f.elements.name.value,url:f.elements.url.value}));f.reset();feedback('#admin-news-add-feedback','Feed validado e adicionado.');loadAdminNews();}catch(err){feedback('#admin-news-add-feedback',err.message,true);}});
 async function loadAdminRoles(){
  try{const d=await api('/api/portal/admin/roles');const sel=$('#admin-role-options');const chosen=new Set(d.roles.map(x=>String(x.id)));sel.innerHTML=d.available.map(x=>`<option value="${x.id}" ${chosen.has(String(x.id))?'selected':''} ${x.managed?'disabled':''}>${esc(x.name)}${x.managed?' (gerenciado)':''}</option>`).join('');}
  catch(e){$('#admin-role-options').innerHTML='';feedback('#admin-roles-feedback',e.message,true);}
 }
 $('#admin-roles-refresh')?.addEventListener('click',loadAdminRoles);
 $('#admin-roles-form')?.addEventListener('submit',async e=>{e.preventDefault();const ids=[...$('#admin-role-options').selectedOptions].map(x=>x.value);try{await api('/api/portal/admin/roles',json('POST',{action:'save',role_ids:ids}));feedback('#admin-roles-feedback','Cargos selecionáveis salvos.');}catch(err){feedback('#admin-roles-feedback',err.message,true);}});
 async function loadAdminPanelChannels(){
  try{const d=await api('/api/portal/admin/panels');$('#admin-panel-channels').innerHTML=d.channels.map(x=>`<option value="${x.id}">#${esc(x.name)}</option>`).join('');}
  catch(e){$('#admin-panel-channels').innerHTML='';feedback('#admin-panels-feedback',e.message,true);}
 }
 $('#admin-panels-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const d=await api('/api/portal/admin/panels',json('POST',{kind:f.elements.kind.value,channel_id:f.elements.channel_id.value}));feedback('#admin-panels-feedback',`Painel ${d.updated?'atualizado':'publicado'} no Discord (mensagem ${d.message_id}).`);}catch(err){feedback('#admin-panels-feedback',err.message,true);}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-news-remove]');if(!b)return;if(!confirm('Remover esta fonte RSS?'))return;try{await api('/api/portal/admin/news',json('POST',{action:'remove',id:b.dataset.newsRemove}));b.closest('.portal-submission').remove();}catch(err){showNotice(err.message,'error');}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-admin-action]');if(!b)return;const note=b.dataset.adminAction==='rejected'||b.dataset.adminAction==='changes_requested'?prompt('Motivo ou orientação (opcional):')||'':'';try{await api(b.dataset.kind==='ports'||b.dataset.kind==='mods'?`/api/portal/catalog/${b.dataset.kind}/${b.dataset.id}`:`/api/portal/admin/${b.dataset.kind}/${b.dataset.id}`,json('POST',{action:b.dataset.adminAction,note}));b.closest('.portal-submission').remove();showNotice('Decisão registrada.','success');}catch(err){showNotice(err.message,'error');}});
 // Load on navigation; guard all user-scoped actions by Discord login.
 document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]')?.dataset.tab;
  if(tab==='runs')loadRunOptions();
  if(tab==='library')loadCatalog();
  if(tab==='community-web')loadContributions();
  if(tab==='profile-web')loadPortalProfile();
  if(tab==='notifications-web')loadNotifications();
  if(tab==='admin-web'){loadAdminQueue();loadAdminConfig();loadAdminNews();loadAdminRoles();loadAdminPanelChannels();}
 });
})();

// Loja de Denários do NARA (mesma economia do bot).
(() => {
 const $=s=>document.querySelector(s), esc=s=>escapeHTML(s??'');
 async function call(url,opts={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Operação não concluída.');return d;}
 const post=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 async function loadStore(){
  if(!currentUser){$('#store-items').innerHTML='<div class="portal-empty">Entre com Discord para acessar a loja.</div>';return;}
  try{const d=await call('/api/portal/store');$('#store-balance').textContent=`Denários: ${number(d.balance)}`;
   $('#store-items').innerHTML=d.items.map(x=>`<article class="portal-submission"><div><h4>${esc(x.emoji)} ${esc(x.name)}</h4><p>${esc(x.description)} · ${x.price} Denários · nível ${x.min_level}+</p></div><div>${x.owned?`<button class="secondary" data-store-action="${x.equipped?'unequip':'equip'}" data-item="${esc(x.id)}">${x.equipped?'Desequipar':'Equipar'}</button>`:`<button class="primary" data-store-action="buy" data-item="${esc(x.id)}">Comprar · ${x.price}</button>`}</div></article>`).join('');
   $('#store-inventory').innerHTML=d.inventory.length?d.inventory.map(x=>`<article class="portal-submission"><div><h4>${esc(x.item)}</h4><p>${esc(x.tipo)}</p></div><span class="portal-status ${x.equipado?'approved':''}">${x.equipado?'Equipado':'No inventário'}</span></article>`).join(''):'<div class="portal-empty">Seu inventário ainda está vazio.</div>';
  }catch(e){$('#store-items').innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-store-action]');if(!b)return;if(!currentUser)return showNotice('Entre com Discord para usar a loja.','error');b.disabled=true;try{await call('/api/portal/store/action',post({action:b.dataset.storeAction,item:b.dataset.item}));showNotice('Loja atualizada.','success');loadStore();}catch(err){showNotice(err.message,'error');}finally{b.disabled=false;}});
 document.addEventListener('click',e=>{if(e.target.closest('[data-tab="store-web"]'))loadStore();});
})();

// Santuários: visita, livro de visitas, honras e seguir.
(() => {
 const $=s=>document.querySelector(s), esc=s=>escapeHTML(s??'');
 const api=async(url,opts={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Operação não concluída.');return d;};
 const post=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 async function openSanctuary(id){
  if(!currentUser)return showNotice('Entre com Discord para visitar santuários.','error');
  const box=$('#sanctuary-view');box.innerHTML='<div class="portal-empty">Abrindo santuário…</div>';
  try{const d=await api(`/api/portal/sanctuaries/${encodeURIComponent(id)}`),p=d.profile,s=d.summary,h=d.honors||{};
   box.innerHTML=`<article class="portal-form"><div class="portal-form-head"><div><small class="eyebrow">SANTUÁRIO DO GUERREIRO</small><h3>${esc(p.tagline||'Santuário')}</h3><p>${esc(p.fav_game||'Jogo favorito não informado')}</p></div><span class="pending-pill">${d.followers} seguidores</span></div><p>${esc(p.bio||'Este jogador ainda não escreveu sua biografia.')}</p><div class="me-stats"><div><b>${number(s.platinas||0)}</b><small>Platinas</small></div><div><b>${number(s.zerados||0)}</b><small>Zerados</small></div><div><b>${number(s.xp||0)}</b><small>XP</small></div><div><b>${number(Object.values(h).reduce((a,b)=>a+b,0))}</b><small>Honras</small></div></div>${!d.is_owner?`<div class="portal-proof-links"><button data-sanctuary-follow="${id}">Seguir jogador</button><button data-honor="respect" data-user="${id}">Conceder respeito</button><button data-honor="determination" data-user="${id}">Determinação</button><button data-honor="greatness" data-user="${id}">Grandeza</button></div>`:''}</article>
   <div class="portal-form"><h3>Livro de visitas</h3>${d.messages.map(m=>`<article class="portal-submission"><div><p>${esc(m.message)}</p><small>${esc(m.created_at)}</small></div>${d.is_owner?`<button data-guestbook-delete="${m.id}" data-owner="${id}">Apagar</button>`:''}</article>`).join('')||'<p class="muted">Ainda não há mensagens.</p>'}${!d.is_owner?`<form id="guestbook-form" data-owner="${id}"><label>Deixe uma mensagem<textarea name="message" rows="3" maxlength="300" required></textarea></label><button class="primary">Enviar mensagem</button></form>`:''}</div>`;
  }catch(e){box.innerHTML=`<div class="portal-empty">${esc(e.message)}</div>`;}
 }
 $('#sanctuary-open')?.addEventListener('click',()=>{const id=$('#sanctuary-user-id').value.trim()||String(currentUser?.id||'');if(!id)return showNotice('Informe o ID Discord.','error');openSanctuary(id);});
 document.addEventListener('submit',async e=>{if(e.target.id!=='guestbook-form')return;e.preventDefault();try{await api(`/api/portal/sanctuaries/${e.target.dataset.owner}/guestbook`,post({message:e.target.elements.message.value}));openSanctuary(e.target.dataset.owner);}catch(err){showNotice(err.message,'error');}});
 document.addEventListener('click',async e=>{
  const f=e.target.closest('[data-sanctuary-follow]');if(f){try{await api('/api/portal/community/follow',post({user_id:Number(f.dataset.sanctuaryFollow)}));showNotice('Preferência de acompanhamento atualizada.','success');}catch(err){showNotice(err.message,'error');}}
  const h=e.target.closest('[data-honor]');if(h){try{await api('/api/portal/sanctuaries/honor',post({user_id:Number(h.dataset.user),honor_key:h.dataset.honor}));showNotice('Honra registrada.','success');}catch(err){showNotice(err.message,'error');}}
  const del=e.target.closest('[data-guestbook-delete]');if(del){try{await api(`/api/portal/sanctuaries/${del.dataset.owner}/guestbook?id=${del.dataset.guestbookDelete}`,{method:'DELETE'});openSanctuary(del.dataset.owner);}catch(err){showNotice(err.message,'error');}}
 });
 document.addEventListener('click',e=>{if(e.target.closest('[data-tab="sanctuary-web"]')&&currentUser){$('#sanctuary-user-id').value=String(currentUser.id);openSanctuary(currentUser.id);}});
})();

// NARA IA no portal: reutiliza o mesmo motor, limites e memória do bot.
(() => {
 const $=s=>document.querySelector(s);
 const api=async(url,opts={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível concluir.');return d;};
 const post=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 function bubble(text,who){const p=document.createElement('div');p.className='nara-msg '+who;p.textContent=text;$('#nara-web-log').appendChild(p);$('#nara-web-log').scrollTop=$('#nara-web-log').scrollHeight;return p;}
 $('#nara-web-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!currentUser)return showNotice('Entre com Discord para conversar com a NARA.','error');const f=e.currentTarget,q=f.elements.message.value.trim();if(!q)return;f.elements.message.value='';bubble(q,'me');const wait=bubble('A NARA está pensando…','bot');const btn=f.querySelector('button');btn.disabled=true;try{const d=await api('/api/portal/nara/chat',post({message:q}));wait.textContent=d.reply||'Sem resposta.';}catch(err){wait.textContent=err.message;}finally{btn.disabled=false;}});
 async function loadMemory(){if(!currentUser)return;try{const d=await api('/api/portal/nara/memory');$('#nara-memory-status').textContent=d.enabled?'Memória ativada':'Memória desativada';$('#nara-memory-detail').textContent=`${d.messages} mensagens armazenadas. O histórico segue os prazos de retenção configurados pela NARA.`;}catch(e){$('#nara-memory-status').textContent='Indisponível';$('#nara-memory-detail').textContent=e.message;}}
 async function memoryAction(action){if(!currentUser)return showNotice('Entre com Discord para alterar a memória.','error');if(action==='delete'&&!confirm('Apagar o histórico de memória da NARA associado à sua conta?'))return;try{await api('/api/portal/nara/memory',post({action}));showNotice('Preferência de memória atualizada.','success');loadMemory();}catch(e){showNotice(e.message,'error');}}
 $('#nara-memory-enable')?.addEventListener('click',()=>memoryAction('enable'));
 $('#nara-memory-disable')?.addEventListener('click',()=>memoryAction('disable'));
 $('#nara-memory-delete')?.addEventListener('click',()=>memoryAction('delete'));
 document.addEventListener('click',e=>{if(e.target.closest('[data-tab="nara-web"]'))loadMemory();});
})();
