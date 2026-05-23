const COLORS = ["red", "yellow", "green", "blue"];
const MERCY_LIMIT = 25;
const ROOM_PREFIX = "UNO-";
const PEER_CONFIG = { host: "0.peerjs.com", port: 443, secure: true, path: "/" };

const $ = (id) => document.getElementById(id);
const els = {
  connection: $("connection"), lobby: $("lobby"), wait: $("wait"), game: $("game"),
  hostName: $("hostName"), joinName: $("joinName"), roomInput: $("roomInput"),
  hostBtn: $("hostBtn"), joinBtn: $("joinBtn"), startBtn: $("startBtn"), copyBtn: $("copyBtn"),
  hostError: $("hostError"), joinError: $("joinError"), waitError: $("waitError"), roomCode: $("roomCode"),
  waitingPlayers: $("waitingPlayers"), players: $("players"), turnOrder: $("turnOrder"),
  statusText: $("statusText"), ruleText: $("ruleText"), drawBtn: $("drawBtn"), drawLabel: $("drawLabel"),
  deckCount: $("deckCount"), discard: $("discard"), revealed: $("revealed"),
  unoBtn: $("unoBtn"), catchBtn: $("catchBtn"), hand: $("hand"), handCount: $("handCount"),
  log: $("log"), colorDialog: $("colorDialog"), targetDialog: $("targetDialog"), targetList: $("targetList")
};

let peer = null;
let isHost = false;
let myId = "";
let myName = "";
let roomCode = "";
let hostConn = null;
let connections = {};
let state = null;
let lastLog = "";
let pendingPlay = null;

const uid = () => Math.random().toString(36).slice(2, 10);
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function makeCard(color, value) {
  const draws = { draw2: 2, draw4: 4, wild_reverse_draw4: 4, wild_draw6: 6, wild_draw10: 10 };
  const type = color === "wild" ? "wild" : Number.isInteger(Number(value)) ? "number" : "action";
  return { id: uid(), color, value, type, draw: draws[value] || 0 };
}

function createDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (let n = 0; n <= 9; n += 1) deck.push(makeCard(color, String(n)), makeCard(color, String(n)));
    for (let i = 0; i < 3; i += 1) deck.push(makeCard(color, "skip"));
    for (let i = 0; i < 2; i += 1) deck.push(makeCard(color, "skip_all"));
    for (let i = 0; i < 3; i += 1) deck.push(makeCard(color, "reverse"));
    for (let i = 0; i < 2; i += 1) deck.push(makeCard(color, "draw2"));
    for (let i = 0; i < 2; i += 1) deck.push(makeCard(color, "draw4"));
    for (let i = 0; i < 3; i += 1) deck.push(makeCard(color, "discard_all"));
  }
  for (let i = 0; i < 8; i += 1) deck.push(makeCard("wild", "wild_reverse_draw4"), makeCard("wild", "roulette"));
  for (let i = 0; i < 4; i += 1) deck.push(makeCard("wild", "wild_draw6"), makeCard("wild", "wild_draw10"));
  return shuffle(deck);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function initPeer(id) {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, PEER_CONFIG) : new Peer(PEER_CONFIG);
    const timer = setTimeout(() => reject(new Error("Peer connection timed out")), 12000);
    p.on("open", (peerId) => { clearTimeout(timer); myId = peerId; resolve(p); });
    p.on("error", reject);
  });
}

async function hostGame() {
  const name = els.hostName.value.trim();
  if (!name) return setText(els.hostError, "Enter your name.");
  setText(els.hostError, "");
  els.hostBtn.disabled = true;
  els.hostBtn.textContent = "Connecting...";
  try {
    roomCode = code();
    peer = await initPeer(ROOM_PREFIX + roomCode);
    isHost = true;
    myName = name;
    state = newState(name);
    peer.on("connection", setupHostConnection);
    showWait();
    setConnection("Hosting");
    render();
  } catch (error) {
    setText(els.hostError, "Could not create room. Try again.");
    els.hostBtn.disabled = false;
    els.hostBtn.textContent = "Create room";
  }
}

