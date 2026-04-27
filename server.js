const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });

app.use(express.static(path.join(__dirname, 'public')));

// ── 인메모리 상태 ──────────────────────────────────────────
const rooms = {};
const players = {};
const afkTimers = {};      // roomId -> { timer, warnTimer, playerId }
const autoNextTimers = {}; // roomId -> intervalId

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    gameType: r.gameType,
    playerCount: r.players.length,
    spectatorCount: r.spectators?.length || 0,
    maxPlayers: 6,
    status: r.status,
  }));
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

// ── 게임 모듈 ──────────────────────────────────────────────
const OnecardGame = require('./game/onecard');
const PokerGame   = require('./game/poker');
const SeotdaGame  = require('./game/seotda');

function getGameModule(gameType) {
  if (gameType === 'onecard') return OnecardGame;
  if (gameType === 'poker')   return PokerGame;
  if (gameType === 'seotda')  return SeotdaGame;
  return null;
}

// ── AFK 타이머 ─────────────────────────────────────────────
function startAfkTimer(roomId) {
  clearAfkTimer(roomId);
  const room = rooms[roomId];
  if (!room?.game || room.game.finished) return;

  const currentTurn = room.game.players?.[room.game.turnIndex];
  if (!currentTurn) return;

  const warnTimer = setTimeout(() => {
    io.to(currentTurn).emit('afkWarning', { secondsLeft: 10 });
  }, 20000);

  const timer = setTimeout(() => {
    afkAct(roomId, currentTurn);
  }, 30000);

  afkTimers[roomId] = { timer, warnTimer, playerId: currentTurn };
}

function clearAfkTimer(roomId) {
  if (afkTimers[roomId]) {
    clearTimeout(afkTimers[roomId].timer);
    clearTimeout(afkTimers[roomId].warnTimer);
    delete afkTimers[roomId];
  }
}

function afkAct(roomId, playerId) {
  const room = rooms[roomId];
  if (!room?.game || room.game.finished) return;
  if (room.game.players?.[room.game.turnIndex] !== playerId) return;

  let result;
  const nick = players[playerId]?.nickname || '?';
  if (room.gameType === 'onecard') {
    result = OnecardGame.drawCard(room.game, playerId);
  } else if (room.gameType === 'poker') {
    result = PokerGame.action(room.game, playerId, 'fold', 0);
  } else if (room.gameType === 'seotda') {
    result = SeotdaGame.action(room.game, playerId, 'die', 0);
  }

  if (result?.ok) {
    io.to(roomId).emit('roomToast', { msg: `⏰ ${nick}님이 시간 초과로 자동 처리되었습니다.` });
    broadcastGameState(roomId);
    if (room.game.finished) endGame(roomId);
  }
}

// ── 자동 다음 라운드 ───────────────────────────────────────
function clearAutoNextTimer(roomId) {
  if (autoNextTimers[roomId]) {
    clearInterval(autoNextTimers[roomId]);
    delete autoNextTimers[roomId];
  }
}

function scheduleAutoNextRound(roomId) {
  clearAutoNextTimer(roomId);
  const room = rooms[roomId];
  if (!room) return;

  const solvent = room.players.filter(id => players[id] && players[id].chips > 0);
  const spectCanPlay = (room.spectators || []).filter(id => players[id] && players[id].chips > 0);

  if (solvent.length + spectCanPlay.length < 2) {
    const champion = solvent[0];
    io.to(roomId).emit('gameChampion', {
      championName: champion ? players[champion]?.nickname : null,
    });
    room.status = 'waiting';
    broadcastRoomList();
    return;
  }

  let count = 3;
  io.to(roomId).emit('autoNextRound', { countdown: count });

  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      delete autoNextTimers[roomId];
      startNextRound(room);
    } else {
      io.to(roomId).emit('autoNextRound', { countdown: count });
    }
  }, 1000);
  autoNextTimers[roomId] = interval;
}

function startNextRound(room) {
  if (!room) return;
  clearAfkTimer(room.id);
  clearAutoNextTimer(room.id);

  // 관전자 → 플레이어 편입
  (room.spectators || []).forEach(sid => {
    if (players[sid]) {
      players[sid].isSpectator = false;
      if (!room.players.includes(sid)) {
        if (players[sid].chips <= 0) players[sid].chips = 30;
        room.players.push(sid);
      }
    }
  });
  room.spectators = [];

  // 파산 플레이어 → 관전자로
  const eligible  = room.players.filter(id => players[id] && players[id].chips > 0);
  const bankrupt  = room.players.filter(id => players[id] && players[id].chips <= 0);
  bankrupt.forEach(id => {
    if (players[id]) players[id].isSpectator = true;
    room.spectators.push(id);
  });
  room.players = eligible;

  if (eligible.length < 2) {
    room.status = 'waiting';
    broadcastRoomList();
    return;
  }

  const GameModule = getGameModule(room.gameType);
  room.status = 'playing';
  room.game = GameModule.init(eligible.map(id => ({
    id,
    nickname: players[id]?.nickname || '?',
    chips: players[id]?.chips ?? 30,
  })));

  broadcastRoomList();
  io.to(room.id).emit('gameStarted', { gameType: room.gameType });
  broadcastGameState(room.id);
}

