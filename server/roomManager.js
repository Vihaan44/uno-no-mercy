const { createDeck, shuffle, dealCards, canPlay, getCardPoints, getCardDisplayName, COLORS } = require('./gameLogic');

const rooms = new Map();

function createRoom(hostId, hostName) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = {
    id: roomId,
    host: hostId,
    players: [{ id: hostId, name: hostName, hand: [], score: 0, connected: true }],
    state: 'lobby',
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: null,
    pendingDraw: 0,
    pendingAction: null,
    unoCallouts: new Set(),
    lastAction: null,
    roundNumber: 1,
  };
  rooms.set(roomId, room);
  return room;
}

function joinRoom(roomId, playerId, playerName) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game already in progress' };
  if (room.players.length >= 10) return { error: 'Room is full' };
  if (room.players.find(p => p.id === playerId)) return { room };
  room.players.push({ id: playerId, name: playerName, hand: [], score: 0, connected: true });
  return { room };
}

function startGame(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.host !== playerId) return { error: 'Only host can start' };
  if (room.players.length < 2) return { error: 'Need at least 2 players' };

  const deck = createDeck();
  const { hands, drawPile, discardPile } = dealCards(deck, room.players.length);

  room.players.forEach((p, i) => { p.hand = hands[i]; });
  room.drawPile = drawPile;
  room.discardPile = discardPile;
  room.state = 'playing';
  room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
  room.direction = 1;
  room.pendingDraw = 0;
  room.pendingAction = null;
  room.currentColor = discardPile[0].color;
  room.unoCallouts = new Set();

  const startCard = discardPile[0];
  if (startCard.value === 'skip') {
    const skipped = room.currentPlayerIndex;
    room.currentPlayerIndex = nextPlayerIndex(room);
    room.lastAction = { type: 'skip', message: `${room.players[skipped].name} was skipped by the start card!` };
  } else if (startCard.value === 'reverse') {
    room.direction = -1;
  } else if (startCard.value === 'draw2') {
    room.pendingDraw = 2;
  }

  return { room };
}

function nextPlayerIndex(room, skip) {
  skip = skip || 1;
  let idx = room.currentPlayerIndex;
  for (let i = 0; i < skip; i++) {
    idx = ((idx + room.direction) % room.players.length + room.players.length) % room.players.length;
    let safety = 0;
    while (!room.players[idx].connected && safety < room.players.length) {
      idx = ((idx + room.direction) % room.players.length + room.players.length) % room.players.length;
      safety++;
    }
  }
  return idx;
}

function drawCards(room, playerIndex, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (room.drawPile.length === 0) {
      const top = room.discardPile.pop();
      room.drawPile = shuffle(room.discardPile);
      room.discardPile = [top];
      if (room.drawPile.length === 0) break;
    }
    drawn.push(room.drawPile.pop());
  }
  room.players[playerIndex].hand.push(...drawn);
  return drawn;
}