function setupHostConnection(conn) {
  const pid = conn.peer;
  connections[pid] = conn;
  conn.on("data", (msg) => handleHostMessage(pid, msg));
  conn.on("close", () => disconnectPlayer(pid));
  conn.on("error", () => disconnectPlayer(pid));
  conn.on("open", () => {
    conn.send({ type: "welcome", id: pid });
    sendStateTo(pid);
  });
}

async function joinGame() {
  const name = els.joinName.value.trim();
  const entered = els.roomInput.value.trim().toUpperCase();
  if (!name) return setText(els.joinError, "Enter your name.");
  if (entered.length < 4) return setText(els.joinError, "Enter a room code.");
  setText(els.joinError, "");
  els.joinBtn.disabled = true;
  els.joinBtn.textContent = "Joining...";
  try {
    peer = await initPeer();
    isHost = false;
    myName = name;
    roomCode = entered;
    hostConn = peer.connect(ROOM_PREFIX + entered, { reliable: true });
    hostConn.on("data", handleClientMessage);
    hostConn.on("close", () => setConnection("Disconnected"));
    hostConn.on("error", () => {
      setText(els.joinError, "Could not connect. Check the room code.");
      els.joinBtn.disabled = false;
      els.joinBtn.textContent = "Join room";
    });
    hostConn.on("open", () => {
      setConnection("Connected");
      hostConn.send({ type: "join", name });
      setTimeout(() => {
        if (hostConn?.open && !state?.players?.some(p => p.id === myId)) hostConn.send({ type: "join", name });
      }, 1200);
    });
  } catch (error) {
    setText(els.joinError, "Could not join. Try again.");
    els.joinBtn.disabled = false;
    els.joinBtn.textContent = "Join room";
  }
}

function newState(name) {
  return {
    phase: "lobby",
    players: [{ id: myId, name, hand: [], handCount: 0, connected: true, eliminated: false, uno: false }],
    deck: [], discard: [], currentColor: null, currentPlayer: 0, direction: 1,
    drawStack: { amount: 0, min: 0 },
    rouletteStack: { colors: [] },
    forcedPlayable: null,
    revealed: [],
    message: "Room created.",
    winner: null
  };
}

function handleHostMessage(pid, msg) {
  if (!state) return;
  if (msg.type === "join") return addPlayer(pid, msg.name);
  if (msg.type === "action") {
    applyAction(pid, msg.action);
    broadcast();
  }
}

function handleClientMessage(msg) {
  if (msg.type === "welcome") myId = msg.id;
  if (msg.type === "state") {
    state = msg.state;
    if (state.phase === "lobby") showWait();
    if (state.phase !== "lobby") showGame();
    render();
  }
  if (msg.type === "error") addLog(msg.message);
}

function addPlayer(pid, name) {
  if (state.phase !== "lobby") return sendTo(pid, { type: "error", message: "Game already started." });
  if (state.players.length >= 10) return sendTo(pid, { type: "error", message: "Room is full." });
  const existing = state.players.find(p => p.id === pid);
  if (existing) {
    existing.connected = true;
    existing.name = cleanName(name);
  } else {
    state.players.push({ id: pid, name: cleanName(name), hand: [], handCount: 0, connected: true, eliminated: false, uno: false });
    state.message = `${cleanName(name)} joined.`;
  }
  broadcast();
}

function startGame() {
  if (!isHost) return;
  const active = state.players.filter(p => p.connected);
  if (active.length < 2) {
    setText(els.waitError, "Need at least two players.");
    return;
  }
  state.deck = createDeck();
  state.players.forEach(p => {
    p.hand = drawCards(7);
    p.handCount = p.hand.length;
    p.eliminated = false;
    p.uno = false;
  });
  let start = state.deck.pop();
  while (!start || start.type !== "number") {
    if (start) state.deck.unshift(start);
    state.deck = shuffle(state.deck);
    start = state.deck.pop();
  }
  state.discard = [start];
  state.currentColor = start.color;
  state.currentPlayer = 0;
  state.direction = 1;
  state.phase = "playing";
  state.message = "Game started.";
  state.revealed = [];
  showGame();
  broadcast();
}

