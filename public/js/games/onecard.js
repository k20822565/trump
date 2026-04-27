// 원카드 클라이언트 렌더링
let pendingWildIndex = null;

function renderOnecardState(state) {
  const content = document.getElementById('game-content');
  const isMyTurn = state.currentTurn === myId;
  const myHand = state.myHand || [];
  const top = state.topCard;

  // 플레이어 바
  let playerBars = state.players.map(id => {
    const nick = state.nicknames[id];
    const cnt = state.handCounts[id] ?? 0;
    const isActive = state.currentTurn === id;
    const isMe = id === myId;
    return `<div class="player-chip ${isActive ? 'active-turn' : ''} ${isMe ? 'me' : ''}">
      ${nick} <span style="color:#888">(${cnt}장)</span>
      ${isActive ? ' ◀' : ''}
    </div>`;
  }).join('');

  // 버릴 패 (탑 카드)
  const topColor = (top.suit === '♥' || top.suit === '♦') ? 'red' : 'black';
  const topHtml = `<div class="card card-md ${topColor}">
    <span class="c-rank">${top.rank}</span>
    <span class="c-suit">${top.suit}</span>
  </div>`;

  // 현재 색상
  const colorName = { '♠': '스페이드', '♥': '하트', '♦': '다이아', '♣': '클럽' }[state.currentColor] || '';

  // 내 손패
  let handHtml = myHand.map((card, i) => {
    const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
    const playable = isMyTurn && canPlayCard(card, top, state.currentColor, state.pendingDraw);
    return `<div class="card card-sm ${color} ${!playable ? 'disabled' : ''}"
      onclick="${playable ? `onecardPlay(${i})` : ''}">
      <span class="c-rank">${card.rank}</span>
      <span class="c-suit">${card.suit}</span>
    </div>`;
  }).join('');

  const drawLabel = state.pendingDraw > 0 ? `+${state.pendingDraw}장 드로우` : '카드 뽑기';

  content.innerHTML = `
    <div class="players-bar">${playerBars}</div>
    <div class="game-info-bar">
      <span class="label">현재 무늬:</span>
      <span class="val">${state.currentColor} ${colorName}</span>
      <span class="label" style="margin-left:8px">방향:</span>
      <span class="val">${state.direction === 1 ? '→' : '←'}</span>
      ${state.pendingDraw > 0 ? `<span style="color:#c00;font-weight:700;margin-left:8px">누적 +${state.pendingDraw}</span>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
      <div>
        <div class="hand-label">버린 패</div>
        <div>${topHtml}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${isMyTurn ? `<button class="btn btn-default" onclick="onecardDraw()" style="font-size:11px">${drawLabel}</button>` : ''}
      </div>
    </div>
    <div>
      <div class="hand-label">내 패 (${myHand.length}장) ${isMyTurn ? '— 낼 카드를 클릭하세요' : '— 상대 턴 대기중'}</div>
      <div class="hand-area">${handHtml}</div>
    </div>
  `;
}

function canPlayCard(card, top, currentColor, pendingDraw) {
  if (pendingDraw > 0 && card.rank !== '2') return false;
  if (card.rank === 'A') return true;
  if (card.suit === currentColor) return true;
  if (card.rank === top.rank) return true;
  if (card.suit === top.suit) return true;
  return false;
}

function onecardPlay(cardIndex) {
  const card = currentGameState?.myHand?.[cardIndex];
  if (!card) return;
  if (card.rank === 'A') {
    pendingWildIndex = cardIndex;
    document.getElementById('color-picker').classList.remove('hidden');
    return;
  }
  socket.emit('onecard:playCard', { cardIndex, chosenColor: null }, (res) => {
    if (!res?.ok) showToast(res?.msg || '낼 수 없는 카드입니다.');
  });
}

function pickColor(color) {
  document.getElementById('color-picker').classList.add('hidden');
  if (pendingWildIndex === null) return;
  const idx = pendingWildIndex;
  pendingWildIndex = null;
  socket.emit('onecard:playCard', { cardIndex: idx, chosenColor: color }, (res) => {
    if (!res?.ok) showToast(res?.msg || '낼 수 없는 카드입니다.');
  });
}

function onecardDraw() {
  socket.emit('onecard:draw', (res) => {
    if (!res?.ok) showToast(res?.msg || '오류');
    else if (res.drew > 1) showToast(`${res.drew}장을 드로우했습니다.`);
  });
}
