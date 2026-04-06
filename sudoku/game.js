// ============================================================
//  数独 × バラトロライク プロトタイプ
// ============================================================

const SIZE = 9;
const BLOCK = 3;
const HAND_SIZE = 5;
const MAX_ANTE = 8;
const MAX_ARTIFACTS = 5;
const MAX_ITEMS = 2;
const INIT_DISCARDS = 3;

// ============================================================
//  ARTIFACT DEFINITIONS
// ============================================================
const ARTIFACT_DEFS = {
  oddPhilosophy: {
    id: 'oddPhilosophy', name: '奇数の哲学', cat: 'chip',
    desc: '奇数(1,3,5,7,9)配置時チップ+20', price: 5,
  },
  cornerPiece: {
    id: 'cornerPiece', name: 'コーナー・ピース', cat: 'mult',
    desc: '四隅に配置時 倍率+3', price: 6,
  },
  crossword: {
    id: 'crossword', name: 'クロスワード', cat: 'multiply',
    desc: 'クロス消去時 ×3→×5に強化', price: 7,
  },
  numberNine: {
    id: 'numberNine', name: 'ナンバー・ナイン', cat: 'scaling',
    desc: '「9」で消去発生ごとに永続倍率+0.5', price: 6,
    scalingValue: 0,
  },
  compromise: {
    id: 'compromise', name: '妥協案', cat: 'rule',
    desc: '各ブロックで1つだけ数字の重複配置可能', price: 7,
  },
};

// ============================================================
//  CONSUMABLE DEFINITIONS
// ============================================================
const ITEM_DEFS = {
  eraser: {
    id: 'eraser', name: '消しゴム', price: 4,
    desc: '盤面の数字を1つ消去', target: 'board',
  },
  rewrite: {
    id: 'rewrite', name: 'インクの書き換え', price: 4,
    desc: '手札1枚を好きな数字に変換', target: 'hand',
  },
  forcePlay: {
    id: 'forcePlay', name: '強制執行', price: 5,
    desc: '次の1回 配置ルールを無視', target: 'none',
  },
  reprint: {
    id: 'reprint', name: '増刷', price: 3,
    desc: '手札1枚を選び山札にコピー3枚追加', target: 'hand',
  },
};

const ANTE_BASE = [150, 400, 800, 1500, 2500, 4000, 6000, 9000];

