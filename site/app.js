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
    $('#profile-name').textContent = 'Conta Discord';
    $('#profile-status').textContent = `ID ${text(currentUser?.id)}`;
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
