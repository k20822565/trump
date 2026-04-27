// 로비 — 닉네임, 방 목록, 방 생성/입장

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nickname-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNickname();
  });
  document.getElementById('room-title-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitCreateRoom();
  });
});

// 소켓 연결 완료 후 호출됨 (socket-client.js의 connect 핸들러에서 호출)
function onSocketConnect() {
  const saved = localStorage.getItem('nickname');
  if (saved) {
    submitNicknameValue(saved);
  } else {
    document.getElementById('nickname-modal').style.display = 'flex';
    document.getElementById('nickname-input').focus();
  }
}

function submitNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  if (!val) { showToast('닉네임을 입력하세요.'); return; }
  submitNicknameValue(val);
}

function submitNicknameValue(name) {
  socket.emit('setNickname', name, (res) => {
    if (res.ok) {
      localStorage.setItem('nickname', name);
      document.getElementById('my-nickname').textContent = name;
      document.getElementById('nickname-modal').style.display = 'none';
    } else {
      showToast(res.msg || '오류');
    }
  });
}

function refreshRooms() {
  socket.emit('getRooms', null, (rooms) => {
    if (rooms) updateRoomList(rooms);
  });
}

function updateRoomList(rooms) {
  const tbody = document.getElementById('room-list-body');
  tbody.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" id="empty-msg">방이 없습니다. 방을 만들어 시작하세요!</td></tr>';
    return;
  }

  const gameNames = { onecard: '원카드', poker: '텍사스 홀덤', seotda: '섯다' };

  rooms.forEach(room => {
    const tr = document.createElement('tr');
    tr.className = room.status === 'playing' ? 'playing' : '';
    const canJoin = room.status === 'waiting' && room.playerCount < room.maxPlayers;
    tr.innerHTML = `
      <td>${escHtml(room.title)}</td>
      <td>${gameNames[room.gameType] || room.gameType}</td>
      <td>${room.playerCount} / ${room.maxPlayers}</td>
      <td>${room.status === 'playing' ? '게임중' : '대기중'}</td>
      <td><button class="join-btn" onclick="joinRoom('${room.id}')" ${canJoin ? '' : 'disabled'}>입장</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function openCreateRoom() {
  document.getElementById('create-room-modal').classList.remove('hidden');
  document.getElementById('room-title-input').focus();
}

function closeCreateRoom() {
  document.getElementById('create-room-modal').classList.add('hidden');
}

function submitCreateRoom() {
  const title = document.getElementById('room-title-input').value.trim();
  const gameType = document.getElementById('room-game-select').value;
  socket.emit('createRoom', { title, gameType }, (res) => {
    if (res.ok) {
      closeCreateRoom();
      enterRoom(res.roomId);
    } else {
      showToast(res.msg || '방 생성 실패');
    }
  });
}

function joinRoom(roomId) {
  socket.emit('joinRoom', { roomId }, (res) => {
    if (res.ok) {
      enterRoom(res.roomId);
    } else {
      showToast(res.msg || '입장 실패');
    }
  });
}

function enterRoom(roomId) {
  document.getElementById('lobby-panel').style.display = 'none';
  document.getElementById('game-overlay').style.display = 'flex';
  clearChat();
  appendChatMessage({ system: true, msg: '채팅방에 입장했습니다.' });

  // 채팅 Enter 키 전송
  const input = document.getElementById('chat-input');
  if (input && !input._bound) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    input._bound = true;
  }
}

function leaveRoom() {
  socket.emit('leaveRoom');
  currentRoom = null;
  currentGameState = null;
  document.getElementById('game-overlay').style.display = 'none';
  document.getElementById('lobby-panel').style.display = 'flex';
  document.getElementById('game-content').innerHTML = '';
  hideResultOverlay();
  clearChat();
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