// ============================================================
//  STATE
// ============================================================
const S = {
  board: [],        // 9×9 (0=empty, 1-9=number)
  deck: [],         // draw pile
  discard: [],      // discard pile
  hand: [],         // current hand (array of numbers)
  selectedHand: -1, // index in hand
  ante: 1, blindIdx: 0, money: 4,
  artifacts: [], items: [],
  score: 0, target: 0, reward: 0,
  discards: INIT_DISCARDS,
  overrunning: false,
  forcePlayActive: false,
  // compromise tracking: { "blockKey": count }
  compromiseUsed: {},
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// ============================================================
//  BOARD HELPERS
// ============================================================
function emptyBoard() { return Array.from({length:SIZE}, () => Array(SIZE).fill(0)); }

function getBlock(r, c) { return [Math.floor(r/BLOCK), Math.floor(c/BLOCK)]; }
function blockKey(r, c) { const [br,bc]=getBlock(r,c); return `${br},${bc}`; }

function canPlace(board, r, c, num) {
  if (board[r][c] !== 0) return false;
  // Row check
  if (board[r].includes(num)) return false;
  // Col check
  for (let rr=0; rr<SIZE; rr++) if (board[rr][c] === num) return false;
  // Block check
  const [br,bc] = getBlock(r,c);
  const sr = br*BLOCK, sc = bc*BLOCK;
  let blockCount = 0;
  for (let rr=sr; rr<sr+BLOCK; rr++)
    for (let cc=sc; cc<sc+BLOCK; cc++)
      if (board[rr][cc] === num) blockCount++;

  if (blockCount > 0) {
    // Compromise artifact: allow 1 duplicate per block
    if (hasArtifact('compromise')) {
      const key = blockKey(r, c);
      const used = S.compromiseUsed[key] || 0;
      if (blockCount === 1 && used === 0) return true; // allow once
    }
    return false;
  }
  return true;
}

function getValidCells(board, num) {
  const cells = [];
  for (let r=0; r<SIZE; r++)
    for (let c=0; c<SIZE; c++)
      if (canPlace(board, r, c, num)) cells.push([r, c]);
  return cells;
}

// Check if row/col/block is complete (all 9 filled)
function checkClears(board) {
  const clears = []; // array of { type, index, cells }

  // Rows
  for (let r=0; r<SIZE; r++) {
    if (board[r].every(v => v !== 0))
      clears.push({ type:'row', idx:r, cells: Array.from({length:SIZE},(_,c)=>[r,c]) });
  }
  // Cols
  for (let c=0; c<SIZE; c++) {
    let full = true;
    for (let r=0; r<SIZE; r++) if (board[r][c]===0) { full=false; break; }
    if (full) clears.push({ type:'col', idx:c, cells: Array.from({length:SIZE},(_,r)=>[r,c]) });
  }
  // Blocks
  for (let br=0; br<3; br++) for (let bc=0; bc<3; bc++) {
    let full = true;
    const cells = [];
    for (let r=br*3; r<br*3+3; r++) for (let c=bc*3; c<bc*3+3; c++) {
      cells.push([r,c]);
      if (board[r][c]===0) full=false;
    }
    if (full) clears.push({ type:'block', idx:`${br},${bc}`, cells });
  }
  return clears;
}

function hasArtifact(id) { return S.artifacts.some(a => a.id === id); }
function getArtifact(id) { return S.artifacts.find(a => a.id === id); }

// ============================================================
//  DECK
// ============================================================
function buildDeck() {
  const d = [];
  for (let n=1; n<=9; n++) for (let i=0; i<5; i++) d.push(n);
  shuffle(d);
  return d;
}

function drawHand() {
  while (S.hand.length < HAND_SIZE && S.deck.length > 0)
    S.hand.push(S.deck.pop());
}

function rebuildDeck() {
  S.deck = [...S.discard];
  S.discard = [];
  shuffle(S.deck);
}

// ============================================================
//  SCORE CALCULATION
// ============================================================
function calcScore(num, r, c, clears) {
  let chips = num;
  let addMult = 0, mulMult = 1, baseMult = 1.0;

  // Artifact: 奇数の哲学
  if (hasArtifact('oddPhilosophy') && num % 2 === 1) chips += 20;

  // Artifact: コーナー・ピース
  if (hasArtifact('cornerPiece') && isCorner(r, c)) addMult += 3;

  // Clear bonus
  if (clears.length > 0) {
    addMult += 5.0;

    // Cross clear (2+ areas)
    if (clears.length >= 2) {
      mulMult *= hasArtifact('crossword') ? 5 : 3;
    }

    // ナンバー・ナイン
    if (num === 9) {
      const art = getArtifact('numberNine');
      if (art) { art.scalingValue += 0.5; addMult += art.scalingValue; }
    }
  }

  const totalMult = (baseMult + addMult) * mulMult;
  const total = Math.floor(chips * totalMult);
  return { chips, baseMult, addMult, mulMult, totalMult, total };
}

function isCorner(r, c) { return (r===0||r===SIZE-1) && (c===0||c===SIZE-1); }

// ============================================================
//  RENDERING
// ============================================================
function renderBoard(clearingCells, placedCell) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const selNum = S.selectedHand >= 0 ? S.hand[S.selectedHand] : null;
  const validSet = new Set();
  if (selNum !== null) {
    if (S.forcePlayActive) {
      for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (S.board[r][c]===0) validSet.add(`${r},${c}`);
    } else {
      for (const [r,c] of getValidCells(S.board, selNum)) validSet.add(`${r},${c}`);
    }
  }

  for (let r=0; r<SIZE; r++) {
    for (let c=0; c<SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';

      // Block borders
      if (c % 3 === 2 && c < SIZE-1) cell.classList.add('br');
      if (r % 3 === 2 && r < SIZE-1) cell.classList.add('bb');

      const val = S.board[r][c];
      if (val !== 0) {
        cell.textContent = val;
        cell.classList.add('filled');
        if (placedCell && placedCell[0]===r && placedCell[1]===c) cell.classList.add('placed');
        if (clearingCells && clearingCells.some(([cr,cc])=>cr===r&&cc===c)) cell.classList.add('clearing');
      } else if (selNum !== null) {
        if (validSet.has(`${r},${c}`)) {
          cell.classList.add('valid-target');
          cell.addEventListener('click', () => placeNumber(r, c));
        } else {
          cell.classList.add('invalid');
        }
      }

      boardEl.appendChild(cell);
    }
  }
}

