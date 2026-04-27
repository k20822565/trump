// 섯다 클라이언트 렌더링

const HWATU_NAMES = ['','1월(솔)','2월(매)','3월(벚)','4월(흑싸리)','5월(난)','6월(모란)','7월(홍싸리)','8월(공산)','9월(국화)','10월(단풍)'];
const HWATU_EMOJI = ['','🌲','🌸','🌺','🌿','🌿','🌹','🌾','🍁','🌻','🍂'];

function renderSeotdaState(state) {
  const content = document.getElementById('game-content');
  const isMyTurn = state.currentTurn === myId;
  const me = state.players.find(p => p.id === myId);
  const myHand = state.myHand || [];

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
      ${isActive && !p.folded ? ' ◀' : ''}
    </div>`;
  }).join('');

  // 내 패
  let myHandHtml = myHand.map((card, i) => {
    const m = card.month;
    return `<div class="hwatu-card hwatu-${m}" title="${HWATU_NAMES[m]}">
      <span class="hw-month">${HWATU_EMOJI[m]}</span>
      <span class="hw-label">${m}월</span>
    </div>`;
  }).join('');

  // 패 정보 표시
  const handEval = myHand.length === 2 ? evalSeotdaClient(myHand[0], myHand[1]) : '';
  const isGusa = myHand.length === 2 && myHand[0].month !== myHand[1].month &&
    ((myHand[0].month === 4 && myHand[1].month === 9) || (myHand[0].month === 9 && myHand[1].month === 4));

  // 상대 패 (뒤집힘)
  let otherHandsHtml = state.players.filter(p => p.id !== myId).map(p =>
    `<div style="font-size:10px;color:#888;text-align:center">
      ${p.nickname}<br>
      <div style="display:flex;gap:2px">
        ${p.folded
          ? '<div style="font-size:9px;color:#c00">다이</div>'
          : '<div class="hwatu-card back"></div><div class="hwatu-card back"></div>'
        }
      </div>
    </div>`
  ).join('');

  // 베팅 컨트롤
  let betControls = '';
  if (isMyTurn && me && !me.folded) {
    const callAmt = state.currentBet - (me.bet || 0);
    const canCheck = callAmt <= 0;
    betControls = `
      <div class="bet-controls">
        <button class="btn btn-danger" onclick="seotdaAction('die')">다이</button>
        ${canCheck
          ? `<button class="btn btn-default" onclick="seotdaAction('call')">체크</button>`
          : `<button class="btn btn-default" onclick="seotdaAction('call')">콜 (${Math.min(callAmt, me.chips)}칩)</button>`
        }
        <button class="btn btn-primary" onclick="seotdaAction('raise', parseInt(document.getElementById('seotda-raise').value))">레이즈</button>
        <input type="number" id="seotda-raise" min="${state.currentBet + 1}" max="${me.chips + (me.bet||0)}" value="${state.currentBet + 1}" style="width:55px;height:22px;border:1px solid #ababab;padding:0 4px;font-size:11px">
        ${isGusa && !me.gusaRevealed ? `
          <button class="btn btn-default" onclick="seotdaGusaReveal()" title="구사 공개 시 판 무효">구사공개</button>
        ` : ''}
      </div>
    `;
  } else if (!isMyTurn) {
    betControls = `<div class="bet-controls" style="color:#888;font-size:11px">상대방 행동 대기중...</div>`;
  }

  content.innerHTML = `
    <div class="players-bar">${playerBars}</div>
    <div class="game-info-bar">
      <span class="label">현재 베팅:</span>
      <span class="val">${state.currentBet}칩</span>
    </div>
    <div class="pot-display">팟 ${state.pot}칩</div>
    <div style="display:flex;gap:16px;margin:4px 0;flex-wrap:wrap">
      <div>
        <div class="hand-label">내 패 ${handEval ? `— <b style="color:#217346">${handEval}</b>` : ''}</div>
        <div class="hand-area">${myHandHtml}</div>
      </div>
      ${otherHandsHtml.length ? `<div><div class="hand-label">상대 패</div><div style="display:flex;gap:8px;align-items:flex-end">${otherHandsHtml}</div></div>` : ''}
    </div>
    ${betControls}
  `;
}

function evalSeotdaClient(c1, c2) {
  const months = [c1.month, c2.month].sort((a,b)=>a-b);
  const [lo, hi] = months;
  if (lo === hi) return lo === 10 ? '장땡' : `${lo}땡`;
  if (lo === 1 && hi === 2) return '알리';
  if (lo === 1 && hi === 4) return '독사';
  if (lo === 4 && hi === 9) return '구사';
  if (lo === 4 && hi === 10) return '장사';
  if (lo === 3 && hi === 6) return '세륙';
  if (lo === 3 && hi === 8) return '암행어사';
  const sum = (lo + hi) % 10;
  if (sum === 0) return '망통';
  return `${sum}끗`;
}

function seotdaAction(action, amount) {
  socket.emit('seotda:action', { action, amount: amount | 0 }, (res) => {
    if (!res?.ok) showToast(res?.msg || '오류');
  });
}

function seotdaGusaReveal() {
  if (!confirm('구사를 공개하면 이번 판이 무효(재배팅)됩니다. 공개하시겠습니까?')) return;
  socket.emit('seotda:gusa', { reveal: true }, (res) => {
    if (!res?.ok) showToast(res?.msg || '오류');
    else showToast('구사를 공개했습니다! 판이 무효되어 재배팅합니다.');
  });
}
