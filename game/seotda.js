'use strict';

// 화투 패: month 1~10, type: gwang/yeol/pi (광/열끗/피)
// 섯다용 카드: 각 월 대표 2장씩 (총 20장)
const SEOTDA_CARDS = [];
for (let m = 1; m <= 10; m++) {
  SEOTDA_CARDS.push({ month: m, id: `${m}a` });
  SEOTDA_CARDS.push({ month: m, id: `${m}b` });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 패 계산 ────────────────────────────────────────────────
function evalSeotda(c1, c2) {
  const months = [c1.month, c2.month].sort((a, b) => a - b);
  const [lo, hi] = months;
  const sum = (lo + hi) % 10;

  // 땡 (같은 월)
  if (lo === hi) {
    return { rank: 'ddaeng', value: 1000 + lo * 10, name: lo === 10 ? '장땡' : `${lo}땡` };
  }
  // 알리 (1+2)
  if (lo === 1 && hi === 2) return { rank: 'ali', value: 990, name: '알리' };
  // 독사 (1+4)
  if (lo === 1 && hi === 4) return { rank: 'doksa', value: 980, name: '독사' };
  // 구사 (9+4)
  if (lo === 4 && hi === 9) return { rank: 'gusa', value: 970, name: '구사' };
  // 장사 (10+4)
  if (lo === 4 && hi === 10) return { rank: 'jangsa', value: 960, name: '장사' };
  // 세륙 (3+6)
  if (lo === 3 && hi === 6) return { rank: 'seryuk', value: 950, name: '세륙' };

  // 끗수 (나머지)
  if (sum === 0) return { rank: 'mangton', value: 0, name: '망통' };
  return { rank: 'keut', value: sum * 10, name: `${sum}끗` };
}

// 암행어사 (3+8): 모든 땡 이김 (장땡 제외)
function isAmhaengosa(c1, c2) {
  const months = [c1.month, c2.month].sort((a, b) => a - b);
  return months[0] === 3 && months[1] === 8;
}

function getEffectiveValue(hand, gusaRevealed) {
  const [c1, c2] = hand;
  const months = [c1.month, c2.month].sort((a, b) => a - b);
  const [lo, hi] = months;

  // 구사 공개 선택 시 무효패 (특수 처리)
  if (lo === 4 && hi === 9 && gusaRevealed) return { rank: 'gusa_reveal', value: -1, name: '구사공개' };

  const ev = evalSeotda(c1, c2);

  // 암행어사 체크
  if (isAmhaengosa(c1, c2)) {
    return { ...ev, rank: 'amhaengosa', value: 1095, name: '암행어사' };
  }
  return ev;
}

// ── 초기화 ────────────────────────────────────────────────
exports.init = function(playerInfos) {
  const deck = shuffle(SEOTDA_CARDS);
  const ids = playerInfos.map(p => p.id);

  const playerState = {};
  playerInfos.forEach(p => {
    playerState[p.id] = {
      id: p.id,
      nickname: p.nickname,
      chips: p.chips,
      hand: [deck.pop(), deck.pop()],
      bet: 0,
      folded: false,
      gusaRevealed: false,
    };
  });

  // 첫 베팅: 각자 1칩 ante
  ids.forEach(id => {
    playerState[id].chips -= 1;
    playerState[id].bet = 1;
  });

  return {
    players: ids,
    playerState,
    pot: ids.length,
    currentBet: 1,
    turnIndex: 0,
    actionCount: 0,
    stage: 'betting',
    finished: false,
    result: null,
    nicknames: Object.fromEntries(playerInfos.map(p => [p.id, p.nickname])),
  };
};

exports.action = function(game, playerId, action, amount) {
  if (game.finished) return { ok: false, msg: '게임 종료됨' };
  if (game.players[game.turnIndex] !== playerId) return { ok: false, msg: '당신 차례가 아닙니다.' };

  const ps = game.playerState[playerId];
  if (ps.folded) return { ok: false, msg: '이미 다이 상태입니다.' };

  if (action === 'die') {
    ps.folded = true;
    game.actionCount++;
  } else if (action === 'call') {
    const need = game.currentBet - ps.bet;
    if (need <= 0) {
      game.actionCount++;
    } else {
      const pay = Math.min(need, ps.chips);
      ps.chips -= pay;
      ps.bet += pay;
      game.pot += pay;
      game.actionCount++;
    }
  } else if (action === 'raise') {
    const amt = Math.max((amount | 0), game.currentBet * 2);
    const need = amt - ps.bet;
    const pay = Math.min(need, ps.chips);
    ps.chips -= pay;
    ps.bet += pay;
    game.pot += pay;
    game.currentBet = ps.bet;
    game.actionCount = 1;
  } else {
    return { ok: false, msg: '알 수 없는 액션' };
  }

  const active = game.players.filter(id => !game.playerState[id].folded);
  if (active.length === 1) { resolveGame(game); return { ok: true }; }

  const allCalled = active.every(id => game.playerState[id].bet >= game.currentBet || game.playerState[id].chips === 0);
  if (allCalled && game.actionCount >= active.length) {
    resolveGame(game);
  } else {
    nextTurn(game);
  }
  return { ok: true };
};

exports.handleGusa = function(game, playerId, reveal) {
  const ps = game.playerState[playerId];
  if (!ps) return { ok: false };
  const [c1, c2] = ps.hand;
  const months = [c1.month, c2.month].sort((a, b) => a - b);
  if (!(months[0] === 4 && months[1] === 9)) return { ok: false, msg: '구사 패가 아닙니다.' };
  if (reveal) {
    // 구사 공개: 판 무효 → 재배팅 (모든 bet 반환, pot 초기화)
    game.players.forEach(id => {
      game.playerState[id].chips += game.playerState[id].bet;
      game.playerState[id].bet = 0;
    });
    game.pot = 0;
    game.currentBet = 1;
    game.actionCount = 0;
    ps.gusaRevealed = true;
  }
  return { ok: true };
};

function nextTurn(game) {
  const n = game.players.length;
  let idx = (game.turnIndex + 1) % n;
  let steps = 0;
  while (game.playerState[game.players[idx]].folded && steps < n) {
    idx = (idx + 1) % n;
    steps++;
  }
  game.turnIndex = idx;
}

function resolveGame(game) {
  game.finished = true;
  const active = game.players.filter(id => !game.playerState[id].folded);

  let winner;
  if (active.length === 1) {
    winner = active[0];
  } else {
    const scored = active.map(id => {
      const ps = game.playerState[id];
      const ev = getEffectiveValue(ps.hand, ps.gusaRevealed);
      return { id, ev };
    });

    // 암행어사: 장땡(value 1100) 제외 모든 땡 이김
    const amhaengosa = scored.find(s => s.ev.rank === 'amhaengosa');
    const jangdaeng = scored.find(s => s.ev.value === 1100); // 장땡 (10땡)
    if (amhaengosa && !jangdaeng) {
      winner = amhaengosa.id;
    } else {
      const maxVal = Math.max(...scored.map(s => s.ev.value));
      const topScored = scored.filter(s => s.ev.value === maxVal);
      winner = topScored[Math.floor(Math.random() * topScored.length)].id;
    }
  }

  game.playerState[winner].chips += game.pot;

  game.result = {
    winner,
    pot: game.pot,
    chips: game.players.map(id => ({ id, chips: game.playerState[id].chips })),
    hands: Object.fromEntries(active.map(id => {
      const ps = game.playerState[id];
      return [id, getEffectiveValue(ps.hand, ps.gusaRevealed).name];
    })),
    revealedHands: Object.fromEntries(active.map(id => [id, game.playerState[id].hand])),
  };
}

exports.getStateFor = function(game, playerId) {
  const ps = game.playerState;
  return {
    gameType: 'seotda',
    myId: playerId,
    myHand: ps[playerId]?.hand || [],
    pot: game.pot,
    currentBet: game.currentBet,
    currentTurn: game.players[game.turnIndex],
    players: game.players.map(id => ({
      id,
      nickname: ps[id].nickname,
      chips: ps[id].chips,
      bet: ps[id].bet,
      folded: ps[id].folded,
      gusaRevealed: ps[id].gusaRevealed,
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

  const active = game.players.filter(id => !game.playerState[id].folded);
  if (active.length <= 1) {
    resolveGame(game);
    return { finished: true };
  }

  if (wasTurn) {
    game.actionCount++;
    const allCalled = active.every(id =>
      game.playerState[id].bet >= game.currentBet || game.playerState[id].chips === 0
    );
    if (allCalled && game.actionCount >= active.length) {
      resolveGame(game);
    } else {
      nextTurn(game);
    }
  }

  return { finished: game.finished };
};

exports.getSpectatorState = function(game) {
  const ps = game.playerState;
  return {
    gameType: 'seotda',
    myHand: [],
    pot: game.pot,
    currentBet: game.currentBet,
    currentTurn: game.players[game.turnIndex],
    players: game.players.map(id => ({
      id,
      nickname: ps[id].nickname,
      chips: ps[id].chips,
      bet: ps[id].bet,
      folded: ps[id].folded,
    })),
    finished: game.finished,
    result: game.result,
  };
};

exports.getResult = function(game) {
  return {
    gameType: 'seotda',
    ...(game.result || {}),
  };
};
