// 가짜 엑셀 스프레드시트 배경 생성
(function() {
  const COL_WIDTHS = [40, 90, 80, 120, 70, 70, 80, 70, 70, 70, 70, 70, 70];
  const COLS = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
  const ROW_COUNT = 40;

  // 컬럼 헤더
  const colHeaderRow = document.getElementById('col-header-row');
  COLS.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'col-hdr';
    el.style.width = COL_WIDTHS[i] + 'px';
    el.textContent = c;
    colHeaderRow.appendChild(el);
  });

  // 행 번호
  const rowHeader = document.getElementById('row-header');
  for (let r = 1; r <= ROW_COUNT; r++) {
    const el = document.createElement('div');
    el.className = 'row-num';
    el.textContent = r;
    rowHeader.appendChild(el);
  }

  // 가짜 데이터
  const fakeData = [
    ['', '2024년 하반기 판매실적 집계표', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '구분', '담당자', '거래처명', '계획(만원)', '실적(만원)', '달성률', '전월대비', '비고', '', '', '', ''],
    ['', '1월', '김철수', '(주)하나물산', '42,000', '38,500', '=E4/F4', '▲3.2%', '완료', '', '', '', ''],
    ['', '2월', '이영희', '대한무역(주)', '35,000', '36,200', '=E5/F5', '▲1.8%', '완료', '', '', '', ''],
    ['', '3월', '박민준', '태양상사', '38,000', '34,100', '=E6/F6', '▼2.5%', '검토중', '', '', '', ''],
    ['', '4월', '최수진', '(주)미래산업', '45,000', '47,300', '=E7/F7', '▲5.1%', '완료', '', '', '', ''],
    ['', '5월', '정대한', '글로벌코리아', '40,000', '39,800', '=E8/F8', '▼0.5%', '완료', '', '', '', ''],
    ['', '6월', '한지민', '(주)성원유통', '43,000', '41,500', '=E9/F9', '▲2.3%', '완료', '', '', '', ''],
    ['', '소계', '', '', '=SUM(E4:E9)', '=SUM(F4:F9)', '=F10/E10', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '7월', '김철수', '(주)하나물산', '44,000', '46,100', '=E12/F12', '▲4.8%', '완료', '', '', '', ''],
    ['', '8월', '이영희', '대한무역(주)', '37,000', '35,400', '=E13/F13', '▼1.9%', '완료', '', '', '', ''],
    ['', '9월', '박민준', '태양상사', '41,000', '43,200', '=E14/F14', '▲5.4%', '검토중', '', '', '', ''],
    ['', '10월', '최수진', '(주)미래산업', '48,000', '50,100', '=E15/F15', '▲4.4%', '완료', '', '', '', ''],
    ['', '11월', '정대한', '글로벌코리아', '42,000', '41,000', '=E16/F16', '▼2.4%', '진행중', '', '', '', ''],
    ['', '12월', '한지민', '(주)성원유통', '46,000', '', '', '', '예정', '', '', '', ''],
    ['', '소계', '', '', '=SUM(E12:E17)', '=SUM(F12:F16)', '=F18/E18', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '합계', '', '', '=E10+E18', '=F10+F18', '=F20/E20', '', '', '', '', '', ''],
  ];

  const fakeSheet = document.getElementById('fake-sheet');

  for (let r = 1; r <= ROW_COUNT; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'sheet-row';
    const rowData = fakeData[r - 1] || [];

    COLS.forEach((c, ci) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = COL_WIDTHS[ci] + 'px';
      cell.setAttribute('tabindex', '0');

      const val = rowData[ci] || '';
      cell.textContent = val;

      if (r === 1 && ci === 1) cell.classList.add('bold');
      if (r === 3) { cell.classList.add('header-cell'); }
      if ([10, 18, 20].includes(r) && ci === 1) cell.classList.add('bold');
      if (val.startsWith('=')) cell.classList.add('formula');
      if (/^[\d,]+$/.test(val)) cell.classList.add('number');
      if (val.includes('%') || val === '담당자' || val === '거래처명') cell.classList.add('text-center');

      cell.addEventListener('click', () => {
        document.querySelectorAll('.cell.selected').forEach(el => el.classList.remove('selected'));
        cell.classList.add('selected');
        document.getElementById('cell-ref').textContent = `${c}${r}`;
        document.getElementById('formula-input').textContent = val || '';
      });

      rowEl.appendChild(cell);
    });

    fakeSheet.appendChild(rowEl);
  }
})();