function renderHand() {
  const el = document.getElementById('hand');
  el.innerHTML = '';
  S.hand.forEach((num, i) => {
    const card = document.createElement('div');
    card.className = 'hand-card';
    if (i === S.selectedHand) card.classList.add('selected');
    card.textContent = num;
    card.addEventListener('click', () => selectHand(i));
    el.appendChild(card);
  });

  document.getElementById('deck-info').textContent = `デッキ残り: ${S.deck.length}枚`;
  document.getElementById('discard-count').textContent = `残り${S.discards}回`;
  document.getElementById('btn-discard').disabled = S.discards <= 0 || S.hand.length === 0;
}

function selectHand(idx) {
  S.selectedHand = S.selectedHand === idx ? -1 : idx;
  renderHand();
  renderBoard(null, null);
}

function updateUI() {
  document.getElementById('ui-target').textContent = S.target.toLocaleString();
  document.getElementById('ui-score').textContent = S.score.toLocaleString();
  document.getElementById('ui-money').textContent = `$${S.money}`;
  const goalEl = document.getElementById('goal-banner');
  if (S.overrunning) goalEl.classList.remove('hidden'); else goalEl.classList.add('hidden');
}

function flashCalc(chips, totalMult, total) {
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = chips;
  document.getElementById('calc-mult').textContent = totalMult%1===0 ? totalMult : totalMult.toFixed(1);
  document.getElementById('calc-result').textContent = `+${total.toLocaleString()}`;
  el.classList.remove('hidden','flash'); void el.offsetWidth; el.classList.add('flash');
}

function renderArtifacts() {
  const el = document.getElementById('ui-artifacts');
  el.innerHTML = '';
  for (let i=0; i<MAX_ARTIFACTS; i++) {
    const slot = document.createElement('div');
    if (i < S.artifacts.length) {
      const a = S.artifacts[i];
      slot.className = 'art-slot';
      let h = `<div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div>`;
      if (a.id==='numberNine' && a.scalingValue>0) h += `<div class="a-scaling">+${a.scalingValue.toFixed(1)} mult</div>`;
      slot.innerHTML = h;
    } else { slot.className='art-slot empty'; slot.textContent='—'; }
    el.appendChild(slot);
  }
}

function renderItems() {
  const el = document.getElementById('ui-items');
  el.innerHTML = '';
  for (let i=0; i<MAX_ITEMS; i++) {
    const slot = document.createElement('div');
    if (i < S.items.length) {
      const def = ITEM_DEFS[S.items[i]];
      slot.className='item-slot';
      slot.innerHTML = `<div class="i-name">${def.name}</div><div class="i-desc">${def.desc}</div>`;
      const idx = i;
      slot.addEventListener('click', () => useItem(idx));
    } else { slot.className='item-slot empty'; slot.textContent='—'; }
    el.appendChild(slot);
  }
}

