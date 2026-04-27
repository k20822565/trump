// 텍사스 홀덤 클라이언트 렌더링

function renderPokerState(state) {
  const content = document.getElementById('game-content');
  const isMyTurn = state.currentTurn === myId;
  const me = state.players.find(p => p.id === myId);
  const myCards = state.myCards || [];

  const stageNames = {
    preflop: '프리플롭', flop: '플롭', turn: '턴', river: '리버', showdown: '쇼다운'
  };

  // 플레이어 바
  let playerBars = state.players.map(p => {
    const isActive = state.currentTurn === p.id;
    const isMe = p.id === myId;
    let cls = 'player-chip';
    if (isActive) cls += ' active-turn';
    if (isMe) cls += ' me';
    if (p.folded) cls += ' folded';
    return `<div class="${cls}">
      ${p.nickname}
      <span class="chip-icon">●</span>${p.chips}칩
      ${p.bet > 0 ? `<span style="color:#888">(베팅:${p.bet})</span>` : ''}
      ${p.allin ? '<span style="color:#c00">올인</span>' : ''}
      ${isActive && !p.folded ? ' ◀' : ''}
    </div>`;
  }).join('');

  // 커뮤니티 카드
  let communityHtml = '';
  for (let i = 0; i < 5; i++) {
    const card = state.community[i];
    if (card) {
      const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
      communityHtml += `<div class="card card-md ${color}">
        <span class="c-rank">${card.rank}</span>
        <span class="c-suit">${card.suit}</span>
      </div>`;
    } else {
      communityHtml += `<div class="card card-md back"></div>`;
    }
  }

  // 내 패
  let myCardsHtml = myCards.map(card => {
    const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
    return `<div class="card card-md ${color}">
      <span class="c-rank">${card.rank}</span>
      <span class="c-suit">${card.suit}</span>
    </div>`;
  }).join('');

  // 상대 패 (뒤집힘)
  let otherCardsHtml = state.players.filter(p => p.id !== myId && !p.folded).map(p =>
    `<div style="font-size:10px;color:#888;text-align:center">
      ${p.nickname}<br>
      <div style="display:flex;gap:2px">${'<div class="card card-sm back"></div>'.repeat(p.cardCount)}</div>
    </div>`
  ).join('');

  // 베팅 컨트롤
  let betControls = '';
  if (isMyTurn && me && !me.folded && !me.allin) {
    const callAmt = state.currentBet - (me.bet || 0);
    const canCheck = callAmt <= 0;
    betControls = `
      <div class="bet-controls">
        <button class="btn btn-danger" onclick="pokerAction('fold')">폴드</button>
        ${canCheck
          ? `<button class="btn btn-default" onclick="pokerAction('check')">체크</button>`
          : `<button class="btn btn-default" onclick="pokerAction('call')">콜 (${Math.min(callAmt, me.chips)}칩)</button>`
        }
        <button class="btn btn-primary" onclick="pokerAction('raise', parseInt(document.getElementById('raise-input').value))">레이즈</button>
        <input type="number" id="raise-input" min="${state.currentBet * 2}" max="${me.chips + (me.bet||0)}" value="${state.currentBet * 2}" style="width:60px;height:22px;border:1px solid #ababab;padding:0 4px;font-size:11px">
        <button class="btn btn-danger" onclick="pokerAction('allin')">올인 (${me.chips}칩)</button>
      </div>
    `;
  } else if (isMyTurn && me?.allin) {
    betControls = `<div class="bet-controls"><span style="color:#c00;font-size:11px">올인 상태 — 결과 대기중</span></div>`;
  } else if (!isMyTurn) {
    betControls = `<div class="bet-controls" style="color:#888;font-size:11px">상대방 행동 대기중...</div>`;
  }

  content.innerHTML = `
    <div class="players-bar">${playerBars}</div>
    <div class="game-info-bar">
      <span class="label">스테이지:</span>
      <span class="val">${stageNames[state.stage] || state.stage}</span>
      <span class="label" style="margin-left:8px">현재 베팅:</span>
      <span class="val">${state.currentBet}칩</span>
    </div>
    <div class="pot-display">팟 ${state.pot}칩</div>
    <div>
      <div class="hand-label">커뮤니티 카드</div>
      <div class="community-area">${communityHtml}</div>
    </div>
    <div style="display:flex;gap:16px;margin:4px 0">
      <div>
        <div class="hand-label">내 패</div>
        <div class="hand-area">${myCardsHtml}</div>
      </div>
      ${otherCardsHtml.length ? `<div><div class="hand-label">상대 패</div><div style="display:flex;gap:8px;align-items:flex-end">${otherCardsHtml}</div></div>` : ''}
    </div>
    ${betControls}
  `;
}

function pokerAction(action, amount) {
  socket.emit('poker:action', { action, amount: amount | 0 }, (res) => {
    if (!res?.ok) showToast(res?.msg || '오류');
  });
}