function playCard(roomId, playerId, cardIndex, chosenColor, swapTarget) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'playing') return { error: 'Game not in progress' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { error: 'Player not in room' };
  if (playerIndex !== room.currentPlayerIndex) return { error: 'Not your turn' };

  const player = room.players[playerIndex];
  const card = player.hand[cardIndex];
  if (!card) return { error: 'Invalid card' };

  const topCard = room.discardPile[room.discardPile.length - 1];

  if (room.pendingDraw > 0) {
    const canStack =
      (card.value === 'draw2' && topCard.value === 'draw2') ||
      card.value === 'wild_draw4' ||
      card.value === 'wild_draw6' ||
      (topCard.value === 'wild_draw4' && (card.value === 'wild_draw4' || card.value === 'wild_draw6')) ||
      (topCard.value === 'wild_draw6' && card.value === 'wild_draw6');
    if (!canStack) return { error: 'Must draw or stack a valid draw card' };
  } else if (!canPlay(card, topCard, room.currentColor)) {
    return { error: 'Cannot play that card' };
  }

  if (card.type === 'wild' && !chosenColor &&
    card.value !== 'wild_discard_all' && card.value !== 'wild_swap_hands') {
    return { error: 'Must choose a color' };
  }

  player.hand.splice(cardIndex, 1);
  room.discardPile.push(card);
  room.unoCallouts.delete(playerId);

  let actionMessage = `${player.name} played ${getCardDisplayName(card)}`;
  let nextIdx = nextPlayerIndex(room);
  room.pendingAction = null;

  if (card.type !== 'wild') room.currentColor = card.color;

  switch (card.value) {
    case 'skip':
      nextIdx = nextPlayerIndex(room, 2);
      actionMessage += ` — ${room.players[nextPlayerIndex(room)].name} was skipped!`;
      break;
    case 'skip_all':
      nextIdx = playerIndex;
      actionMessage += ' — Everyone else was skipped!';
      break;
    case 'reverse':
      room.direction *= -1;
      nextIdx = room.players.filter(p => p.connected).length === 2 ? playerIndex : nextPlayerIndex(room);
      actionMessage += ' — Direction reversed!';
      break;
    case 'draw2':
      room.pendingDraw = (room.pendingDraw || 0) + 2;
      actionMessage += ` — Next player must draw ${room.pendingDraw}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    case 'wild':
      room.currentColor = chosenColor;
      actionMessage += ` — Color changed to ${chosenColor}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    case 'wild_draw4':
      room.currentColor = chosenColor;
      room.pendingDraw = (room.pendingDraw || 0) + 4;
      actionMessage += ` — Next player draws ${room.pendingDraw}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    case 'wild_draw6':
      room.currentColor = chosenColor;
      room.pendingDraw = (room.pendingDraw || 0) + 6;
      actionMessage += ` — Next player draws ${room.pendingDraw}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    case 'wild_discard_all': {
      room.currentColor = chosenColor || COLORS[Math.floor(Math.random() * 4)];
      const count = player.hand.length;
      player.hand = [];
      actionMessage += ` — ${player.name} discarded ALL ${count} cards!`;
      nextIdx = nextPlayerIndex(room);
      break;
    }
    case 'wild_draw_until_color': {
      room.currentColor = chosenColor;
      const dtcTarget = nextPlayerIndex(room);
      actionMessage += ` — ${room.players[dtcTarget].name} draws until they get ${chosenColor}!`;
      let drawn = 0, gotColor = false;
      while (!gotColor && drawn < 30) {
        const cards = drawCards(room, dtcTarget, 1);
        if (!cards.length) break;
        drawn++;
        if (cards[0].color === chosenColor || cards[0].type === 'wild') gotColor = true;
      }
      actionMessage += ` Drew ${drawn} card${drawn !== 1 ? 's' : ''}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    }
    case 'wild_swap_hands': {
      if (swapTarget === undefined || swapTarget === null) return { error: 'Must choose swap target' };
      const target = room.players[swapTarget];
      if (!target) return { error: 'Invalid swap target' };
      const myHand = [...player.hand];
      player.hand = [...target.hand];
      target.hand = myHand;
      room.currentColor = chosenColor || room.currentColor;
      actionMessage += ` — Swapped hands with ${target.name}!`;
      nextIdx = nextPlayerIndex(room);
      break;
    }
    default:
      nextIdx = nextPlayerIndex(room);
  }

  if (player.hand.length === 1) room.unoCallouts.add(playerId);

  if (player.hand.length === 0) {
    const points = room.players.reduce((sum, p) => {
      return p.id !== playerId ? sum + p.hand.reduce((s, c) => s + getCardPoints(c), 0) : sum;
    }, 0);
    player.score += points;
    room.state = 'round_end';
    room.lastAction = { type: 'win', winner: player.name, winnerId: playerId, points, message: `${player.name} wins the round! +${points} points` };
    if (player.score >= 500) {
      room.state = 'ended';
      room.lastAction.gameOver = true;
      room.lastAction.message = `🎉 ${player.name} wins the GAME with ${player.score} points!`;
    }
    return { room };
  }

  room.currentPlayerIndex = nextIdx;
  room.lastAction = { type: 'play', message: actionMessage };
  return { room };
}

function drawCard(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'playing') return { error: 'Game not in progress' };
  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { error: 'Player not in room' };
  if (playerIndex !== room.currentPlayerIndex) return { error: 'Not your turn' };
  const player = room.players[playerIndex];
  if (room.pendingDraw > 0) {
    const count = room.pendingDraw;
    drawCards(room, playerIndex, count);
    room.lastAction = { type: 'draw', message: `${player.name} drew ${count} cards! 😬` };
    room.pendingDraw = 0;
  } else {
    drawCards(room, playerIndex, 1);
    room.lastAction = { type: 'draw', message: `${player.name} drew a card` };
  }
  room.currentPlayerIndex = nextPlayerIndex(room);
  return { room };
}

function callUno(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found' };
  if (player.hand.length === 1) {
    room.unoCallouts.delete(playerId);
    room.lastAction = { type: 'uno', message: `${player.name} called UNO! 🃏` };
    return { room };
  }
  return { error: 'Cannot call UNO right now' };
}

function calloutUno(roomId, callerId, targetId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.unoCallouts.has(targetId)) {
    const targetIndex = room.players.findIndex(p => p.id === targetId);
    drawCards(room, targetIndex, 2);
    room.unoCallouts.delete(targetId);
    const target = room.players[targetIndex];
    room.lastAction = { type: 'callout', message: `${target.name} forgot to call UNO! +2 cards! 😂` };
    return { room };
  }
  return { error: 'Player already called UNO or has more than 1 card' };
}

function nextRound(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.host !== playerId) return { error: 'Only host can start next round' };
  if (room.state !== 'round_end') return { error: 'Round not ended' };
  const deck = createDeck();
  const { hands, drawPile, discardPile } = dealCards(deck, room.players.length);
  room.players.forEach((p, i) => { p.hand = hands[i]; });
  room.drawPile = drawPile;
  room.discardPile = discardPile;
  room.state = 'playing';
  room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
  room.direction = 1;
  room.pendingDraw = 0;
  room.pendingAction = null;
  room.currentColor = discardPile[0].color;
  room.roundNumber++;
  room.unoCallouts = new Set();
  room.lastAction = { type: 'new_round', message: `Round ${room.roundNumber} begins!` };
  return { room };
}

function getRoom(roomId) { return rooms.get(roomId); }

function playerDisconnect(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = false;
  if (room.players.every(p => !p.connected)) {
    setTimeout(() => {
      if (rooms.get(roomId) && rooms.get(roomId).players.every(p => !p.connected)) rooms.delete(roomId);
    }, 60000);
  }
  if (room.state === 'playing' && room.players[room.currentPlayerIndex]?.id === playerId) {
    room.currentPlayerIndex = nextPlayerIndex(room);
    room.lastAction = { type: 'disconnect', message: `${player.name} disconnected — turn skipped` };
  }
}

function playerReconnect(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.connected = true;
}

module.exports = { createRoom, joinRoom, startGame, playCard, drawCard, callUno, calloutUno, nextRound, getRoom, playerDisconnect, playerReconnect };
