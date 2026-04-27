'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function makeDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, val: RANK_VAL[rank] });
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 핸드 평가 ──────────────────────────────────────────────
function evalHand(cards) {
  const best = bestFive(cards);
  return scoreHand(best);
}

function bestFive(cards) {
  if (cards.length <= 5) return cards;
  let best = null, bestScore = -1;
  const combos = combine(cards, 5);
  for (const combo of combos) {
    const s = scoreHand(combo);
    if (s.value > bestScore) { bestScore = s.value; best = combo; }
  }
  return best;
}

function combine(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combine(rest, k - 1).map(c => [first, ...c]),
    ...combine(rest, k),
  ];
}

function scoreHand(cards) {
  const vals = cards.map(c => c.val).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(vals);
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const freq = Object.values(counts).sort((a, b) => b - a);
  const groups = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let rank, tiebreaker;

  if (isFlush && isStraight && vals[0] === 14 && vals[1] === 13) {
    rank = 9; tiebreaker = [14];
  } else if (isFlush && isStraight) {
    rank = 8; tiebreaker = [isStraight];
  } else if (freq[0] === 4) {
    rank = 7; tiebreaker = [+groups[0][0], ...vals.filter(v => v !== +groups[0][0])];
  } else if (freq[0] === 3 && freq[1] === 2) {
    rank = 6; tiebreaker = [+groups[0][0], +groups[1][0]];
  } else if (isFlush) {
    rank = 5; tiebreaker = vals;
  } else if (isStraight) {
    rank = 4; tiebreaker = [isStraight];
  } else if (freq[0] === 3) {
    rank = 3; tiebreaker = [+groups[0][0], ...vals.filter(v => v !== +groups[0][0])];
  } else if (freq[0] === 2 && freq[1] === 2) {
    const pairs = groups.filter(g => +g[1] === 2).map(g => +g[0]).sort((a, b) => b - a);
    rank = 2; tiebreaker = [...pairs, ...vals.filter(v => v !== pairs[0] && v !== pairs[1])];
  } else if (freq[0] === 2) {
    rank = 1; tiebreaker = [+groups[0][0], ...vals.filter(v => v !== +groups[0][0])];
  } else {
    rank = 0; tiebreaker = vals;
  }

  const value = rank * 1e12 + tiebreaker.reduce((acc, v, i) => acc + v * Math.pow(100, 4 - i), 0);
  return { rank, tiebreaker, value, rankName: HAND_NAMES[rank] };
}

function checkStraight(sortedVals) {
  for (let i = 0; i < sortedVals.length - 1; i++)
    if (sortedVals[i] - sortedVals[i + 1] !== 1) {
      if (sortedVals[0] === 14) {
        const low = [5, 4, 3, 2, 1];
        const mod = sortedVals.slice(1);
        if (JSON.stringify(mod) === JSON.stringify([5, 4, 3, 2])) return 5;
      }
      return 0;
    }
  return sortedVals[0];
}

const HAND_NAMES = [
  '하이카드', '원페어', '투페어', '쓰리 오브 어 카인드',
  '스트레이트', '플러시', '풀하우스', '포 오브 어 카인드',
  '스트레이트 플러시', '로열 플러시',
];

// ── 게임 초기화 ────────────────────────────────────────────
exports.init = function(playerInfos) {
  const deck = makeDeck();
  const ids = playerInfos.map(p => p.id);

  const playerState = {};
  playerInfos.forEach(p => {
    playerState[p.id] = {
      id: p.id,
      nickname: p.nickname,
      chips: p.chips,
      holeCards: [deck.pop(), deck.pop()],
      bet: 0,
      totalBet: 0,
      folded: false,
      allin: false,
    };
  });

  const smallBlindIdx = 0;
  const bigBlindIdx = 1;
  const sbId = ids[smallBlindIdx];
  const bbId = ids[bigBlindIdx];

  playerState[sbId].chips -= 1;
  playerState[sbId].bet = 1;
  playerState[sbId].totalBet = 1;
  playerState[bbId].chips -= 2;
  playerState[bbId].bet = 2;
  playerState[bbId].totalBet = 2;

  const startIdx = ids.length > 2 ? 2 : 0;

  return {
    players: ids,
    playerState,
    deck,
    community: [],
    pot: 3,
    sidePots: [],
    stage: 'preflop',
    currentBet: 2,
    turnIndex: startIdx,
    actionCount: 0,
    finished: false,
    result: null,
    nicknames: Object.fromEntries(playerInfos.map(p => [p.id, p.nickname])),
  };
};

function activePlayers(game) {
  return game.players.filter(id => !game.playerState[id].folded);
}

function playersToAct(game) {
  return activePlayers(game).filter(id => !game.playerState[id].allin);
}