function applyAction(pid, action) {
  const player = state.players.find(p => p.id === pid);
  if (!player || player.eliminated || state.phase !== "playing") return;
  if (action.kind === "uno") return callUno(player);
  if (action.kind === "catch") return catchUno(player);
  if (current().id !== pid) return sendTo(pid, { type: "error", message: "Not your turn." });
  if (action.kind === "draw") return drawForTurn(player);
  if (action.kind === "play") return playCard(player, action.cardId, action.color, action.targetId);
}

function playCard(player, cardId, chosenColor, targetId) {
  const index = player.hand.findIndex(c => c.id === cardId);
  const card = player.hand[index];
  if (!card) return;
  if (!isPlayable(card, player)) return sendTo(player.id, { type: "error", message: "That card cannot be played now." });
  if (needsColor(card) && !COLORS.includes(chosenColor)) return sendTo(player.id, { type: "error", message: "Choose a color." });
  if (card.value === "7" && activePlayers().length > 1 && !targetId) return sendTo(player.id, { type: "error", message: "Choose someone to swap with." });

  player.hand.splice(index, 1);
  player.uno = false;
  state.forcedPlayable = null;
  state.discard.push(card);
  state.currentColor = card.color === "wild" ? chosenColor : card.color;
  state.revealed = [];
  let step = 1;
  let msg = `${player.name} played ${label(card)}.`;

  if (card.value === "skip") {
    msg += ` ${nextPlayer().name} is skipped.`;
    step = 2;
  } else if (card.value === "skip_all") {
    msg += " Everyone else is skipped.";
    step = 0;
  } else if (card.value === "reverse") {
    state.direction *= -1;
    msg += " Direction reversed.";
    if (activePlayers().length === 2) step = 0;
  } else if (card.value === "discard_all") {
    const removed = discardAllOfColor(player, card.color);
    msg += ` Discarded ${removed} ${card.color} card${removed === 1 ? "" : "s"}.`;
  } else if (card.value === "0") {
    passHands();
    msg += " Everyone passed hands.";
  } else if (card.value === "7") {
    const target = state.players.find(p => p.id === targetId && !p.eliminated);
    if (target && target.id !== player.id) {
      [player.hand, target.hand] = [target.hand, player.hand];
      msg += ` Swapped hands with ${target.name}.`;
    }
  } else if (card.draw) {
    state.drawStack.amount += card.draw;
    state.drawStack.min = card.draw;
    msg += ` Draw stack is ${state.drawStack.amount}.`;
    if (card.value === "wild_reverse_draw4") {
      state.direction *= -1;
      msg += " Direction reversed.";
    }
  } else if (card.value === "roulette") {
    state.rouletteStack.colors.push(chosenColor);
    msg += ` Roulette color: ${chosenColor}.`;
  }

  updateCounts();
  const zero = activePlayers().find(p => p.hand.length === 0);
  if (zero) return endGame(`${zero.name} wins.`);
  eliminateMercy();
  if (state.phase === "ended") return;
  advance(step);
  state.message = msg;
}

function drawForTurn(player) {
  state.revealed = [];
  if (state.forcedPlayable?.playerId === player.id) {
    sendTo(player.id, { type: "error", message: "You must play the card you drew." });
    return;
  }
  if (state.drawStack.amount > 0) {
    const amount = state.drawStack.amount;
    const drawn = drawCards(amount);
    player.hand.push(...drawn);
    state.revealed = drawn.map(label);
    state.drawStack = { amount: 0, min: 0 };
    state.message = `${player.name} drew ${amount} stacked card${amount === 1 ? "" : "s"} and lost the turn.`;
    updateCounts();
    eliminateMercy();
    if (state.phase !== "ended") advance(1);
    return;
  }
  if (state.rouletteStack.colors.length) {
    const needed = [...state.rouletteStack.colors];
    const found = new Set();
    const drawn = [];
    let guard = 0;
    while (found.size < new Set(needed).size && guard < 120) {
      const [card] = drawCards(1);
      if (!card) break;
      drawn.push(card);
      if (needed.includes(card.color)) found.add(card.color);
      guard += 1;
    }
    player.hand.push(...drawn);
    state.revealed = drawn.map(label);
    state.message = `${player.name} drew face up until finding ${needed.join(" and ")}.`;
    state.rouletteStack.colors = [];
    updateCounts();
    eliminateMercy();
    if (state.phase !== "ended") advance(1);
    return;
  }
  const drawn = [];
  let playable = null;
  let guard = 0;
  while (!playable && guard < 120) {
    const [card] = drawCards(1);
    if (!card) break;
    drawn.push(card);
    if (canPlayNormally(card)) playable = card;
    guard += 1;
  }
  player.hand.push(...drawn);
  state.revealed = drawn.map(label);
  updateCounts();
  if (player.hand.length >= MERCY_LIMIT) {
    eliminateMercy();
    return;
  }
  if (playable) {
    state.forcedPlayable = { playerId: player.id, cardId: playable.id };
    state.message = `${player.name} drew until playable. They must play ${label(playable)}.`;
  } else {
    state.message = `${player.name} drew but no playable card appeared.`;
    eliminateMercy();
    if (state.phase !== "ended") advance(1);
  }
}