// ── Socket.io 이벤트 ───────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('setNickname', (nickname, cb) => {
    const name = String(nickname).trim().slice(0, 12);
    if (!name) return cb({ ok: false, msg: '닉네임을 입력하세요.' });
    players[socket.id] = { id: socket.id, nickname: name, roomId: null, chips: 30, isSpectator: false };
    cb({ ok: true });
    socket.emit('roomList', getRoomList());
  });

  socket.on('getRooms', (_, cb) => {
    cb?.(getRoomList());
  });

  socket.on('createRoom', ({ title, gameType }, cb) => {
    const player = players[socket.id];
    if (!player) return cb({ ok: false, msg: '닉네임을 먼저 설정하세요.' });
    if (player.roomId) return cb({ ok: false, msg: '이미 방에 있습니다.' });

    const id = generateRoomId();
    rooms[id] = {
      id,
      title: String(title).trim().slice(0, 20) || `${player.nickname}의 방`,
      gameType: ['onecard', 'poker', 'seotda'].includes(gameType) ? gameType : 'onecard',
      players: [socket.id],
      spectators: [],
      host: socket.id,
      status: 'waiting',
      game: null,
    };
    player.roomId = id;
    socket.join(id);
    cb({ ok: true, roomId: id });
    broadcastRoomList();
  });

  socket.on('joinRoom', ({ roomId }, cb) => {
    const player = players[socket.id];
    if (!player) return cb({ ok: false, msg: '닉네임을 먼저 설정하세요.' });
    if (player.roomId) return cb({ ok: false, msg: '이미 방에 있습니다.' });

    const room = rooms[roomId];
    if (!room) return cb({ ok: false, msg: '방이 존재하지 않습니다.' });

    // 게임 중 → 관전자 입장
    if (room.status === 'playing') {
      if (!room.spectators) room.spectators = [];
      room.spectators.push(socket.id);
      player.roomId = roomId;
      player.isSpectator = true;
      socket.join(roomId);
      cb({ ok: true, roomId, spectator: true });
      broadcastRoomList();
      const GameModule = getGameModule(room.gameType);
      const spectState = GameModule.getSpectatorState(room.game);
      socket.emit('spectatorJoined', { gameType: room.gameType, roomState: buildRoomState(roomId) });
      socket.emit('gameState', { ...spectState, isSpectator: true, myId: socket.id });
      io.to(roomId).emit('roomToast', { msg: `👁 ${player.nickname}님이 관전으로 입장했습니다.` });
      return;
    }

    if (room.players.length >= 6) return cb({ ok: false, msg: '방이 꽉 찼습니다.' });

    room.players.push(socket.id);
    player.roomId = roomId;
    socket.join(roomId);
    cb({ ok: true, roomId });
    broadcastRoomList();
    io.to(roomId).emit('roomUpdate', buildRoomState(roomId));
  });

  socket.on('leaveRoom', () => {
    handleLeave(socket);
  });

  socket.on('changeGameType', ({ gameType }, cb) => {
    const player = players[socket.id];
    if (!player?.roomId) return cb?.({ ok: false });
    const room = rooms[player.roomId];
    if (!room || room.host !== socket.id || room.status !== 'waiting') return cb?.({ ok: false });
    if (!['onecard', 'poker', 'seotda'].includes(gameType)) return cb?.({ ok: false });
    room.gameType = gameType;
    cb?.({ ok: true });
    io.to(room.id).emit('roomUpdate', buildRoomState(room.id));
    broadcastRoomList();
  });

  socket.on('startGame', (cb) => {
    const player = players[socket.id];
    if (!player?.roomId) return cb?.({ ok: false, msg: '방이 없습니다.' });
    const room = rooms[player.roomId];
    if (!room || room.host !== socket.id) return cb?.({ ok: false, msg: '호스트만 시작 가능합니다.' });
    if (room.status !== 'waiting') return cb?.({ ok: false, msg: '이미 게임중입니다.' });

    // 관전자 → 플레이어 편입
    (room.spectators || []).forEach(sid => {
      if (players[sid] && !room.players.includes(sid)) {
        if (players[sid].chips <= 0) players[sid].chips = 30;
        players[sid].isSpectator = false;
        room.players.push(sid);
      }
    });
    room.spectators = [];

    if (room.players.length < 2) return cb?.({ ok: false, msg: '최소 2명이 필요합니다.' });

    const GameModule = getGameModule(room.gameType);
    room.status = 'playing';
    room.game = GameModule.init(room.players.map(id => ({
      id,
      nickname: players[id]?.nickname || '?',
      chips: players[id]?.chips ?? 30,
    })));

    cb?.({ ok: true });
    broadcastRoomList();
    io.to(room.id).emit('gameStarted', { gameType: room.gameType });
    broadcastGameState(room.id);
  });

  // ── 원카드 ──
  socket.on('onecard:playCard', ({ cardIndex, chosenColor }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'onecard') return;
    clearAfkTimer(room.id);
    const result = OnecardGame.playCard(room.game, socket.id, cardIndex, chosenColor);
    cb?.(result);
    if (result.ok) {
      broadcastGameState(room.id);
      if (room.game.finished) endGame(room.id);
    }
  });

  socket.on('onecard:draw', (cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'onecard') return;
    clearAfkTimer(room.id);
    const result = OnecardGame.drawCard(room.game, socket.id);
    cb?.(result);
    if (result.ok) broadcastGameState(room.id);
  });

  // ── 포커 ──
  socket.on('poker:action', ({ action, amount }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'poker') return;
    clearAfkTimer(room.id);
    const result = PokerGame.action(room.game, socket.id, action, amount);
    cb?.(result);
    if (result.ok) {
      broadcastGameState(room.id);
      if (room.game.finished) endGame(room.id);
    }
  });

  // ── 섯다 ──
  socket.on('seotda:action', ({ action, amount }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'seotda') return;
    clearAfkTimer(room.id);
    const result = SeotdaGame.action(room.game, socket.id, action, amount);
    cb?.(result);
    if (result.ok) {
      broadcastGameState(room.id);
      if (room.game.finished) endGame(room.id);
    }
  });

  socket.on('seotda:gusa', ({ reveal }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'seotda') return;
    clearAfkTimer(room.id);
    const result = SeotdaGame.handleGusa(room.game, socket.id, reveal);
    cb?.(result);
    if (result.ok) broadcastGameState(room.id);
  });

  // ── 채팅 ──
  socket.on('chat:send', ({ msg }) => {
    const player = players[socket.id];
    if (!player?.roomId) return;
    const text = String(msg).trim().slice(0, 200);
    if (!text) return;
    io.to(player.roomId).emit('chat:message', {
      nickname: player.nickname,
      msg: text,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    });
  });

  // ── 구걸 (파산 상태에서만, 원카드 제외) ──
  socket.on('begChips', ({ targetId, amount }, cb) => {
    const player = players[socket.id];
    const target = players[targetId];
    if (!player || !target || player.roomId !== target.roomId) return cb?.({ ok: false });
    if (player.chips > 0) return cb?.({ ok: false, msg: '파산(0칩) 상태에서만 구걸 가능합니다.' });
    const room = player.roomId ? rooms[player.roomId] : null;
    if (room?.gameType === 'onecard') return cb?.({ ok: false, msg: '원카드에서는 구걸 불가입니다.' });
    if ((amount | 0) < 1) return cb?.({ ok: false, msg: '1칩 이상 요청하세요.' });

    io.to(targetId).emit('begRequest', {
      fromId: socket.id,
      fromNickname: player.nickname,
      amount: amount | 0,
    });
    cb?.({ ok: true });
  });

  socket.on('begResponse', ({ fromId, accept, amount }) => {
    const player = players[socket.id];
    const requester = players[fromId];
    if (!player || !requester || player.roomId !== requester.roomId) return;
    if (!accept) {
      io.to(fromId).emit('begResult', { accept: false, fromNickname: player.nickname });
      return;
    }
    const give = Math.min(amount | 0, player.chips);
    if (give < 1) return;
    player.chips -= give;
    requester.chips += give;
    io.to(fromId).emit('begResult', { accept: true, amount: give, fromNickname: player.nickname });
    io.to(socket.id).emit('chipsUpdate', { chips: player.chips });
    io.to(fromId).emit('chipsUpdate', { chips: requester.chips });
  });

  // ── 다음 라운드 (원카드: 전원 가능 / 나머지: 호스트만) ──
  socket.on('nextRound', (cb) => {
    const player = players[socket.id];
    if (!player?.roomId) return cb?.({ ok: false });
    const room = rooms[player.roomId];
    if (!room) return cb?.({ ok: false });
    if (room.gameType !== 'onecard' && room.host !== socket.id)
      return cb?.({ ok: false, msg: '호스트만 가능합니다.' });
    clearAutoNextTimer(room.id);
    startNextRound(room);
    cb?.({ ok: true });
  });

  // ── 대기실로 ──
  socket.on('backToLobby', () => {
    const player = players[socket.id];
    const room = player?.roomId ? rooms[player.roomId] : null;
    if (!room) return;
    clearAfkTimer(room.id);
    clearAutoNextTimer(room.id);
    if (room.host === socket.id) {
      room.status = 'waiting';
      room.game = null;
      io.to(room.id).emit('backToWaiting');
      broadcastRoomList();
    }
  });

  socket.on('disconnect', () => {
    handleLeave(socket);
    delete players[socket.id];
  });
});