exports.action = function(game, playerId, action, amount) {
  if (game.finished) return { ok: false, msg: '게임 종료됨' };
  if (game.players[game.turnIndex] !== playerId) return { ok: false, msg: '당신 차례가 아닙니다.' };

  const ps = game.playerState[playerId];
  if (ps.folded || ps.allin) return { ok: false, msg: '이미 폴드/올인 상태입니다.' };

  if (action === 'fold') {
    ps.folded = true;
  } else if (action === 'call') {
    const need = game.currentBet - ps.bet;
    if (need <= 0) {
      action = 'check';
    } else {
      const pay = Math.min(need, ps.chips);
      ps.chips -= pay;
      ps.bet += pay;
      ps.totalBet += pay;
      game.pot += pay;
      if (ps.chips === 0) ps.allin = true;
    }
  } else if (action === 'check') {
    if (ps.bet < game.currentBet) return { ok: false, msg: '콜 또는 폴드해야 합니다.' };
  } else if (action === 'raise') {
    const raiseTotal = Math.max(game.currentBet * 2, (amount | 0));
    const need = raiseTotal - ps.bet;
    if (need >= ps.chips) {
      const pay = ps.chips;
      ps.chips = 0;
      ps.bet += pay;
      ps.totalBet += pay;
      game.pot += pay;
      game.currentBet = ps.bet;
      ps.allin = true;
    } else {
      ps.chips -= need;
      ps.bet += need;
      ps.totalBet += need;
      game.pot += need;
      game.currentBet = ps.bet;
    }
    game.actionCount = 0;
  } else if (action === 'allin') {
    const pay = ps.chips;
    ps.chips = 0;
    ps.bet += pay;
    ps.totalBet += pay;
    game.pot += pay;
    if (ps.bet > game.currentBet) { game.currentBet = ps.bet; game.actionCount = 0; }
    ps.allin = true;
  } else {
    return { ok: false, msg: '알 수 없는 액션' };
  }

  game.actionCount++;
  advanceStage(game);
  return { ok: true };
};

function advanceStage(game) {
  const active = activePlayers(game);
  if (active.length === 1) { resolveGame(game); return; }

  const canAct = playersToAct(game);
  const allCalled = canAct.every(id => game.playerState[id].bet >= game.currentBet);

  const minActionsNeeded = canAct.length;
  if (!allCalled || game.actionCount < minActionsNeeded) {
    nextTurn(game);
    return;
  }

  // 다음 스테이지
  game.players.forEach(id => { game.playerState[id].bet = 0; });
  game.currentBet = 0;
  game.actionCount = 0;

  const stages = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const next = stages[stages.indexOf(game.stage) + 1];
  game.stage = next;

  if (next === 'flop') {
    game.community.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
  } else if (next === 'turn' || next === 'river') {
    game.community.push(game.deck.pop());
  } else if (next === 'showdown') {
    resolveGame(game);
    return;
  }

  const firstActive = game.players.find(id => !game.playerState[id].folded && !game.playerState[id].allin);
  game.turnIndex = firstActive ? game.players.indexOf(firstActive) : 0;
}

function nextTurn(game) {
  const n = game.players.length;
  let idx = (game.turnIndex + 1) % n;
  let steps = 0;
  while ((game.playerState[game.players[idx]].folded || game.playerState[game.players[idx]].allin) && steps < n) {
    idx = (idx + 1) % n;
    steps++;
  }
  game.turnIndex = idx;
}

function resolveGame(game) {
  game.finished = true;
  const active = activePlayers(game);

  let winners;
  if (active.length === 1) {
    winners = [active[0]];
  } else {
    const scores = active.map(id => ({
      id,
      score: evalHand([...game.playerState[id].holeCards, ...game.community]),
    }));
    const maxVal = Math.max(...scores.map(s => s.score.value));
    winners = scores.filter(s => s.score.value === maxVal).map(s => s.id);
  }

  const share = Math.floor(game.pot / winners.length);
  const rem = game.pot - share * winners.length;
  winners.forEach((id, i) => { game.playerState[id].chips += share + (i === 0 ? rem : 0); });

  const chipsResult = game.players.map(id => ({ id, chips: game.playerState[id].chips }));

  game.result = {
    winners,
    pot: game.pot,
    chips: chipsResult,
    hands: active.length > 1
      ? Object.fromEntries(active.map(id => [id, evalHand([...game.playerState[id].holeCards, ...game.community]).rankName]))
      : null,
    community: game.community,
    holeCards: Object.fromEntries(active.map(id => [id, game.playerState[id].holeCards])),
  };
}

exports.getStateFor = function(game, playerId) {
  const ps = game.playerState;
  return {
    gameType: 'poker',
    myId: playerId,
    myCards: ps[playerId]?.holeCards || [],
    community: game.community,
    pot: game.pot,
    stage: game.stage,
    currentBet: game.currentBet,
    currentTurn: game.players[game.turnIndex],
    players: game.players.map(id => ({
      id,
      nickname: ps[id].nickname,
      chips: ps[id].chips,
      bet: ps[id].bet,
      totalBet: ps[id].totalBet,
      folded: ps[id].folded,
      allin: ps[id].allin,
      cardCount: ps[id].holeCards?.length || 0,
    })),
    finished: game.finished,
    result: game.result,
  };
};

exports.removePlayer = function(game, playerId) {
  const ps = game.playerState[playerId];
  if (!ps || ps.folded) return { finished: game.finished };

  const wasTurn = game.players[game.turnIndex] === playerId;
  ps.folded = true;

  const active = activePlayers(game);
  if (active.length <= 1) {
    resolveGame(game);
    return { finished: true };
  }

  if (wasTurn) {
    game.actionCount++;
    advanceStage(game);
  }

  return { finished: game.finished };
};

exports.getSpectatorState = function(game) {
  const ps = game.playerState;
  return {
    gameType: 'poker',
    myCards: [],
    community: game.community,
    pot: game.pot,
    stage: game.stage,
    currentBet: game.currentBet,
    currentTurn: game.players[game.turnIndex],
    players: game.players.map(id => ({
      id,
      nickname: ps[id].nickname,
      chips: ps[id].chips,
      bet: ps[id].bet,
      totalBet: ps[id].totalBet,
      folded: ps[id].folded,
      allin: ps[id].allin,
      cardCount: ps[id].holeCards?.length || 0,
    })),
    finished: game.finished,
    result: game.result,
  };
};

exports.getResult = function(game) {
  return {
    gameType: 'poker',
    ...(game.result || {}),
  };
};