// ============================================================
//  PLACE NUMBER
// ============================================================
function placeNumber(r, c) {
  if (S.selectedHand < 0) return;
  const num = S.hand[S.selectedHand];

  if (!S.forcePlayActive && !canPlace(S.board, r, c, num) && S.board[r][c] !== 0) return;

  // Compromise tracking
  if (hasArtifact('compromise')) {
    const key = blockKey(r, c);
    const [br,bc] = getBlock(r,c);
    const sr = br*BLOCK, sc = bc*BLOCK;
    let exists = false;
    for (let rr=sr;rr<sr+BLOCK;rr++) for (let cc=sc;cc<sc+BLOCK;cc++) if (S.board[rr][cc]===num) exists=true;
    if (exists) S.compromiseUsed[key] = (S.compromiseUsed[key]||0) + 1;
  }

  if (S.forcePlayActive) S.forcePlayActive = false;

  S.board[r][c] = num;
  S.hand.splice(S.selectedHand, 1);
  S.selectedHand = -1;

  // Check clears
  const clears = checkClears(S.board);
  const clearingCells = [];
  for (const cl of clears) clearingCells.push(...cl.cells);

  // Score
  const sc = calcScore(num, r, c, clears);

  renderBoard(clearingCells.length > 0 ? clearingCells : null, [r, c]);
  if (sc.total > 0) {
    S.score += sc.total;
    flashCalc(sc.chips, sc.totalMult, sc.total);
  }

  // Perform clears after animation
  setTimeout(() => {
    if (clearingCells.length > 0) {
      const cleared = new Set(clearingCells.map(([r,c])=>`${r},${c}`));
      for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
        if (cleared.has(`${r},${c}`)) {
          S.discard.push(S.board[r][c]);
          S.board[r][c] = 0;
        }
      }
      // Reset compromise for cleared blocks
      for (const cl of clears) {
        if (cl.type==='block') delete S.compromiseUsed[cl.idx];
      }
    }

    // Draw
    drawHand();
    if (S.hand.length === 0 && S.deck.length === 0) rebuildDeck(), drawHand();

    // Check overrun
    if (!S.overrunning && S.score >= S.target) S.overrunning = true;

    // Check game over
    if (checkGameOver()) {
      if (S.overrunning) overrunPenalty();
      else gameOver('手詰まり — 配置できる場所がない...');
      return;
    }

    renderBoard(null, null);
    renderHand();
    renderArtifacts();
    updateUI();
  }, clears.length > 0 ? 400 : 50);
}

function checkGameOver() {
  // Any hand card can be placed somewhere?
  for (const num of S.hand) {
    if (S.forcePlayActive) return false;
    if (getValidCells(S.board, num).length > 0) return false;
  }
  // Can't place anything, and no discards left
  return S.discards <= 0;
}

// ============================================================
//  DISCARD
// ============================================================
function handleDiscard() {
  if (S.discards <= 0 || S.hand.length === 0) return;
  S.discards--;
  S.discard.push(...S.hand);
  S.hand = [];
  drawHand();
  if (S.hand.length === 0 && S.deck.length === 0) rebuildDeck(), drawHand();
  S.selectedHand = -1;
  renderHand();
  renderBoard(null, null);

  if (checkGameOver()) {
    if (S.overrunning) overrunPenalty();
    else gameOver('手詰まり — 配置できる場所がない...');
  }
}

