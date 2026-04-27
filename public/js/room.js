// 대기실 + 게임 라우팅

function renderWaitingRoom(room) {
  currentRoom = room;
  document.getElementById('game-overlay-title').textContent = `[${gameTypeName(room.gameType)}] ${room.title}`;
  const content = document.getElementById('game-content');
  const isHost = room.host === myId;

  let playerItems = room.players.map(p => `
    <li>
      ${p.id === room.host ? '<span class="crown">♛</span>' : ''}
      <span>${escHtml(p.nickname)}</span>
      <span class="chips-badge">칩 ${p.chips}개</span>
    </li>
  `).join('');

  let hostControls = '';
  if (isHost) {
    hostControls = `
      <div class="host-controls">
        <label>게임 종류 변경</label>
        <div style="display:flex;gap:6px;align-items:center">
          <select id="game-type-select" onchange="changeGameType(this.value)">
            <option value="onecard" ${room.gameType === 'onecard' ? 'selected' : ''}>원카드</option>
            <option value="poker" ${room.gameType === 'poker' ? 'selected' : ''}>텍사스 홀덤</option>
            <option value="seotda" ${room.gameType === 'seotda' ? 'selected' : ''}>섯다</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="startGame()" style="margin-top:8px"
          ${room.players.length < 2 ? 'disabled title="최소 2명 필요"' : ''}>
          게임 시작 (${room.players.length}명)
        </button>
      </div>
    `;
  } else {
    hostControls = `<p style="font-size:11px;color:#888;margin-top:8px">방장이 게임을 시작할 때까지 기다려 주세요...</p>`;
  }

  content.innerHTML = `
    <div id="waiting-panel">
      <h3>대기실</h3>
      <ul id="player-list">${playerItems}</ul>
      ${hostControls}
    </div>
  `;
}

function changeGameType(gameType) {
  socket.emit('changeGameType', { gameType }, (res) => {
    if (!res?.ok) showToast('변경 실패');
  });
}

function startGame() {
  socket.emit('startGame', (res) => {
    if (!res?.ok) showToast(res?.msg || '시작 실패');
  });
}

function renderGameArea(gameType) {
  document.getElementById('game-content').innerHTML = '<div style="padding:12px;font-size:11px;color:#888">게임 로딩중...</div>';
}

function renderGameState(state) {
  if (!state) return;
  if (state.gameType === 'onecard') renderOnecardState(state);
  else if (state.gameType === 'poker') renderPokerState(state);
  else if (state.gameType === 'seotda') renderSeotdaState(state);
}

function showResultOverlay(result) {
  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('hidden');
  const gameNames = { onecard: '원카드', poker: '텍사스 홀덤', seotda: '섯다' };

  let handsHtml = '';
  if (result.hands) {
    handsHtml = '<div class="result-hands">' +
      Object.entries(result.hands).map(([id, hand]) => {
        const p = currentRoom?.players?.find(p => p.id === id);
        return `${p?.nickname || id}: ${hand}`;
      }).join(' | ') + '</div>';
  }

  let chipsHtml = '';
  if (result.chips?.length) {
    chipsHtml = '<div class="result-hands" style="margin-top:4px">' +
      result.chips.map(c => {
        const p = currentRoom?.players?.find(p => p.id === c.id);
        return `${p?.nickname || c.id}: ${c.chips}칩`;
      }).join(' | ') + '</div>';
  }

  const winnerName = result.winnerNickname ||
    currentRoom?.players?.find(p => result.winners?.includes(p.id))?.nickname ||
    currentRoom?.players?.find(p => p.id === result.winner)?.nickname || '?';

  const isHost = currentRoom?.host === myId;

  overlay.innerHTML = `
    <div class="result-title">🃏 게임 종료!</div>
    <div class="result-sub">
      ${result.winners?.length > 1 ? '승자: ' + result.winners.map(id => currentRoom?.players?.find(p=>p.id===id)?.nickname||id).join(', ')
        : '승자: ' + winnerName}
      ${result.pot ? ` (+${result.pot}칩)` : ''}
    </div>
    ${handsHtml}
    ${chipsHtml}
    <div style="display:flex;gap:8px;margin-top:12px">
      ${isHost ? '<button class="btn btn-primary" onclick="nextRound()">다음 라운드</button>' : ''}
      ${isHost ? '<button class="btn btn-default" onclick="backToLobbyBtn()">대기실로</button>' : ''}
      <button class="btn btn-default" onclick="openBegPanel()">구걸하기</button>
    </div>
  `;
}

function hideResultOverlay() {
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('result-overlay').innerHTML = '';
}

function nextRound() {
  hideResultOverlay();
  socket.emit('nextRound', (res) => {
    if (!res?.ok) showToast('다음 라운드 시작 실패');
  });
}

function backToLobbyBtn() {
  socket.emit('backToLobby');
}

function gameTypeName(gt) {
  return { onecard: '원카드', poker: '텍사스 홀덤', seotda: '섯다' }[gt] || gt;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
