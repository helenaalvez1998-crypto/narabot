const $ = (selector) => document.querySelector(selector);
let collection = [];
let currentUser = null;
let savedDeck = [];
let selectedDeck = [];
let currentDuelId = null;
let duelRefreshHandle = null;
let duelSocket = null;

const text = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const number = (value) => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
const imageUrl = (card) => card.image_url || `/api/cards/${encodeURIComponent(card.id)}/image`;

function showNotice(message, kind = 'info') {
  const notice = $('#notice');
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  notice.hidden = !message;
}

function showPage(page) {
  document.querySelectorAll('.page').forEach((element) => element.classList.toggle('show', element.id === page));
  document.querySelectorAll('.nav').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  $('#page-title').textContent = page === 'collection' ? 'Minha coleção' : page === 'deck' ? 'Meu deck' : page === 'duels' ? 'Meus duelos' : page === 'gwent' ? 'Arena Gwent' : 'Visão geral';
  if (page === 'deck') loadDeck();
  if (page === 'duels') loadDuels();
}

document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.go)));

function cardMarkup(card) {
  return `<button class="game-card" type="button" data-card-id="${escapeHTML(card.id)}">
    <div class="card-image-wrap"><img class="card-image" src="${escapeHTML(imageUrl(card))}" alt="${escapeHTML(card.nome)}" loading="lazy"><span class="quantity">×${number(card.quantidade)}</span></div>
    <div class="card-meta"><small class="rarity rarity-${raritySlug(card.raridade)}">${escapeHTML(text(card.raridade))}</small><b>${escapeHTML(text(card.nome))}</b><small>${escapeHTML(text(card.categoria))} · ${escapeHTML(text(card.tipo))}</small><span class="power">✦ ${number(card.poder)} poder</span></div>
  </button>`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function raritySlug(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function renderCollection() {
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const rarity = $('#rarity').value;
  const category = $('#category').value;
  const type = $('#type').value;
  const filtered = collection.filter((card) => {
    const searchable = `${card.nome || ''} ${card.habilidade || ''} ${card.descricao || ''} ${card.jogo_origem || ''}`.toLocaleLowerCase('pt-BR');
    return (!query || searchable.includes(query)) && (!rarity || card.raridade === rarity) && (!category || card.categoria === category) && (!type || card.tipo === type);
  });
  $('#collection-grid').innerHTML = filtered.length ? filtered.map(cardMarkup).join('') : '<div class="empty-state">Nenhuma carta corresponde aos filtros.</div>';
  $('#collection-total').textContent = `${filtered.length} de ${collection.length} cartas`;
}

function renderDashboard(data) {
  const summary = data.summary || {};
  $('#souls').textContent = number(summary.souls);
  $('#denarios').textContent = number(summary.denarios);
  $('#home-souls').textContent = number(summary.souls);
  $('#home-denarios').textContent = number(summary.denarios);
  $('#total-cards').innerHTML = `${number(summary.cards)} <i>cartas</i>`;
  $('#deck-cards').innerHTML = `${number(summary.deck_cards)} <i>cartas</i>`;
  $('#featured').innerHTML = collection.slice(0, 4).map(cardMarkup).join('') || '<div class="empty-state">Sua coleção ainda está vazia.</div>';
  const categories = [...new Set(collection.map((card) => card.categoria).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  $('#category').innerHTML = '<option value="">Todas as categorias</option>' + categories.map((value) => `<option>${escapeHTML(value)}</option>`).join('');
  renderCollection();
}

async function loadAccount() {
  try {
    const meResponse = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!meResponse.ok) {
      currentUser = null;
      $('#profile-name').textContent = 'Visitante';
      $('#profile-status').textContent = 'Conecte sua conta Discord';
      $('#login-button').hidden = false;
      $('#logout-button').hidden = true;
      showNotice('Entre com sua conta Discord para visualizar suas cartas e recursos reais.');
      return;
    }
    const me = await meResponse.json();
    currentUser = me.user;
    $('#profile-name').textContent = 'Conta Discord';
    $('#profile-status').textContent = `ID ${text(currentUser?.id)}`;
    $('#login-button').hidden = true;
    $('#logout-button').hidden = false;
    const response = await fetch('/api/collection', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sua sessão expirou. Entre novamente com Discord.' : 'Falha ao consultar a coleção.');
    const data = await response.json();
    collection = Array.isArray(data.collection) ? data.collection : [];
    renderDashboard(data);
    showNotice(`Coleção sincronizada: ${collection.length} cartas carregadas do SoulsBot.`, 'success');
  } catch (error) {
    showNotice(error.message || 'Não foi possível conectar ao servidor.', 'error');
  }
}

async function loadDeck() {
  if (!currentUser) return;
  const status = $('#deck-status');
  status.textContent = 'Sincronizando com o deck do Discord...';
  try {
    const response = await fetch('/api/deck', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sua sessão expirou. Entre novamente com Discord.' : 'Não foi possível carregar o deck.');
    const data = await response.json();
    savedDeck = Array.isArray(data.deck) ? data.deck : [];
    selectedDeck = savedDeck.map(card => card.id);
    renderDeck();
    status.textContent = savedDeck.length === 5 ? 'Deck carregado. Ele é o mesmo utilizado nos duelos do Discord.' : 'Você ainda não tem um deck salvo. Escolha cinco cartas para montar seu deck.';
  } catch (error) { status.textContent = error.message; }
}

function deckValidation(cards) {
  if (cards.length > 5) return 'O deck aceita exatamente cinco cartas.';
  const cost = cards.reduce((sum, card) => sum + Number(card.custo || 0), 0);
  if (cost > 12) return `Custo ${cost}/12: remova uma carta para respeitar o limite.`;
  if (cards.filter(card => card.raridade === 'Lendária').length > 1) return 'O deck pode conter no máximo uma carta Lendária.';
  if (new Set(cards.map(card => card.id)).size !== cards.length) return 'Não é permitido repetir cartas.';
  return '';
}

function renderDeck() {
  const chosen = selectedDeck.map(id => collection.find(card => card.id === id)).filter(Boolean);
  const cost = chosen.reduce((sum, card) => sum + Number(card.custo || 0), 0);
  const error = deckValidation(chosen);
  $('#deck-count').textContent = `${chosen.length}/5 cartas`;
  $('#deck-grid').innerHTML = Array.from({length:5}, (_, index) => {
    const card = chosen[index];
    return card ? `<article class="deck-slot"><img src="${escapeHTML(imageUrl(card))}" alt="${escapeHTML(card.nome)}"><div><b>${escapeHTML(card.nome)}</b><small>${escapeHTML(card.raridade)} · custo ${number(card.custo)}</small><button type="button" data-remove-deck="${escapeHTML(card.id)}">Remover</button></div></article>` : `<div class="deck-slot empty-slot"><span>${index + 1}</span><small>Espaço disponível</small></div>`;
  }).join('');
  $('#deck-summary').textContent = `Cartas: ${chosen.length}/5 · Custo: ${cost}/12 · Lendárias: ${chosen.filter(card => card.raridade === 'Lendária').length}/1` + (error ? ` · ${error}` : '');
  $('#save-deck').disabled = chosen.length !== 5 || Boolean(error) || JSON.stringify(selectedDeck) === JSON.stringify(savedDeck.map(card => card.id));
  const query = ($('#deck-search').value || '').trim().toLocaleLowerCase('pt-BR');
  const selected = new Set(selectedDeck);
  const available = collection.filter(card => !selected.has(card.id) && (!query || card.nome.toLocaleLowerCase('pt-BR').includes(query)));
  $('#deck-available').innerHTML = available.map(card => `<article class="available-card"><img src="${escapeHTML(imageUrl(card))}" alt=""><div><b>${escapeHTML(card.nome)}</b><small>${escapeHTML(card.raridade)} · ${escapeHTML(card.tipo)} · custo ${number(card.custo)}</small></div><button type="button" data-add-deck="${escapeHTML(card.id)}" ${chosen.length >= 5 ? 'disabled' : ''}>Adicionar</button></article>`).join('') || '<div class="empty-state">Nenhuma carta disponível para esse filtro.</div>';
}

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-deck]');
  const remove = event.target.closest('[data-remove-deck]');
  if (add && selectedDeck.length < 5) { selectedDeck.push(add.dataset.addDeck); renderDeck(); }
  if (remove) { selectedDeck = selectedDeck.filter(id => id !== remove.dataset.removeDeck); renderDeck(); }
});
$('#deck-search').addEventListener('input', renderDeck);
$('#clear-deck').addEventListener('click', () => { selectedDeck = []; renderDeck(); });
$('#save-deck').addEventListener('click', async () => {
  const button = $('#save-deck');
  button.disabled = true; button.textContent = 'Salvando...';
  try {
    const response = await fetch('/api/deck', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({card_ids: selectedDeck}) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível salvar o deck.');
    savedDeck = data.deck || [];
    selectedDeck = savedDeck.map(card => card.id);
    $('#deck-status').textContent = 'Deck salvo no banco compartilhado. Ele já está disponível para os duelos do Discord.';
    showNotice('Deck sincronizado com o SoulsBot e com o Discord.', 'success');
    renderDeck();
  } catch (error) { $('#deck-status').textContent = error.message; }
  finally { button.textContent = 'Salvar deck no SoulsBot'; renderDeck(); }
});


async function loadPlayers() {
  if (!currentUser) return;
  try {
    await fetch('/api/presence/heartbeat', {method:'POST', credentials:'same-origin'});
    const response = await fetch('/api/players', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar jogadores.');
    const players = (data.players || []).filter(player => !player.is_self);
    $('#challenge-player').innerHTML = '<option value="">Selecione um jogador</option>' + players.map(player => {
      const status = player.web_online ? ' · no site' : ` · Discord: ${player.discord_presence}`;
      return `<option value="${escapeHTML(player.id)}">${escapeHTML(player.name)}${escapeHTML(status)}</option>`;
    }).join('');
    $('#players-presence').textContent = players.length ? players.map(player => `${player.name}: ${player.web_online ? 'site online' : `Discord ${player.discord_presence}`}`).join(' · ') : 'Nenhum outro jogador disponível no servidor.';
  } catch (error) {
    $('#players-presence').textContent = error.message;
  }
}

async function sendChallenge() {
  const opponent_id = $('#challenge-player').value;
  const aposta = Number($('#challenge-bet').value);
  const button = $('#send-challenge');
  if (!opponent_id) return showNotice('Selecione um jogador para desafiar.', 'error');
  if (!Number.isInteger(aposta) || aposta < 0 || aposta > 500) return showNotice('A aposta deve ser um número inteiro entre 0 e 500.', 'error');
  button.disabled = true; button.textContent = 'Enviando...';
  try {
    const response = await fetch('/api/duels', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({opponent_id, aposta})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar o convite.');
    showNotice(`Convite #${data.duel_id} publicado no Discord.`, 'success');
    if (data.discord_message) window.open(data.discord_message, '_blank', 'noopener');
    await loadDuels();
  } catch (error) { showNotice(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Enviar convite'; }
}

async function loadDuels() {
  const list = $('#duel-list');
  if (!currentUser) { list.innerHTML = '<div class="empty-state">Entre com Discord para consultar seus duelos.</div>'; return; }
  list.innerHTML = '<div class="empty-state">Sincronizando duelos...</div>';
  try {
    const response = await fetch('/api/duels', {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os duelos.');
    const duels = data.duels || [];
    list.innerHTML = duels.length ? duels.map(duel => `<article class="duel-item"><div><small class="eyebrow">DUELO #${number(duel.id)}</small><h3>${duel.is_creator ? 'Você desafiou um jogador' : 'Você recebeu um convite'}</h3><p>${escapeHTML(duel.status)} · Rodada ${number(duel.current_round)}/5 · Aposta ${number(duel.aposta)} Denários por jogador</p></div><button class="primary" data-open-duel="${duel.id}">${duel.status === 'invited' && !duel.is_creator ? 'Aceitar convite' : 'Abrir partida'}</button></article>`).join('') : '<div class="empty-state">Você ainda não tem convites ou partidas registrados.</div>';
  } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`; }
}

function connectDuelLive(duelId) {
  if (duelSocket) { try { duelSocket.close(); } catch (_) {} duelSocket = null; }
  if (duelRefreshHandle) { clearInterval(duelRefreshHandle); duelRefreshHandle = null; }
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  duelSocket = new WebSocket(`${scheme}//${window.location.host}/ws/duels/${encodeURIComponent(duelId)}`);
  duelSocket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.duel_id === Number(currentDuelId) && payload.type !== 'connected') refreshCurrentDuel();
    } catch (_) {}
  });
  // Fallback para redes/proxies que não mantenham WebSocket aberto.
  duelRefreshHandle = window.setInterval(() => refreshCurrentDuel(), 10000);
}

async function refreshCurrentDuel() {
  if (!currentDuelId || $('#duel-room').hidden) return;
  try {
    const response = await fetch(`/api/duels/${currentDuelId}`, {credentials:'same-origin', cache:'no-store'});
    const data = await response.json();
    if (response.ok) renderDuel(data);
  } catch (_) { /* A próxima tentativa automática fará a recuperação. */ }
}

async function openDuel(duelId) {
  currentDuelId = Number(duelId);
  connectDuelLive(currentDuelId);
  showPage('duels');
  const room = $('#duel-room');
  room.hidden = false;
  room.innerHTML = '<div class="empty-state">Carregando arena...</div>';
  try {
    let response = await fetch(`/api/duels/${currentDuelId}`, {credentials:'same-origin', cache:'no-store'});
    let data = await response.json();
    if (!response.ok && data.error === 'Duelo não encontrado.') throw new Error(data.error);
    if (!response.ok) {
      const accept = await fetch(`/api/duels/${currentDuelId}/accept`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}'});
      const accepted = await accept.json();
      if (!accept.ok) throw new Error(accepted.error || 'Não foi possível aceitar o convite.');
      response = await fetch(`/api/duels/${currentDuelId}`, {credentials:'same-origin', cache:'no-store'});
      data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir a partida.');
      showNotice('Convite aceito. As apostas foram travadas e a partida começou.', 'success');
    }
    renderDuel(data);
  } catch (error) { room.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`; }
}

function renderDuel(data) {
  const room = $('#duel-room');
  const duel = data.duel;
  const score = data.score || {};
  const isInvite = duel.status === 'invited';
  const cards = data.available_cards || [];
  const rounds = data.rounds || [];
  room.hidden = false;
  room.innerHTML = `<div class="section-head"><div><small class="eyebrow">ARENA · DUELO #${number(duel.id)}</small><h2>${duel.status === 'active' ? `Rodada ${duel.current_round}/5` : escapeHTML(duel.status)}</h2></div><button class="text-btn" id="close-duel">Voltar aos duelos</button></div>
    <div class="duel-score"><b>${number(score.creator || 0)} : ${number(score.opponent || 0)}</b><span>${number(score.rounds_played || 0)} rodada(s) concluída(s) · ${number(score.choices_received || 0)}/2 escolhas na rodada atual</span></div>
    ${isInvite ? (duel.is_creator ? `<p>Convite enviado. Aguardando o outro jogador aceitar. Aposta: <b>${number(duel.aposta)} Denários</b> por jogador.</p>` : `<p>Você recebeu um convite. Aposta: <b>${number(duel.aposta)} Denários</b> por jogador.</p><button class="primary" id="accept-duel">Aceitar duelo</button>`) : ''}
    ${duel.status === 'active' ? (score.own_choice_submitted ? '<div class="notice">Sua escolha foi registrada. Aguardando o adversário.</div>' : `<p>Escolha uma carta ainda não utilizada. Sua escolha fica oculta até o adversário confirmar.</p><div class="duel-cards">${cards.map(card => `<button class="duel-card" data-play-card="${escapeHTML(card.id)}"><img src="${escapeHTML(card.image_url || `/api/cards/${encodeURIComponent(card.id)}/image`)}" alt=""><b>${escapeHTML(card.nome)}</b><span>${number(card.poder)} poder · ${escapeHTML(card.tipo)}</span></button>`).join('')}</div>`) : ''}
    ${duel.status === 'finished' ? `<div class="notice success">Partida encerrada. ${duel.winner_id ? `Vencedor: ${duel.winner_id}. Prêmio: ${number(duel.payout)} Denários.` : 'Empate.'}</div>` : ''}
    <div class="duel-rounds">${rounds.map(round => `<article><b>Rodada ${number(round.round_no)}</b><span>${escapeHTML(round.card_a_name)} (${number(round.power_a)}) × ${escapeHTML(round.card_b_name)} (${number(round.power_b)})</span><small>${escapeHTML(round.narration || '')}</small></article>`).join('')}</div>`;
  $('#close-duel').addEventListener('click', () => { room.hidden = true; currentDuelId = null; if (duelSocket) duelSocket.close(); duelSocket = null; if (duelRefreshHandle) clearInterval(duelRefreshHandle); duelRefreshHandle = null; loadDuels(); });
  $('#accept-duel')?.addEventListener('click', async () => {
    const response = await fetch(`/api/duels/${duel.id}/accept`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}'});
    const result = await response.json();
    if (!response.ok) { showNotice(result.error || 'Não foi possível aceitar.', 'error'); return; }
    await openDuel(duel.id);
  });
  room.querySelectorAll('[data-play-card]').forEach(button => button.addEventListener('click', async () => {
    room.querySelectorAll('[data-play-card]').forEach(item => item.disabled = true);
    const response = await fetch(`/api/duels/${duel.id}/moves`, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({card_id:button.dataset.playCard})});
    const result = await response.json();
    if (!response.ok) { showNotice(result.error || 'Jogada não registrada.', 'error'); }
    else showNotice(result.status === 'waiting_opponent' ? 'Carta registrada. Aguardando o adversário.' : 'Rodada resolvida.', 'success');
    await openDuel(duel.id);
  }));
}

$('#refresh-duels')?.addEventListener('click', loadDuels);
$('#send-challenge')?.addEventListener('click', sendChallenge);
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open-duel]');
  if (button) openDuel(button.dataset.openDuel);
});

function openCard(card) {
  $('#modal-image').src = imageUrl(card);
  $('#modal-image').alt = card.nome;
  $('#modal-rarity').textContent = text(card.raridade);
  $('#modal-title').textContent = text(card.nome);
  $('#modal-description').textContent = text(card.descricao, 'Esta carta não possui descrição adicional.');
  $('#modal-category').textContent = text(card.categoria);
  $('#modal-type').textContent = text(card.tipo);
  $('#modal-power').textContent = text(card.poder);
  $('#modal-cost').textContent = text(card.custo);
  $('#modal-quantity').textContent = text(card.quantidade);
  $('#modal-skill').textContent = text(card.habilidade);
  $('#card-modal').hidden = false;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-card-id]');
  if (button) {
    const card = collection.find((item) => item.id === button.dataset.cardId);
    if (card) openCard(card);
  }
});
$('#modal-close').addEventListener('click', () => { $('#card-modal').hidden = true; });
$('#card-modal').addEventListener('click', (event) => { if (event.target === $('#card-modal')) $('#card-modal').hidden = true; });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#card-modal').hidden = true; });
['search', 'rarity', 'category', 'type'].forEach((id) => $(`#${id}`).addEventListener('input', renderCollection));
$('#login-button').addEventListener('click', () => { const next = window.location.pathname + window.location.search; window.location.href = `/auth/discord/login?next=${encodeURIComponent(next)}`; });
$('#logout-button').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  collection = [];
  $('#collection-grid').innerHTML = '<div class="empty-state">Entre com Discord para carregar as cartas.</div>';
  $('#featured').innerHTML = '';
  $('#souls').textContent = $('#denarios').textContent = '—';
  showPage('home');
  await loadAccount();
});

loadAccount().then(() => { if (currentUser) { loadPlayers(); window.setInterval(loadPlayers, 30000); } const requested = new URLSearchParams(window.location.search).get('duel'); if (requested && currentUser && /^\d+$/.test(requested)) openDuel(requested); const gwentRequested = new URLSearchParams(window.location.search).get('gwent'); if (gwentRequested && currentUser && /^\d+$/.test(gwentRequested)) { showPage('gwent'); openGwentMatch(gwentRequested); } });

// --- Arena Gwent: motor de três rodadas separado do duelo clássico. ---
let gwentDeckIds = [];
let gwentSavedIds = [];
let currentGwentMatch = null;
let gwentPoll = null;
let gwentListPoll = null;

const gwentRows = [
  ['melee', 'Corpo a corpo'], ['ranged', 'Longa distância'], ['siege', 'Cerco']
];

function renderGwentBuilder() {
  const selected = gwentDeckIds.map(id => collection.find(c => c.id === id)).filter(Boolean);
  $('#gwent-deck-count').textContent = `${selected.length}/12 cartas`;
  $('#gwent-deck-selected').innerHTML = selected.map(card => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>${escapeHTML(card.categoria === "Especial" ? "Especial" : card.tipo)} · ${card.categoria === "Especial" ? "Efeito tático" : `${number(card.poder)} poder`}</small><button type="button" data-gwent-remove="${escapeHTML(card.id)}">Remover</button></article>`).join('') || '<div class="empty-state">Selecione 12 cartas (unidades e especiais) da coleção.</div>';
  const q = ($('#gwent-card-search').value || '').trim().toLocaleLowerCase('pt-BR');
  const selectedSet = new Set(gwentDeckIds);
  const pool = collection.filter(c => !selectedSet.has(c.id) && (`${c.nome} ${c.tipo} ${c.categoria} ${c.habilidade}`.toLocaleLowerCase('pt-BR').includes(q)));
  $('#gwent-card-pool').innerHTML = pool.map(card => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>${escapeHTML(card.raridade)} · ${escapeHTML(card.categoria === "Especial" ? "Especial" : card.tipo)} · ${card.categoria === "Especial" ? "Efeito tático" : `${number(card.poder)} poder`}</small><button type="button" data-gwent-add="${escapeHTML(card.id)}" ${gwentDeckIds.length >= 12 ? 'disabled' : ''}>Adicionar</button></article>`).join('') || '<div class="empty-state">Nenhuma unidade disponível.</div>';
  $('#gwent-save-deck').disabled = selected.length !== 12 || JSON.stringify(gwentDeckIds) === JSON.stringify(gwentSavedIds);
}

async function loadGwentDeck() {
  if (!currentUser) return;
  try {
    const r = await fetch('/api/gwent/deck', {credentials:'same-origin', cache:'no-store'});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Não foi possível carregar o deck Gwent.');
    gwentSavedIds = (data.deck || []).map(c => c.id);
    gwentDeckIds = [...gwentSavedIds];
    $('#gwent-deck-status').textContent = gwentSavedIds.length === 12 ? 'Deck carregado.' : 'Monte um deck com 12 cartas únicas. O deck clássico de 5 cartas não foi alterado.';
    renderGwentBuilder();
  } catch (e) { $('#gwent-deck-status').textContent = e.message; }
}

async function saveGwentDeck() {
  const button = $('#gwent-save-deck'); button.disabled = true; button.textContent = 'Salvando...';
  try {
    const r = await fetch('/api/gwent/deck', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({card_ids:gwentDeckIds})});
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Falha ao salvar deck.');
    gwentSavedIds = [...gwentDeckIds]; $('#gwent-deck-status').textContent = 'Deck Gwent salvo. O deck clássico permanece independente.';
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
    $('#gwent-match-list').innerHTML = `<article class="duel-item gwent-rank"><div><small class="eyebrow">SEU RANKING</small><h3>${escapeHTML(rank.tier)} · ${number(rank.mmr)} MMR</h3><p>${number(rank.wins)} vitórias · ${number(rank.losses)} derrotas · ${number(rank.draws)} empates</p></div><span>+25 MMR por vitória</span></article>` + leaderboard + ((data.matches || []).map(m => `<article class="duel-item"><div><small class="eyebrow">GWENT #${number(m.id)}</small><h3>Partida ${m.status === 'active' ? 'em andamento' : 'finalizada'}</h3><p>${m.creator_id === String(currentUser.id) ? 'Você é o desafiante' : 'Você foi desafiado'} · ${escapeHTML(m.created_at || '')}</p></div><button class="primary" data-gwent-open="${m.id}">Abrir arena</button></article>`).join('') || '<div class="empty-state">Nenhuma partida Gwent registrada.</div>');
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
  return `<article class="gwent-board-card"><img src="${escapeHTML(imageUrl(card))}" alt=""><b>${escapeHTML(card.nome)}</b><small>${number(Number(card.poder) + Number(card.bonus || 0))} poder · ${escapeHTML(card.row_label)}</small></article>`;
}

function renderGwentArena(data) {
  const arena = $('#gwent-arena'); arena.hidden = false;
  const score = data.score || {}; const ids = Object.keys(score);
  const my = data.your_id; const enemy = ids.find(id => id !== my);
  const mine = score[my]; const theirs = score[enemy] || {};
  const board = (side) => gwentRows.map(([key,label]) => `<div class="gwent-row"><h4>${label} · ${number((side.board || []).filter(c => c.row === key).reduce((n,c) => n + Math.max(1, c.poder + Number(c.bonus || 0) - Number((data.weather && data.weather[key]) || 0)),0))} poder</h4><div class="gwent-board-cards">${(side.board || []).filter(c => c.row === key).map(gwentCardView).join('') || '<small class="muted">Nenhuma unidade</small>'}</div></div>`).join('');
  const prep = data.phase === 'mulligan';
  const mulliganControls = prep ? `<div class="gwent-prep"><b>Preparação inicial</b><p>Selecione até duas cartas para trocar. Você tem ${number(data.draw_count || 0)} carta(s) de reserva.</p><button class="secondary" data-gwent-keep ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Manter minha mão</button><button class="primary" data-gwent-mulligan ${data.mulligan_done || !data.is_your_turn ? 'disabled' : ''}>Trocar selecionadas</button></div>` : '';
  arena.innerHTML = `<div class="gwent-arena-head"><div><small class="eyebrow">RODADA ${number(data.round)} / 3</small><h2>Arena Gwent</h2><p class="gwent-log">${escapeHTML(data.last_event || '')}</p></div><b>${data.status === 'finished' ? (data.winner_id ? `Vencedor: ${data.winner_id}` : 'Empate') : (prep ? (data.is_your_turn ? 'Sua preparação' : 'Preparação do adversário') : (data.is_your_turn ? 'Sua vez' : 'Vez do adversário'))}</b></div>
    <div class="gwent-faction">Sua facção: <strong>${escapeHTML(data.faction || mine.faction || '—')}</strong> · bônus de facção: +1 na primeira unidade da rodada</div>${mulliganControls}
    <div class="gwent-score"><article><small>VOCÊ</small><h3>${number(mine.score)} poder</h3><small>${number(mine.crowns)} coroas · ${number(mine.hand)} cartas na mão ${mine.passed ? '· passou' : ''}</small></article><article><small>ADVERSÁRIO</small><h3>${number(theirs.score)} poder</h3><small>${number(theirs.crowns)} coroas · ${number(theirs.hand)} cartas na mão ${theirs.passed ? '· passou' : ''}</small></article></div>
    <h3>Seu campo</h3>${board(mine)}<h3>Campo adversário</h3>${board(theirs)}
    <div class="gwent-actions"><button class="secondary" data-gwent-pass ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>Passar rodada</button><select id="gwent-leader-row"><option value="melee">Fileira: Corpo a corpo</option><option value="ranged">Fileira: Longa distância</option><option value="siege">Fileira: Cerco</option></select><button class="secondary" data-gwent-leader ${!data.is_your_turn || data.leader_used || data.status !== 'active' || prep ? 'disabled' : ''}>Usar líder</button><button class="secondary" data-gwent-weather ${!data.is_your_turn || data.weather_used || data.status !== 'active' || prep ? 'disabled' : ''}>Clima</button></div>
    <h3>Sua mão</h3><div class="gwent-hand">${(data.hand || []).map(c => `<article class="gwent-unit"><img src="${escapeHTML(imageUrl(c))}" alt=""><b>${escapeHTML(c.nome)}</b><small>${c.especial ? 'Carta especial' : `${number(c.poder)} poder · ${escapeHTML(c.row_label)}`}</small><small title="${escapeHTML(c.habilidade_texto || '')}">${escapeHTML(c.habilidade_nome || 'Unidade')} · ${escapeHTML(c.habilidade_texto || 'Sem efeito adicional')}</small>${prep ? `<label><input type="checkbox" data-gwent-swap value="${escapeHTML(c.id)}" ${data.mulligan_done || !data.is_your_turn || !(data.draw_count > 0) ? 'disabled' : ''}> Trocar</label>` : `<select data-gwent-row="${escapeHTML(c.id)}"><option value="${c.row}">${escapeHTML(c.row_label)}</option>${gwentRows.filter(([r])=>r!==c.row).map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}</select><button data-gwent-play="${escapeHTML(c.id)}" ${!data.is_your_turn || mine.passed || data.status !== 'active' || prep ? 'disabled' : ''}>${c.especial ? 'Usar especial' : 'Jogar unidade'}</button>`}</article>`).join('') || '<div class="empty-state">Sua mão está vazia.</div>'}</div>`;
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

$('#gwent-card-search').addEventListener('input', renderGwentBuilder);
$('#gwent-save-deck').addEventListener('click', saveGwentDeck);
$('#gwent-create-match').addEventListener('click', createGwentMatch);
document.addEventListener('click', event => {
  const add = event.target.closest('[data-gwent-add]'); const remove = event.target.closest('[data-gwent-remove]');
  const play = event.target.closest('[data-gwent-play]'); const open = event.target.closest('[data-gwent-open]');
  if (add && gwentDeckIds.length < 12) { gwentDeckIds.push(add.dataset.gwentAdd); renderGwentBuilder(); }
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
});

// Adiciona o seletor de adversário Gwent junto à lista já carregada pelo endpoint de presença.
const originalLoadPlayers = loadPlayers;
loadPlayers = async function() {
  await originalLoadPlayers();
  const source = $('#challenge-player');
  if (source && $('#gwent-opponent')) $('#gwent-opponent').innerHTML = source.innerHTML;
};

const originalShowPage = showPage;
showPage = function(page) {
  originalShowPage(page);
  if (page === 'gwent' && currentUser) { loadGwentDeck(); loadGwentMatches(); if (!gwentListPoll) gwentListPoll = setInterval(loadGwentMatches, 12000); } else if (gwentListPoll) { clearInterval(gwentListPoll); gwentListPoll = null; }
};
