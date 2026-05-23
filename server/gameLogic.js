// UNO No Mercy Game Logic

const COLORS = ['red', 'yellow', 'green', 'blue'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function createDeck() {
  const deck = [];

  COLORS.forEach(color => {
    deck.push({ color, value: '0', type: 'number' });
    VALUES.slice(1).forEach(value => {
      const type = ['skip', 'reverse', 'draw2'].includes(value) ? 'action' : 'number';
      deck.push({ color, value, type });
      deck.push({ color, value, type });
    });
  });

  // Standard wilds (x4 each)
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ color: 'wild', value: 'wild_draw4', type: 'wild' });
  }

  // No Mercy exclusive cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild_draw6', type: 'wild' });
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild_discard_all', type: 'wild' });
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild_draw_until_color', type: 'wild' });
  }
  for (let i = 0; i < 2; i++) {
    deck.push({ color: 'wild', value: 'wild_swap_hands', type: 'wild' });
  }

  // Skip All (x1 per color)
  COLORS.forEach(color => {
    deck.push({ color, value: 'skip_all', type: 'action' });
  });

  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealCards(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  const shuffled = shuffle(deck);

  for (let i = 0; i < 7 * playerCount; i++) {
    hands[i % playerCount].push(shuffled.pop());
  }

  let startCard, startIndex;
  for (let i = shuffled.length - 1; i >= 0; i--) {
    if (shuffled[i].type !== 'wild') {
      startCard = shuffled[i];
      startIndex = i;
      break;
    }
  }
  shuffled.splice(startIndex, 1);

  return { hands, drawPile: shuffled, discardPile: [startCard] };
}

function canPlay(card, topCard, currentColor) {
  if (card.type === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value && card.type === topCard.type) return true;
  return false;
}

function getCardPoints(card) {
  if (card.type === 'number') return parseInt(card.value) || 0;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  if (card.value === 'skip_all') return 30;
  if (card.value === 'wild' || card.value === 'wild_draw4') return 50;
  if (card.value === 'wild_draw6') return 60;
  if (card.value === 'wild_discard_all') return 40;
  if (card.value === 'wild_draw_until_color') return 50;
  if (card.value === 'wild_swap_hands') return 40;
  return 0;
}

function getCardDisplayName(card) {
  const names = {
    wild: 'Wild',
    wild_draw4: 'Wild Draw 4',
    wild_draw6: 'Wild Draw 6',
    wild_discard_all: 'Wild Discard All',
    wild_draw_until_color: 'Wild Draw Until Color',
    wild_swap_hands: 'Wild Swap Hands',
    skip: 'Skip',
    reverse: 'Reverse',
    draw2: 'Draw 2',
    skip_all: 'Skip All',
  };
  return names[card.value] || card.value.toUpperCase();
}

module.exports = { createDeck, shuffle, dealCards, canPlay, getCardPoints, getCardDisplayName, COLORS };
