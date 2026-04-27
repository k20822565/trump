// Socket.io 클라이언트 + 공통 이벤트 처리
const socket = io();

let myId = null;
let currentRoom = null;
let currentGameState = null;
let pendingBegFrom = null;
let pendingBegAmount = 0;

socket.on('connect', () => { myId = socket.id; });

socket.on('roomList', (rooms) => {
  updateRoomList(rooms);
});

socket.on('roomUpdate', (roomState) => {
  currentRoom = roomState;
  renderWaitingRoom(roomState);
});

socket.on('gameStarted', ({ gameType }) => {
  hideResultOverlay();
  renderGameArea(gameType);
});

socket.on('gameState', (state) => {
  currentGameState = state;
  renderGameState(state);
});

socket.on('gameOver', (result) => {
  showResultOverlay(result);
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
