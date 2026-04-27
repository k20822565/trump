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

  let spectatorItems = '';
  if (room.spectators?.length) {
    spectatorItems = `
      <div style="margin-top:8px;font-size:10px;color:#888">
        관전 중: ${room.spectators.map(s => escHtml(s.nickname)).join(', ')}
      </div>`;
  }

  let hostControls = '';
  if (isHost) {
    hostControls = `
      <div class="host-controls">
        <label>게임 종류 변경</label>
        <select id="game-type-select" onchange="changeGameType(this.value)">
          <option value="onecard" ${room.gameType === 'onecard' ? 'selected' : ''}>원카드</option>
          <option value="poker" ${room.gameType === 'poker' ? 'selected' : ''}>텍사스 홀덤</option>
          <option value="seotda" ${room.gameType === 'seotda' ? 'selected' : ''}>섯다</option>
        </select>
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
      ${spectatorItems}
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
  document.getElementById('game-content').innerHTML =
    '<div style="padding:12px;font-size:11px;color:#888">게임 로딩중...</div>';
}

function renderGameState(state) {
  if (!state) return;

  // 관전자 배너
  if (state.isSpectator) ensureSpectatorBanner();
  else removeSpectatorBanner();

  if (state.gameType === 'onecard') renderOnecardState(state);
  else if (state.gameType === 'poker') renderPokerState(state);
  else if (state.gameType === 'seotda') renderSeotdaState(state);
}

function ensureSpectatorBanner() {
  const content = document.getElementById('game-content');
  if (!content || content.querySelector('.spectator-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'spectator-banner';
  banner.textContent = '👁 관전 중 — 다음 라운드부터 자동으로 참가됩니다';
  content.prepend(banner);
}

function removeSpectatorBanner() {
  document.querySelector('.spectator-banner')?.remove();
}

// ── 결과 오버레이 ──────────────────────────────────────────
function showResultOverlay(result) {
  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('hidden');

  const myChipsAfter = result.chips?.find(c => c.id === myId)?.chips ?? 0;
  const isHost = currentRoom?.host === myId;
  const isOnecard = result.gameType === 'onecard';
  const autoNext = result.autoNext;

  // 승자 표시
  const winnerName = result.winnerNickname
    || currentRoom?.players?.find(p => result.winners?.includes(p.id))?.nickname
    || currentRoom?.players?.find(p => p.id === result.winner)?.nickname
    || '?';

  const winnersText = result.winners?.length > 1
    ? '승자: ' + result.winners.map(id => currentRoom?.players?.find(p => p.id === id)?.nickname || id).join(', ')
    : '승자: ' + winnerName;

  // 패 표시 (포커/섯다)
  let handsHtml = '';
  if (result.hands) {
    handsHtml = '<div class="result-hands">' +
      Object.entries(result.hands).map(([id, hand]) => {
        const p = currentRoom?.players?.find(p => p.id === id);
        return escHtml(`${p?.nickname || id}: ${hand}`);
      }).join(' | ') + '</div>';
  }

  // 칩 변동 표시
  let chipsHtml = '';
  if (result.chips?.length && !isOnecard) {
    chipsHtml = '<div class="result-hands" style="margin-top:4px">' +
      result.chips.map(c => {
        const p = currentRoom?.players?.find(p => p.id === c.id);
        return escHtml(`${p?.nickname || c.id}: ${c.chips}칩`);
      }).join(' | ') + '</div>';
  }

  // 버튼 구성
  let buttonsHtml = '';
  if (isOnecard) {
    // 원카드: 전원에게 모든 버튼 표시
    buttonsHtml = `
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="nextRound()">다시하기</button>
        <button class="btn btn-default" onclick="backToLobbyBtn()">대기실로</button>
        <button class="btn btn-danger" onclick="leaveRoom()">나가기</button>
      </div>`;
  } else if (autoNext) {
    // 포커/섯다: 자동 진행 카운트다운
    const begBtn = myChipsAfter <= 0
      ? `<button class="btn btn-default" onclick="openBegPanel()" style="margin-top:8px">구걸하기</button>` : '';
    buttonsHtml = `
      <div id="auto-next-countdown" style="margin-top:10px;font-size:12px;color:#217346;font-weight:700">
        <span id="countdown-num">${result.countdown ?? 3}</span>초 후 다음 라운드 자동 시작...
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
        ${begBtn}
        <button class="btn btn-danger" onclick="leaveRoom()">나가기</button>
      </div>`;
  }

  overlay.innerHTML = `
    <div class="result-title">🃏 ${isOnecard ? '게임' : '라운드'} 종료!</div>
    <div class="result-sub" style="margin:4px 0">
      ${winnersText}${result.pot ? ` (+${result.pot}칩)` : ''}
    </div>
    ${handsHtml}${chipsHtml}
    ${buttonsHtml}
  `;
}

function hideResultOverlay() {
  const o = document.getElementById('result-overlay');
  o.classList.add('hidden');
  o.innerHTML = '';
}

function nextRound() {
  hideResultOverlay();
  socket.emit('nextRound', (res) => {
    if (!res?.ok) showToast(res?.msg || '다음 라운드 시작 실패');
  });
}

function backToLobbyBtn() {
  const isHost = currentRoom?.host === myId;
  if (isHost) {
    socket.emit('backToLobby');
  } else {
    leaveRoom();
  }
}

function gameTypeName(gt) {
  return { onecard: '원카드', poker: '텍사스 홀덤', seotda: '섯다' }[gt] || gt;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