// ============================================================
//  ITEMS
// ============================================================
function useItem(idx) {
  const itemId = S.items[idx];
  const def = ITEM_DEFS[itemId];

  if (itemId === 'forcePlay') {
    S.forcePlayActive = true;
    S.items.splice(idx, 1);
    renderItems(); renderBoard(null, null);
    return;
  }

  if (itemId === 'eraser') {
    // Let player click a filled cell
    const boardEl = document.getElementById('board');
    boardEl.querySelectorAll('.cell.filled').forEach(cell => {
      const i = Array.from(boardEl.children).indexOf(cell);
      const r = Math.floor(i/SIZE), c = i%SIZE;
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', function handler() {
        S.discard.push(S.board[r][c]);
        S.board[r][c] = 0;
        S.items.splice(idx, 1);
        renderItems(); renderBoard(null, null); renderHand();
      }, { once: true });
    });
    return;
  }

  if (itemId === 'rewrite' || itemId === 'reprint') {
    // Select a hand card first
    if (S.selectedHand < 0) return; // must select hand card first
    if (itemId === 'rewrite') {
      const newNum = prompt('変換先の数字 (1-9):');
      const n = parseInt(newNum);
      if (n >= 1 && n <= 9) S.hand[S.selectedHand] = n;
    } else {
      const num = S.hand[S.selectedHand];
      for (let i=0; i<3; i++) S.deck.push(num);
      shuffle(S.deck);
    }
    S.items.splice(idx, 1);
    S.selectedHand = -1;
    renderItems(); renderHand(); renderBoard(null, null);
  }
}

