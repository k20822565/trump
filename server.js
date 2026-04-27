const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── 인메모리 상태 ──────────────────────────────────────────
const rooms = {};      // roomId -> room object
const players = {};    // socketId -> player object

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    title: r.title,
    gameType: r.gameType,
    playerCount: r.players.length,
    maxPlayers: 6,
    status: r.status,
  }));
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

// ── 게임 로직 모듈 ─────────────────────────────────────────
const OnecardGame = require('./game/onecard');
const PokerGame = require('./game/poker');
const SeotdaGame = require('./game/seotda');

function getGameModule(gameType) {
  if (gameType === 'onecard') return OnecardGame;
  if (gameType === 'poker') return PokerGame;
  if (gameType === 'seotda') return SeotdaGame;
  return null;
}

// ── Socket.io 이벤트 ───────────────────────────────────────
io.on('connection', (socket) => {

  // 닉네임 등록
  socket.on('setNickname', (nickname, cb) => {
    const name = String(nickname).trim().slice(0, 12);
    if (!name) return cb({ ok: false, msg: '닉네임을 입력하세요.' });
    players[socket.id] = { id: socket.id, nickname: name, roomId: null, chips: 30 };
    cb({ ok: true });
    socket.emit('roomList', getRoomList());
  });

  // 방 목록 요청
  socket.on('getRooms', (_, cb) => {
    cb?.(getRoomList());
  });

  // 방 생성
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
      host: socket.id,
      status: 'waiting',
      game: null,
    };
    player.roomId = id;
    socket.join(id);
    cb({ ok: true, roomId: id });
    broadcastRoomList();
  });

  // 방 입장
  socket.on('joinRoom', ({ roomId }, cb) => {
    const player = players[socket.id];
    if (!player) return cb({ ok: false, msg: '닉네임을 먼저 설정하세요.' });
    if (player.roomId) return cb({ ok: false, msg: '이미 방에 있습니다.' });

    const room = rooms[roomId];
    if (!room) return cb({ ok: false, msg: '방이 존재하지 않습니다.' });
    if (room.status !== 'waiting') return cb({ ok: false, msg: '게임이 진행중입니다.' });
    if (room.players.length >= 6) return cb({ ok: false, msg: '방이 꽉 찼습니다.' });

    room.players.push(socket.id);
    player.roomId = roomId;
    socket.join(roomId);
    cb({ ok: true, roomId });
    broadcastRoomList();
    io.to(roomId).emit('roomUpdate', buildRoomState(roomId));
  });

  // 방 나가기
  socket.on('leaveRoom', () => {
    handleLeave(socket);
  });

  // 게임 종류 변경 (호스트만)
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

  // 게임 시작 (호스트만)
  socket.on('startGame', (cb) => {
    const player = players[socket.id];
    if (!player?.roomId) return cb?.({ ok: false, msg: '방이 없습니다.' });
    const room = rooms[player.roomId];
    if (!room || room.host !== socket.id) return cb?.({ ok: false, msg: '호스트만 시작 가능합니다.' });
    if (room.status !== 'waiting') return cb?.({ ok: false, msg: '이미 게임중입니다.' });
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

  // ── 원카드 이벤트 ──
  socket.on('onecard:playCard', ({ cardIndex, chosenColor }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'onecard') return;
    const result = OnecardGame.playCard(room.game, socket.id, cardIndex, chosenColor);
    cb?.(result);
    if (result.ok) broadcastGameState(room.id);
    if (room.game.finished) endGame(room.id);
  });

  socket.on('onecard:draw', (cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'onecard') return;
    const result = OnecardGame.drawCard(room.game, socket.id);
    cb?.(result);
    if (result.ok) broadcastGameState(room.id);
  });

  // ── 포커 이벤트 ──
  socket.on('poker:action', ({ action, amount }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'poker') return;
    const result = PokerGame.action(room.game, socket.id, action, amount);
    cb?.(result);
    if (result.ok) {
      broadcastGameState(room.id);
      if (room.game.finished) endGame(room.id);
    }
  });

  // ── 섯다 이벤트 ──
  socket.on('seotda:action', ({ action, amount }, cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.gameType !== 'seotda') return;
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
    const result = SeotdaGame.handleGusa(room.game, socket.id, reveal);
    cb?.(result);
    if (result.ok) broadcastGameState(room.id);
  });

  // ── 구걸 시스템 ──
  socket.on('begChips', ({ targetId, amount }, cb) => {
    const player = players[socket.id];
    const target = players[targetId];
    if (!player || !target || player.roomId !== target.roomId) return cb?.({ ok: false });
    if (player.chips > 0) return cb?.({ ok: false, msg: '파산 상태에서만 구걸 가능합니다.' });
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
    io.to(player.id).emit('chipsUpdate', { chips: player.chips });
    io.to(fromId).emit('chipsUpdate', { chips: requester.chips });
  });

  // ── 다음 라운드 ──
  socket.on('nextRound', (cb) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return cb?.({ ok: false });
    const GameModule = getGameModule(room.gameType);
    room.game = GameModule.init(room.players
      .filter(id => players[id])
      .map(id => ({
        id,
        nickname: players[id].nickname,
        chips: players[id].chips,
      }))
    );
    room.status = 'playing';
    broadcastGameState(room.id);
    cb?.({ ok: true });
  });

  socket.on('backToLobby', () => {
    const player = players[socket.id];
    const room = player?.roomId ? rooms[player.roomId] : null;
    if (room && room.host === socket.id) {
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
  };
}

function broadcastGameState(roomId) {
  const room = rooms[roomId];
  if (!room || !room.game) return;
  const GameModule = getGameModule(room.gameType);

  room.players.forEach(pid => {
    const state = GameModule.getStateFor(room.game, pid);
    io.to(pid).emit('gameState', state);
  });
}

function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const GameModule = getGameModule(room.gameType);
  const result = GameModule.getResult(room.game);

  result.chips?.forEach(({ id, chips }) => {
    if (players[id]) players[id].chips = chips;
  });

  room.status = 'waiting';
  io.to(roomId).emit('gameOver', result);
  broadcastRoomList();
}

function handleLeave(socket) {
  const player = players[socket.id];
  if (!player?.roomId) return;
  const room = rooms[player.roomId];
  if (!room) { player.roomId = null; return; }

  room.players = room.players.filter(id => id !== socket.id);
  player.roomId = null;
  socket.leave(room.id);

  if (room.players.length === 0) {
    delete rooms[room.id];
  } else {
    if (room.host === socket.id) room.host = room.players[0];
    io.to(room.id).emit('roomUpdate', buildRoomState(room.id));
    if (room.status === 'playing' && room.players.length < 2) {
      room.status = 'waiting';
      room.game = null;
      io.to(room.id).emit('gameAborted', { msg: '플레이어가 부족하여 게임이 중단되었습니다.' });
    }
  }
  broadcastRoomList();
}

// ── 서버 시작 ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