function isPlayable(card, player) {
  if (state.forcedPlayable) return state.forcedPlayable.playerId === player.id && state.forcedPlayable.cardId === card.id;
  if (state.rouletteStack.colors.length) return card.value === "roulette";
  if (state.drawStack.amount > 0) return card.draw && card.draw >= state.drawStack.min;
  return canPlayNormally(card);
}

function canPlayNormally(card) {
  const top = state.discard[state.discard.length - 1];
  return card.color === "wild" || card.color === state.currentColor || card.value === top.value;
}

function needsColor(card) {
  return ["wild_reverse_draw4", "wild_draw6", "wild_draw10", "roulette"].includes(card.value);
}

function drawCards(count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    if (!state.deck.length) recycle();
    const card = state.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

function recycle() {
  const top = state.discard.pop();
  state.deck = shuffle(state.discard);
  state.discard = top ? [top] : [];
}

function discardAllOfColor(player, color) {
  const before = player.hand.length;
  const removed = player.hand.filter(c => c.color === color);
  player.hand = player.hand.filter(c => c.color !== color);
  const top = state.discard.pop();
  state.discard.push(...removed);
  if (top) state.discard.push(top);
  return before - player.hand.length;
}

function passHands() {
  const active = turnOrderPlayers();
  const hands = new Map(active.map(p => [p.id, p.hand]));
  active.forEach((p, index) => {
    const receiver = active[(index + state.direction + active.length) % active.length];
    receiver.hand = hands.get(p.id);
  });
}

function callUno(player) {
  if (player.hand.length === 1) {
    player.uno = true;
    state.message = `${player.name} called UNO.`;
  }
}

function catchUno(caller) {
  const target = activePlayers().find(p => p.id !== caller.id && p.hand.length === 1 && !p.uno);
  if (!target) {
    caller.hand.push(...drawCards(1));
    state.message = `${caller.name} called a false UNO catch and drew 1.`;
  } else {
    target.hand.push(...drawCards(2));
    state.message = `${caller.name} caught ${target.name}. ${target.name} draws 2.`;
  }
  updateCounts();
  eliminateMercy();
}

function eliminateMercy() {
  for (const p of activePlayers()) {
    if (p.hand.length >= MERCY_LIMIT) {
      p.eliminated = true;
      state.discard.push(...p.hand);
      p.hand = [];
      p.handCount = 0;
      state.message = `${p.name} hit ${MERCY_LIMIT} cards and is out.`;
    }
  }
  const remaining = activePlayers();
  if (remaining.length === 1) endGame(`${remaining[0].name} wins. No mercy.`);
}

function endGame(message) {
  state.phase = "ended";
  state.winner = activePlayers().find(p => p.hand.length === 0)?.id || activePlayers()[0]?.id || null;
  state.message = message;
  updateCounts();
}

function advance(steps) {
  if (steps === 0) return;
  for (let i = 0; i < steps; i += 1) state.currentPlayer = nextIndexFrom(state.currentPlayer);
}

function nextIndexFrom(index) {
  const total = state.players.length;
  let next = index;
  for (let guard = 0; guard < total + 1; guard += 1) {
    next = (next + state.direction + total) % total;
    const p = state.players[next];
    if (p && !p.eliminated && p.connected) return next;
  }
  return index;
}

function current() { return state.players[state.currentPlayer]; }
function nextPlayer() { return state.players[nextIndexFrom(state.currentPlayer)]; }
function activePlayers() { return state.players.filter(p => !p.eliminated && p.connected); }
function turnOrderPlayers() {
  const result = [];
  let index = state.currentPlayer;
  for (let guard = 0; guard < state.players.length; guard += 1) {
    const p = state.players[index];
    if (p && !p.eliminated && p.connected) result.push(p);
    index = (index + state.direction + state.players.length) % state.players.length;
  }
  return result;
}

function updateCounts() {
  state.players.forEach(p => { p.handCount = p.hand.length; });
}

function publicStateFor(pid) {
  updateCounts();
  return {
    ...state,
    players: state.players.map(p => ({ ...p, hand: p.id === pid ? p.hand : [] }))
  };
}

function sendStateTo(pid) {
  const conn = connections[pid];
  if (conn?.open) conn.send({ type: "state", state: publicStateFor(pid) });
}

function broadcast() {
  render();
  Object.keys(connections).forEach(sendStateTo);
}

function sendTo(pid, msg) {
  const conn = connections[pid];
  if (conn?.open) conn.send(msg);
}

function disconnectPlayer(pid) {
  const p = state?.players.find(player => player.id === pid);
  if (!p) return;
  p.connected = false;
  state.message = `${p.name} disconnected.`;
  broadcast();
}

function sendAction(action) {
  if (isHost) {
    applyAction(myId, action);
    broadcast();
  } else if (hostConn?.open) {
    hostConn.send({ type: "action", action });
  }
}

function render() {
  if (!state) return;
  if (state.phase === "lobby") showWait();
  if (state.phase !== "lobby") showGame();
  els.roomCode.textContent = roomCode || "------";
  renderPlayers();
  renderGame();
  if (state.message && state.message !== lastLog) {
    lastLog = state.message;
    addLog(state.message);
  }
}

function renderPlayers() {
  const waiting = state.players.map(p => `<div class="player"><strong>${esc(p.name)}</strong><span>${p.connected ? "Ready" : "Offline"}</span></div>`).join("");
  els.waitingPlayers.innerHTML = waiting;
  els.startBtn.disabled = !isHost;
  els.players.innerHTML = state.players.map((p, i) => `
    <div class="player ${i === state.currentPlayer ? "active" : ""} ${p.eliminated ? "eliminated" : ""}">
      <strong>${esc(p.name)}${p.id === myId ? " (you)" : ""}</strong>
      <span>${p.eliminated ? "Out" : `${p.handCount ?? p.hand.length} cards`}${p.uno ? " / UNO" : ""}</span>
    </div>
  `).join("");
  els.turnOrder.innerHTML = turnOrderPlayers().map((p, i) => `
    <div class="turn-chip ${i === 0 ? "active" : ""}">
      <strong>${i + 1}. ${esc(p.name)}</strong>
      <span>${i === 0 ? "Now" : "Up next"} / ${state.direction === 1 ? "clockwise" : "counter"}</span>
    </div>
  `).join("");
}

function renderGame() {
  if (!state || state.phase === "lobby") return;
  const me = state.players.find(p => p.id === myId);
  const top = state.discard[state.discard.length - 1];
  els.statusText.textContent = statusText();
  els.ruleText.textContent = ruleText();
  els.deckCount.textContent = `${state.deck?.length || 0} cards`;
  els.drawLabel.textContent = drawButtonText();
  els.discard.innerHTML = top ? cardHtml(top) : "";
  els.revealed.textContent = state.revealed?.length ? `Revealed: ${state.revealed.join(", ")}` : "";
  els.handCount.textContent = `${me?.hand?.length || 0} cards`;
  els.hand.innerHTML = "";
  (me?.hand || []).forEach(card => {
    const node = cardNode(card, me);
    els.hand.appendChild(node);
  });
}

function statusText() {
  if (state.phase === "ended") return state.message;
  const player = current();
  return player?.id === myId ? "Your turn." : `${player?.name || "Player"}'s turn.`;
}

function ruleText() {
  if (state.phase === "ended") return "Game over.";
  if (state.drawStack.amount) return `Draw stack: ${state.drawStack.amount}. Stack ${state.drawStack.min}+ or draw.`;
  if (state.rouletteStack.colors.length) return `Roulette stack: ${state.rouletteStack.colors.join(" + ")}. Stack roulette or draw face up.`;
  if (state.forcedPlayable?.playerId === myId) return "You drew a playable card. You must play it.";
  return `Current color: ${state.currentColor || "none"}. Draw until playable if you cannot play.`;
}

function drawButtonText() {
  if (state.drawStack.amount) return `Draw ${state.drawStack.amount}`;
  if (state.rouletteStack.colors.length) return "Resolve roulette";
  return "Draw until playable";
}

function cardNode(card, me) {
  const playable = state.phase === "playing" && current()?.id === myId && isPlayable(card, me);
  const button = document.createElement("button");
  button.className = `card ${card.color} ${playable ? "playable" : "blocked"}`;
  button.dataset.short = shortLabel(card);
  button.innerHTML = `<span>${label(card)}</span>`;
  button.disabled = !playable;
  button.addEventListener("click", () => beginPlay(card));
  return button;
}

function beginPlay(card) {
  pendingPlay = { cardId: card.id, card };
  if (card.value === "7" && activePlayers().length > 1) return chooseTarget();
  if (needsColor(card)) return chooseColor();
  sendAction({ kind: "play", cardId: card.id });
}

function chooseColor() {
  els.colorDialog.showModal();
}

function chooseTarget() {
  els.targetList.innerHTML = state.players
    .filter(p => p.id !== myId && !p.eliminated)
    .map(p => `<button value="${p.id}">${esc(p.name)} (${p.handCount ?? p.hand.length})</button>`)
    .join("");
  els.targetDialog.showModal();
}

function cardHtml(card) {
  return `<div class="card ${card.color}" data-short="${shortLabel(card)}"><span>${label(card)}</span></div>`;
}

function label(card) {
  const labels = {
    skip: "Skip", skip_all: "Skip All", reverse: "Reverse", draw2: "+2", draw4: "+4",
    discard_all: "Discard All", wild_reverse_draw4: "Reverse +4", wild_draw6: "+6",
    wild_draw10: "+10", roulette: "Color Roulette"
  };
  return labels[card.value] || card.value;
}

function shortLabel(card) {
  const labels = {
    skip: "S", skip_all: "ALL", reverse: "R", draw2: "+2", draw4: "+4",
    discard_all: "ALL", wild_reverse_draw4: "R+4", wild_draw6: "+6",
    wild_draw10: "+10", roulette: "CR"
  };
  return labels[card.value] || card.value;
}

function showWait() {
  els.lobby.classList.add("hidden");
  els.game.classList.add("hidden");
  els.wait.classList.remove("hidden");
}

function showGame() {
  els.lobby.classList.add("hidden");
  els.wait.classList.add("hidden");
  els.game.classList.remove("hidden");
}

function setConnection(text) { els.connection.textContent = text; }
function setText(el, text) { el.textContent = text; }
function cleanName(name) { return (name || "Player").trim().slice(0, 16) || "Player"; }
function esc(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}
function addLog(message) {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = message;
  els.log.prepend(div);
}

els.hostBtn.addEventListener("click", hostGame);
els.joinBtn.addEventListener("click", joinGame);
els.startBtn.addEventListener("click", startGame);
els.drawBtn.addEventListener("click", () => sendAction({ kind: "draw" }));
els.unoBtn.addEventListener("click", () => sendAction({ kind: "uno" }));
els.catchBtn.addEventListener("click", () => sendAction({ kind: "catch" }));
els.copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(roomCode);
  addLog("Room code copied.");
});
els.colorDialog.addEventListener("close", () => {
  const color = els.colorDialog.returnValue;
  if (pendingPlay && COLORS.includes(color)) {
    sendAction({ kind: "play", cardId: pendingPlay.cardId, color, targetId: pendingPlay.targetId });
    pendingPlay = null;
  }
  els.colorDialog.returnValue = "";
});
els.targetDialog.addEventListener("close", () => {
  if (!pendingPlay) return;
  pendingPlay.targetId = els.targetDialog.returnValue;
  if (needsColor(pendingPlay.card)) chooseColor();
  else {
    sendAction({ kind: "play", cardId: pendingPlay.cardId, targetId: pendingPlay.targetId });
    pendingPlay = null;
  }
  els.targetDialog.returnValue = "";
});
