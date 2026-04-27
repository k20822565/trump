// Socket.io 클라이언트 + 공통 이벤트 처리
const socket = io({ transports: ['websocket', 'polling'] });

let myId = null;
let currentRoom = null;
let currentGameState = null;
let pendingBegFrom = null;
let pendingBegAmount = 0;

socket.on('connect', () => {
  myId = socket.id;
  document.getElementById('conn-status').style.display = 'none';
  if (typeof onSocketConnect === 'function') onSocketConnect();
});

socket.on('connect_error', () => {
  document.getElementById('conn-status').textContent = '서버 연결 실패. 새로고침 해주세요.';
  document.getElementById('conn-status').style.background = '#c00';
});

socket.on('disconnect', () => {
  document.getElementById('conn-status').textContent = '연결 끊김. 재연결 중...';
  document.getElementById('conn-status').style.display = 'block';
});

socket.on('roomList', (rooms) => {
  updateRoomList(rooms);
});

socket.on('roomUpdate', (roomState) => {
  const prev = currentRoom;
  currentRoom = roomState;
  renderWaitingRoom(roomState);

  // 입장/퇴장 시스템 메시지
  if (prev) {
    const prevIds = new Set(prev.players.map(p => p.id));
    const currIds = new Set(roomState.players.map(p => p.id));
    roomState.players.forEach(p => {
      if (!prevIds.has(p.id) && p.id !== myId) {
        appendChatMessage({ system: true, msg: `${p.nickname}님이 입장했습니다.` });
      }
    });
    prev.players.forEach(p => {
      if (!currIds.has(p.id)) {
        appendChatMessage({ system: true, msg: `${p.nickname}님이 퇴장했습니다.` });
      }
    });
  }
});

socket.on('gameStarted', ({ gameType }) => {
  hideResultOverlay();
  renderGameArea(gameType);
  const names = { onecard: '원카드', poker: '텍사스 홀덤', seotda: '섯다' };
  appendChatMessage({ system: true, msg: `--- ${names[gameType] || gameType} 게임 시작! ---` });
});

socket.on('gameState', (state) => {
  currentGameState = state;
  renderGameState(state);
});

socket.on('gameOver', (result) => {
  showResultOverlay(result);
  if (result.winner || result.winners) {
    const winnerId = result.winner || result.winners?.[0];
    const winnerName = currentRoom?.players?.find(p => p.id === winnerId)?.nickname || '?';
    appendChatMessage({ system: true, msg: `--- 게임 종료! 승자: ${winnerName} ---` });
  }
});

socket.on('gameAborted', ({ msg }) => {
  showToast(msg);
  if (currentRoom) {
    currentRoom.status = 'waiting';
    renderWaitingRoom(currentRoom);
  }
  hideResultOverlay();
  document.getElementById('game-content').innerHTML = '';
});

socket.on('backToWaiting', () => {
  hideResultOverlay();
  if (currentRoom) renderWaitingRoom(currentRoom);
});

socket.on('begRequest', ({ fromId, fromNickname, amount }) => {
  pendingBegFrom = fromId;
  pendingBegAmount = amount;
  document.getElementById('beg-toast-msg').textContent = `${fromNickname}님이 ${amount}칩을 요청합니다.`;
  document.getElementById('beg-toast').classList.remove('hidden');
});

socket.on('begResult', ({ accept, amount, fromNickname }) => {
  if (accept) showToast(`${fromNickname}님이 ${amount}칩을 주었습니다!`);
  else showToast(`${fromNickname}님이 거절했습니다.`);
});

socket.on('chipsUpdate', ({ chips }) => {
  if (currentRoom) {
    const me = currentRoom.players?.find(p => p.id === myId);
    if (me) me.chips = chips;
  }
});

socket.on('chat:message', ({ nickname, msg, time }) => {
  appendChatMessage({ nickname, msg, time });
});

socket.on('roomToast', ({ msg }) => {
  showToast(msg);
});

socket.on('afkWarning', ({ secondsLeft }) => {
  showToast(`⏰ ${secondsLeft}초 안에 행동하지 않으면 자동 처리됩니다!`, 5000);
});

socket.on('autoNextRound', ({ countdown }) => {
  const el = document.getElementById('countdown-num');
  if (el) el.textContent = countdown;
});

socket.on('gameChampion', ({ championName }) => {
  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="result-title">🏆 최종 승자!</div>
    <div class="result-sub" style="margin:8px 0">
      ${championName ? `<b>${championName}</b>님이 모든 칩을 차지했습니다!` : '모든 플레이어가 파산했습니다.'}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-default" onclick="backToLobbyBtn()">대기실로</button>
      <button class="btn btn-danger" onclick="leaveRoom()">나가기</button>
    </div>
  `;
  appendChatMessage({ system: true, msg: `🏆 최종 승자: ${championName || '없음'}` });
});

socket.on('spectatorJoined', ({ gameType, roomState }) => {
  currentRoom = roomState;
  renderGameArea(gameType);
});

// ── 유틸 ──────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 400); }, duration);
}

function respondBeg(accept) {
  document.getElementById('beg-toast').classList.add('hidden');
  socket.emit('begResponse', { fromId: pendingBegFrom, accept, amount: pendingBegAmount });
}

function openBegPanel() {
  if (!currentRoom) return;
  const sel = document.getElementById('beg-target-select');
  sel.innerHTML = '';
  currentRoom.players
    .filter(p => p.id !== myId && p.chips > 0)
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nickname} (${p.chips}칩)`;
      sel.appendChild(opt);
    });
  if (!sel.options.length) { showToast('칩을 줄 수 있는 플레이어가 없습니다.'); return; }
  document.getElementById('beg-panel').classList.remove('hidden');
}

function closeBegPanel() {
  document.getElementById('beg-panel').classList.add('hidden');
}

function submitBeg() {
  const targetId = document.getElementById('beg-target-select').value;
  const amount = parseInt(document.getElementById('beg-amount-input').value) || 1;
  socket.emit('begChips', { targetId, amount }, (res) => {
    if (res?.ok) { showToast('구걸 요청을 보냈습니다.'); closeBegPanel(); }
    else showToast(res?.msg || '요청 실패');
  });
}

// ── 채팅 ──────────────────────────────────────────────────
function appendChatMessage({ nickname, msg, time, system }) {
  const box = document.getElementById('chat-messages');
  if (!box) return;

  const el = document.createElement('div');
  el.className = 'chat-msg' + (system ? ' system' : '');

  if (system) {
    el.innerHTML = `<span class="chat-text">${escChatHtml(msg)}</span>`;
  } else {
    const isMe = nickname === localStorage.getItem('nickname');
    el.innerHTML = `<span class="chat-nick ${isMe ? 'me' : ''}">${escChatHtml(nickname)}</span>`
      + `<span class="chat-time">${time}</span>`
      + `<span class="chat-text">${escChatHtml(msg)}</span>`;
  }

  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat:send', { msg });
  input.value = '';
  input.focus();
}

function clearChat() {
  const box = document.getElementById('chat-messages');
  if (box) box.innerHTML = '';
}

function escChatHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 긴급 숨김
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.body.classList.toggle('hidden-mode');
    const lobby = document.getElementById('lobby-panel');
    if (document.body.classList.contains('hidden-mode')) {
      lobby.style.display = 'none';
    } else {
      lobby.style.display = 'flex';
    }
  }
});