// ── 헬퍼 ──────────────────────────────────────────────────
function getRoomBySocket(socketId) {
  const player = players[socketId];
  if (!player?.roomId) return null;
  return rooms[player.roomId] || null;
}

function buildRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    id: room.id,
    title: room.title,
    gameType: room.gameType,
    host: room.host,
    status: room.status,
    players: room.players.map(id => ({
      id,
      nickname: players[id]?.nickname || '?',
      chips: players[id]?.chips ?? 0,
    })),
    spectators: (room.spectators || []).map(id => ({
      id,
      nickname: players[id]?.nickname || '?',
    })),
  };
}

function broadcastGameState(roomId) {
  const room = rooms[roomId];
  if (!room?.game) return;
  const GameModule = getGameModule(room.gameType);

  room.players.forEach(pid => {
    const state = GameModule.getStateFor(room.game, pid);
    io.to(pid).emit('gameState', state);
  });

  // 관전자 상태
  if (room.spectators?.length) {
    const spectState = GameModule.getSpectatorState(room.game);
    room.spectators.forEach(sid => {
      io.to(sid).emit('gameState', { ...spectState, isSpectator: true, myId: sid });
    });
  }

  if (!room.game.finished) startAfkTimer(roomId);
}

function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearAfkTimer(roomId);

  const GameModule = getGameModule(room.gameType);
  const result = GameModule.getResult(room.game);

  result.chips?.forEach(({ id, chips }) => {
    if (players[id]) players[id].chips = chips;
  });

  room.status = 'waiting';

  if (room.gameType === 'onecard') {
    io.to(roomId).emit('gameOver', { ...result, autoNext: false });
    broadcastRoomList();
  } else {
    io.to(roomId).emit('gameOver', { ...result, autoNext: true, countdown: 3 });
    broadcastRoomList();
    scheduleAutoNextRound(roomId);
  }
}