// ============================================================
//  ROUND CLEAR / PENALTY / GAME OVER
// ============================================================
function roundClearManual() {
  if (!S.overrunning) return;
  const interest = Math.min(Math.floor(S.money/5), 5);
  const total = S.reward + interest;
  S.money += total;

  document.getElementById('result-content').innerHTML = `
    <div class="result-title clear">CLEAR!</div>
    <div class="result-box">
      <div><span class="rl">スコア: </span><span class="rv">${S.score.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
      <div><span class="rl">報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子: </span><span class="rv">$${interest}</span></div>
      <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
        <span class="rl">合計: </span><span class="rv">$${total}</span></div>
    </div>
    <button class="btn" id="btn-to-shop">ショップへ</button>`;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function overrunPenalty() {
  const interest = Math.min(Math.floor(S.money/5), 5);
  const total = S.reward + interest;
  S.money += total;

  document.getElementById('result-content').innerHTML = `
    <div class="result-title" style="color:var(--fail)">PENALTY</div>
    <div style="color:var(--fail);font-size:11px;border:1px solid var(--fail);padding:5px 12px">欲張りの代償 — ボーナス没収</div>
    <div class="result-box">
      <div><span class="rl">スコア: </span><span class="rv">${S.target.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
      <div><span class="rl">報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子: </span><span class="rv">$${interest}</span></div>
      <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
        <span class="rl">合計: </span><span class="rv">$${total}</span></div>
    </div>
    <button class="btn" id="btn-to-shop">ショップへ</button>`;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function gameOver(reason) {
  showScreen('gameover');
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-stats').innerHTML = `
    <div>ANTE: ${S.ante} / ${MAX_ANTE}</div>
    <div>スコア: ${S.score.toLocaleString()} / ${S.target.toLocaleString()}</div>`;
}
function showWin() {
  showScreen('win');
  document.getElementById('win-stats').innerHTML = `
    <div>全 ${MAX_ANTE} ANTE クリア！</div>
    <div>最終所持金: $${S.money}</div>
    <div>アーティファクト: ${S.artifacts.map(a=>a.name).join(', ')||'なし'}</div>`;
}

function advanceBlind() {
  S.blindIdx++;
  if (S.blindIdx > 2) { S.blindIdx=0; S.ante++; if (S.ante>MAX_ANTE){showWin();return;} }
  showShop();
}

// ============================================================
//  BLIND SELECT
// ============================================================
function showBlindSelect() {
  showScreen('blind');
  document.getElementById('ante-display').textContent = `ANTE ${S.ante} / ${MAX_ANTE}`;
  const container = document.getElementById('blind-cards');
  container.innerHTML = '';
  const types = [
    {name:'SMALL',mult:1,reward:3},{name:'BIG',mult:1.5,reward:4},{name:'BOSS',mult:2,reward:6},
  ];
  for (let i=S.blindIdx; i<types.length; i++) {
    const t=types[i];
    const target = Math.floor(ANTE_BASE[S.ante-1]*t.mult);
    const card = document.createElement('div');
    card.className = 'blind-card';
    card.innerHTML = `<div class="b-name">${t.name} BLIND</div><div class="b-target">${target.toLocaleString()}</div><div class="b-reward">報酬: $${t.reward}</div>`;
    card.addEventListener('click', () => startPuzzle(i, target, t.reward));
    container.appendChild(card);
  }
}

// ============================================================
//  PUZZLE START
// ============================================================
function startPuzzle(blindIdx, target, reward) {
  S.blindIdx = blindIdx; S.target = target; S.reward = reward;
  S.score = 0; S.overrunning = false; S.forcePlayActive = false;
  S.selectedHand = -1; S.discards = INIT_DISCARDS;

  // First round: init board + deck
  const hasTiles = S.board.some(r => r.some(v => v!==0));
  const hasDeck = S.deck.length > 0 || S.hand.length > 0;
  if (!hasTiles && !hasDeck) {
    S.board = emptyBoard();
    S.deck = buildDeck();
    S.discard = [];
    S.hand = [];
    S.compromiseUsed = {};
  }
  drawHand();

  showScreen('puzzle');
  document.getElementById('goal-banner').classList.add('hidden');
  document.getElementById('calc-display').classList.add('hidden');
  document.getElementById('btn-round-clear').onclick = roundClearManual;
  document.getElementById('btn-discard').onclick = handleDiscard;

  renderBoard(null, null); renderHand(); renderArtifacts(); renderItems(); updateUI();
}

// ============================================================
//  SHOP
// ============================================================
function showShop() {
  showScreen('shop');
  document.getElementById('shop-money').textContent = `$${S.money}`;
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  const ownedIds = S.artifacts.map(a=>a.id);
  const avail = Object.keys(ARTIFACT_DEFS).filter(id => !ownedIds.includes(id));
  shuffle(avail);

  const offered = [
    ...avail.slice(0,3).map(id=>({def:ARTIFACT_DEFS[id],cat:'artifact'})),
    ...shuffle(Object.keys(ITEM_DEFS)).slice(0,2).map(id=>({def:ITEM_DEFS[id],cat:'consumable'})),
  ];
  offered.forEach(({def,cat})=>{
    const el = document.createElement('div');
    el.className='shop-item';
    const nc = cat==='consumable'?'si-name consumable':'si-name';
    el.innerHTML=`<div class="si-type">${cat==='artifact'?'ARTIFACT':'CONSUMABLE'}</div><div class="${nc}">${def.name}</div><div class="si-desc">${def.desc}</div><div class="si-price">$${def.price}</div>`;
    el.addEventListener('click',()=>{
      if (el.classList.contains('sold')) return;
      if (S.money<def.price) return;
      if (cat==='artifact'){if(S.artifacts.length>=MAX_ARTIFACTS)return;S.artifacts.push({...def,scalingValue:def.scalingValue||0});}
      else{if(S.items.length>=MAX_ITEMS)return;S.items.push(def.id);}
      S.money-=def.price;el.classList.add('sold');el.querySelector('.si-price').textContent='SOLD';
      document.getElementById('shop-money').textContent=`$${S.money}`;
    });
    container.appendChild(el);
  });
}

// ============================================================
//  INIT
// ============================================================
function initGame() {
  S.ante=1;S.blindIdx=0;S.money=4;S.artifacts=[];S.items=[];
  S.board=emptyBoard();S.deck=[];S.discard=[];S.hand=[];
  S.selectedHand=-1;S.overrunning=false;S.forcePlayActive=false;
  S.compromiseUsed={};
}

document.getElementById('btn-start').addEventListener('click',()=>{initGame();showBlindSelect();});
document.getElementById('btn-next-round').addEventListener('click',showBlindSelect);
document.getElementById('btn-retry').addEventListener('click',()=>{initGame();showBlindSelect();});
document.getElementById('btn-win-retry').addEventListener('click',()=>{initGame();showBlindSelect();});

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
