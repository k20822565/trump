'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardColor(card) {
  return (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
}

function isWild(card) { return card.rank === 'A'; }
function isSkip(card) { return card.rank === 'J'; }
function isReverse(card) { return card.rank === 'Q'; }
function isDraw2(card) { return card.rank === '2'; }

function canPlay(card, top, currentColor) {
  if (isWild(card)) return true;
  if (card.suit === top.suit) return true;
  if (card.rank === top.rank) return true;
  if (currentColor && card.suit === currentColor) return true;
  return false;
}

exports.init = function(playerInfos) {
  const deck = makeDeck();
  let top;
  do { top = deck.pop(); } while (isWild(top) || isDraw2(top));

  const hands = {};
  playerInfos.forEach(p => {
    hands[p.id] = deck.splice(0, 7);
  });

  return {
    players: playerInfos.map(p => p.id),
    nicknames: Object.fromEntries(playerInfos.map(p => [p.id, p.nickname])),
    deck,
    discard: [top],
    hands,
    currentColor: top.suit,
    turnIndex: 0,
    direction: 1,
    pendingDraw: 0,
    finished: false,
    winner: null,
    scores: Object.fromEntries(playerInfos.map(p => [p.id, 0])),
  };
};

exports.playCard = function(game, playerId, cardIndex, chosenColor) {
  if (game.finished) return { ok: false, msg: '게임 종료됨' };
  if (game.players[game.turnIndex] !== playerId) return { ok: false, msg: '당신 차례가 아닙니다.' };

  const hand = game.hands[playerId];
  const card = hand[cardIndex];
  if (!card) return { ok: false, msg: '유효하지 않은 카드입니다.' };

  const top = game.discard[game.discard.length - 1];

  if (game.pendingDraw > 0 && !isDraw2(card))
    return { ok: false, msg: `+2 누적 상태입니다. +2 카드를 내거나 ${game.pendingDraw}장을 드세요.` };

  if (!canPlay(card, top, game.currentColor))
    return { ok: false, msg: '낼 수 없는 카드입니다.' };

  hand.splice(cardIndex, 1);
  game.discard.push(card);

  if (isDraw2(card)) {
    game.pendingDraw += 2;
  }

  if (isWild(card)) {
    const colors = ['♠', '♥', '♦', '♣'];
    game.currentColor = colors.includes(chosenColor) ? chosenColor : '♠';
  } else {
    game.currentColor = card.suit;
  }

  if (hand.length === 0) {
    game.finished = true;
    game.winner = playerId;
    game.scores[playerId] = (game.scores[playerId] || 0) + 1;
    return { ok: true, event: 'win', winner: playerId };
  }

  if (isSkip(card)) {
    advanceTurn(game, 2);
  } else if (isReverse(card)) {
    game.direction *= -1;
    advanceTurn(game, 1);
  } else {
    advanceTurn(game, 1);
  }

  refillDeckIfNeeded(game);
  return { ok: true };
};

exports.drawCard = function(game, playerId) {
  if (game.finished) return { ok: false };
  if (game.players[game.turnIndex] !== playerId) return { ok: false, msg: '당신 차례가 아닙니다.' };

  const count = game.pendingDraw > 0 ? game.pendingDraw : 1;
  game.pendingDraw = 0;

  for (let i = 0; i < count; i++) {
    refillDeckIfNeeded(game);
    if (game.deck.length > 0) game.hands[playerId].push(game.deck.pop());
  }

  advanceTurn(game, 1);
  return { ok: true, drew: count };
};

function advanceTurn(game, steps) {
  const n = game.players.length;
  game.turnIndex = ((game.turnIndex + game.direction * steps) % n + n) % n;
}

function refillDeckIfNeeded(game) {
  if (game.deck.length < 5 && game.discard.length > 1) {
    const top = game.discard.pop();
    game.deck = shuffle(game.discard);
    game.discard = [top];
  }
}

exports.getStateFor = function(game, playerId) {
  const top = game.discard[game.discard.length - 1];
  return {
    gameType: 'onecard',
    myId: playerId,
    myHand: game.hands[playerId] || [],
    topCard: top,
    currentColor: game.currentColor,
    currentTurn: game.players[game.turnIndex],
    pendingDraw: game.pendingDraw,
    direction: game.direction,
    handCounts: Object.fromEntries(game.players.map(id => [id, game.hands[id]?.length ?? 0])),
    nicknames: game.nicknames,
    players: game.players,
    finished: game.finished,
    winner: game.winner,
    scores: game.scores,
  };
};

exports.removePlayer = function(game, playerId) {
  const idx = game.players.indexOf(playerId);
  if (idx === -1) return { finished: game.finished };

  if (game.hands[playerId]) {
    game.deck.push(...game.hands[playerId]);
    delete game.hands[playerId];
  }

  const wasTurn = game.players[game.turnIndex] === playerId;
  game.players.splice(idx, 1);

  if (game.players.length < 2) {
    game.finished = true;
    game.winner = game.players[0] || null;
    if (game.winner) game.scores[game.winner] = (game.scores[game.winner] || 0) + 1;
    return { finished: true };
  }

  if (wasTurn) {
    game.turnIndex = game.turnIndex % game.players.length;
  } else if (idx < game.turnIndex) {
    game.turnIndex = Math.max(0, game.turnIndex - 1);
  }

  return { finished: false };
};

exports.getSpectatorState = function(game) {
  const top = game.discard[game.discard.length - 1];
  return {
    gameType: 'onecard',
    myHand: [],
    topCard: top,
    currentColor: game.currentColor,
    currentTurn: game.players[game.turnIndex],
    pendingDraw: game.pendingDraw,
    direction: game.direction,
    handCounts: Object.fromEntries(game.players.map(id => [id, game.hands[id]?.length ?? 0])),
    nicknames: game.nicknames,
    players: game.players,
    finished: game.finished,
    winner: game.winner,
    scores: game.scores,
  };
};

exports.getResult = function(game) {
  return {
    gameType: 'onecard',
    winner: game.winner,
    winnerNickname: game.nicknames[game.winner],
    scores: game.scores,
    chips: [],
  };
};