function removePlayerFromGame(room, playerId) {
  const game = room.game;
  if (!game) return { finished: false };
  const GameModule = getGameModule(room.gameType);
  if (typeof GameModule.removePlayer === 'function') {
    return GameModule.removePlayer(game, playerId);
  }
  return { finished: false };
}

function handleLeave(socket) {
  const player = players[socket.id];
  if (!player?.roomId) return;
  const room = rooms[player.roomId];
  if (!room) { player.roomId = null; return; }

  // 관전자 나가기
  if (player.isSpectator) {
    room.spectators = (room.spectators || []).filter(id => id !== socket.id);
    player.roomId = null;
    player.isSpectator = false;
    socket.leave(room.id);
    io.to(room.id).emit('roomUpdate', buildRoomState(room.id));
    broadcastRoomList();
    return;
  }

  // 플레이어 나가기
  room.players = room.players.filter(id => id !== socket.id);
  player.roomId = null;
  socket.leave(room.id);

  const totalLeft = room.players.length + (room.spectators?.length || 0);
  if (totalLeft === 0) {
    clearAfkTimer(room.id);
    clearAutoNextTimer(room.id);
    delete rooms[room.id];
    broadcastRoomList();
    return;
  }

  if (room.host === socket.id) {
    room.host = room.players[0] || room.spectators?.[0];
  }

  if (room.status === 'playing' && room.game) {
    clearAfkTimer(room.id);
    io.to(room.id).emit('roomToast', { msg: `${player.nickname}님이 나갔습니다.` });

    const result = removePlayerFromGame(room, socket.id);
    const remaining = room.players.filter(id => !room.game.playerState?.[id]?.folded || room.gameType === 'onecard');

    if (result.finished || room.players.length < 2) {
      broadcastGameState(room.id);
      endGame(room.id);
    } else {
      broadcastGameState(room.id);
    }
  } else {
    io.to(room.id).emit('roomUpdate', buildRoomState(room.id));
  }

  broadcastRoomList();
}

// ── 서버 시작 ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
