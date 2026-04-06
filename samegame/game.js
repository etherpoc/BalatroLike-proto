// ============================================================
//  さめがめ × バラトロライク プロトタイプ
// ============================================================

const ROWS = 12, COLS = 10, COLORS = 5;
const MAX_ANTE = 8, MAX_ARTIFACTS = 5, MAX_ITEMS = 2;
const INIT_HANDS = 4;

// ============================================================
//  SOUND SYSTEM (Web Audio API)
// ============================================================
const Sound = (() => {
  let ctx = null;
  let _muted = false;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  document.addEventListener('click', ensure, { once: true });
  document.addEventListener('keydown', ensure, { once: true });

  function osc(type, freq, dur, vol = 0.12, detune = 0) {
    if (_muted) return;
    const c = ensure();
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  return {
    get muted() { return _muted; },
    set muted(v) { _muted = v; },
    pop(count) {
      // satisfying pop scaled by count
      const base = Math.min(300 + count * 20, 800);
      osc('sine', base, 0.12, 0.15);
      osc('triangle', base * 1.5, 0.08, 0.06);
    },
    clear(count) {
      // ascending arpeggio for big clears
      const notes = [523, 659, 784, 1047];
      const n = Math.min(Math.floor(count / 5) + 1, notes.length);
      for (let i = 0; i < n; i++)
        setTimeout(() => osc('sine', notes[i], 0.18, 0.1), i * 80);
    },
    fullClear() {
      [523, 659, 784, 1047, 1318].forEach((f, i) =>
        setTimeout(() => osc('sine', f, 0.25, 0.12), i * 70));
    },
    score() { osc('sine', 1200, 0.1, 0.08); osc('sine', 1500, 0.08, 0.05); },
    refill() { osc('triangle', 200, 0.15, 0.1); osc('triangle', 300, 0.1, 0.06); },
    roundClear() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => osc('sine', f, 0.2, 0.12), i * 100));
    },
    gameOverSnd() {
      [440, 370, 311, 261].forEach((f, i) =>
        setTimeout(() => osc('sawtooth', f, 0.25, 0.08), i * 120));
    },
    shopBuy() { osc('square', 1200, 0.06, 0.08); osc('sine', 1800, 0.1, 0.06); },
    uiClick() { osc('sine', 800, 0.04, 0.06); },
  };
})();

// BGM
let bgmOscs = [];
function startBGM() {
  stopBGM();
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === 'suspended') c.resume();
    const freqs = [65.4, 98, 130.8]; // C2, G2, C3
    freqs.forEach(f => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0.02;
      o.connect(g); g.connect(c.destination); o.start();
      bgmOscs.push({ o, g, c });
    });
  } catch (e) {}
}
function stopBGM() {
  bgmOscs.forEach(({ o }) => { try { o.stop(); } catch (e) {} });
  bgmOscs = [];
}

// ============================================================
//  ARTIFACT DEFINITIONS
// ============================================================
const ARTIFACT_DEFS = {
  passionRed: {
    id: 'passionRed', name: '情熱の赤', cat: 'color',
    desc: '赤ブロック(△)消去時 ベース倍率+5', price: 5,
  },
  squareRoot: {
    id: 'squareRoot', name: 'スクエア・ルート', cat: 'shape',
    desc: '正方形に近い形で消去時 最終倍率×2', price: 7,
  },
  chainReaction: {
    id: 'chainReaction', name: 'チェイン・リアクション', cat: 'combo',
    desc: '落下連鎖時 その連鎖の倍率×3', price: 7,
  },
  recyclePlant: {
    id: 'recyclePlant', name: 'リサイクル・プラント', cat: 'sustain',
    desc: '15枚以上消去で20%の確率で手数+1', price: 6,
  },
  prismMining: {
    id: 'prismMining', name: 'プリズム・マイニング', cat: 'economy',
    desc: '5色すべて消すとクリア時$10ボーナス', price: 5,
  },
};

// ============================================================
//  CONSUMABLE DEFINITIONS
// ============================================================
const ITEM_DEFS = {
  paint: {
    id: 'paint', name: 'ペンキ塗り', price: 5,
    desc: '3×3範囲を指定色に塗り替え', target: 'board',
  },
  hammer: {
    id: 'hammer', name: '解体ハンマー', price: 3,
    desc: '孤立した1ブロックを消去', target: 'board',
  },
  gravity: {
    id: 'gravity', name: '重力操作', price: 4,
    desc: '次の1回 重力方向を左or右に変更', target: 'none',
  },
};

const ANTE_BASE = [300, 700, 1400, 2500, 4000, 6000, 9000, 13000];
const COLOR_NAMES = ['赤△', '青○', '緑□', '橙×', '紫◇'];

// ============================================================
//  STATE
// ============================================================
const S = {
  board: [],      // ROWS×COLS, -1=empty, 0-4=color
  ante: 1, blindIdx: 0, money: 4,
  artifacts: [], items: [],
  score: 0, target: 0, reward: 0,
  hands: INIT_HANDS,
  overrunning: false,
  colorsUsed: new Set(), // for prism mining
  inputLocked: false,
  // item state
  paintMode: false, paintColor: -1,
  hammerMode: false,
  gravityDir: null, // null, 'left', 'right'
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// ============================================================
//  BOARD LOGIC
// ============================================================
function emptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(-1)); }

function fillBoard(board) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === -1) board[r][c] = Math.floor(Math.random() * COLORS);
}

function getGroup(board, r, c) {
  const color = board[r][c];
  if (color < 0) return [];
  const visited = new Set();
  const stack = [[r, c]];
  while (stack.length > 0) {
    const [cr, cc] = stack.pop();
    const key = `${cr},${cc}`;
    if (visited.has(key)) continue;
    if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) continue;
    if (board[cr][cc] !== color) continue;
    visited.add(key);
    stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
  }
  return [...visited].map(k => k.split(',').map(Number));
}

function applyGravity(board) {
  if (S.gravityDir === 'left' || S.gravityDir === 'right') {
    applyHorizontalGravity(board, S.gravityDir);
    S.gravityDir = null;
    return;
  }
  // Default: down gravity + left compaction
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) if (board[r][c] >= 0) col.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = col.length > 0 ? (col.shift() ?? -1) : -1;
  }
  compactLeft(board);
}

function compactLeft(board) {
  // Remove empty columns by shifting left
  let write = 0;
  for (let c = 0; c < COLS; c++) {
    let hasBlock = false;
    for (let r = 0; r < ROWS; r++) if (board[r][c] >= 0) { hasBlock = true; break; }
    if (hasBlock) {
      if (write !== c) {
        for (let r = 0; r < ROWS; r++) { board[r][write] = board[r][c]; board[r][c] = -1; }
      }
      write++;
    }
  }
}

function applyHorizontalGravity(board, dir) {
  // Gravity left or right instead of down
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    if (dir === 'left') {
      for (let c = 0; c < COLS; c++) if (board[r][c] >= 0) row.push(board[r][c]);
      for (let c = 0; c < COLS; c++) board[r][c] = c < row.length ? row[c] : -1;
    } else {
      for (let c = COLS - 1; c >= 0; c--) if (board[r][c] >= 0) row.push(board[r][c]);
      for (let c = COLS - 1; c >= 0; c--) board[r][c] = row.length > 0 ? (row.shift() ?? -1) : -1;
    }
  }
}

function isBoardEmpty(board) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] >= 0) return false;
  return true;
}

function hasAnyGroup(board) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] >= 0 && getGroup(board, r, c).length >= 2) return true;
  return false;
}

function isIsolated(board, r, c) {
  return board[r][c] >= 0 && getGroup(board, r, c).length === 1;
}

function hasArtifact(id) { return S.artifacts.some(a => a.id === id); }

// ============================================================
//  SCORE CALCULATION
// ============================================================
function calcScore(count, color, isChain) {
  let chips = count * 10;
  let addMult = 0, mulMult = 1, baseMult = 1.0;

  // Count bonus
  if (count >= 20) addMult += 20;
  else if (count >= 10) addMult += 8;
  else if (count >= 5) addMult += 2;

  // Full clear
  if (isBoardEmpty(S.board)) mulMult *= 5;

  // Artifacts
  if (hasArtifact('passionRed') && color === 0) baseMult += 5;

  if (hasArtifact('squareRoot')) {
    // Approximate: count is close to a perfect square
    const side = Math.round(Math.sqrt(count));
    if (side * side === count && count >= 4) mulMult *= 2;
  }

  if (hasArtifact('chainReaction') && isChain) mulMult *= 3;

  if (hasArtifact('recyclePlant') && count >= 15 && Math.random() < 0.2) {
    S.hands++;
  }

  const totalMult = (baseMult + addMult) * mulMult;
  const total = Math.floor(chips * totalMult);
  return { chips, baseMult, addMult, mulMult, totalMult, total };
}

// ============================================================
//  RENDERING
// ============================================================
function renderBoard(clearingCells) {
  const el = document.getElementById('board');
  el.innerHTML = '';

  // Hover group tracking
  let hoverGroup = null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = S.board[r][c];

      if (v < 0) {
        cell.classList.add('empty');
      } else {
        cell.classList.add('block', `c${v}`);
        if (clearingCells && clearingCells.some(([cr, cc]) => cr === r && cc === c)) {
          cell.classList.add('clearing');
        }

        // Hammer mode: only isolated blocks clickable
        if (S.hammerMode) {
          if (isIsolated(S.board, r, c)) {
            cell.addEventListener('click', () => useHammer(r, c));
          }
        }
        // Paint mode: click to paint
        else if (S.paintMode) {
          cell.addEventListener('click', () => usePaint(r, c));
        }
        // Normal play
        else if (!S.inputLocked) {
          cell.addEventListener('click', () => handleClick(r, c));
          cell.addEventListener('mouseenter', () => highlightGroup(r, c));
          cell.addEventListener('mouseleave', () => clearHighlight());
        }
      }
      el.appendChild(cell);
    }
  }
}

function highlightGroup(r, c) {
  const group = getGroup(S.board, r, c);
  if (group.length < 2) return;
  const el = document.getElementById('board');
  group.forEach(([gr, gc]) => {
    const idx = gr * COLS + gc;
    if (el.children[idx]) el.children[idx].classList.add('highlight');
  });
}

function clearHighlight() {
  document.querySelectorAll('.cell.highlight').forEach(c => c.classList.remove('highlight'));
}

function updateUI() {
  document.getElementById('ui-target').textContent = S.target.toLocaleString();
  document.getElementById('ui-score').textContent = S.score.toLocaleString();
  document.getElementById('ui-money').textContent = `$${S.money}`;
  document.getElementById('ui-hands').textContent = S.hands;
  document.getElementById('btn-refill').disabled = S.hands <= 0;
  const goalEl = document.getElementById('goal-banner');
  if (S.overrunning) goalEl.classList.remove('hidden'); else goalEl.classList.add('hidden');
}

function flashCalc(chips, totalMult, total) {
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = chips;
  document.getElementById('calc-mult').textContent = totalMult % 1 === 0 ? totalMult : totalMult.toFixed(1);
  document.getElementById('calc-result').textContent = `+${total.toLocaleString()}`;
  el.classList.remove('hidden', 'flash'); void el.offsetWidth; el.classList.add('flash');
  Sound.score();
}

function renderArtifacts() {
  const el = document.getElementById('ui-artifacts');
  el.innerHTML = '';
  for (let i = 0; i < MAX_ARTIFACTS; i++) {
    const slot = document.createElement('div');
    if (i < S.artifacts.length) {
      slot.className = 'art-slot';
      slot.innerHTML = `<div class="a-name">${S.artifacts[i].name}</div><div class="a-desc">${S.artifacts[i].desc}</div>`;
    } else { slot.className = 'art-slot empty'; slot.textContent = '—'; }
    el.appendChild(slot);
  }
}

function renderItems() {
  const el = document.getElementById('ui-items');
  el.innerHTML = '';
  for (let i = 0; i < MAX_ITEMS; i++) {
    const slot = document.createElement('div');
    if (i < S.items.length) {
      const def = ITEM_DEFS[S.items[i]];
      slot.className = 'item-slot';
      slot.innerHTML = `<div class="i-name">${def.name}</div><div class="i-desc">${def.desc}</div>`;
      const idx = i;
      slot.addEventListener('click', () => useItem(idx));
    } else { slot.className = 'item-slot empty'; slot.textContent = '—'; }
    el.appendChild(slot);
  }
}

// ============================================================
//  CLICK HANDLER
// ============================================================
function handleClick(r, c) {
  if (S.inputLocked) return;
  const group = getGroup(S.board, r, c);
  if (group.length < 2) return;

  S.inputLocked = true;
  const color = S.board[r][c];

  // Track color for prism mining
  S.colorsUsed.add(color);

  // Remove group
  for (const [gr, gc] of group) S.board[gr][gc] = -1;

  Sound.pop(group.length);
  renderBoard(group);

  setTimeout(() => {
    const sc = calcScore(group.length, color, false);

    applyGravity(S.board);

    if (sc.total > 0) {
      S.score += sc.total;
      flashCalc(sc.chips, sc.totalMult, sc.total);
    }

    // Check full clear
    if (isBoardEmpty(S.board)) Sound.fullClear();

    // Check overrun
    if (!S.overrunning && S.score >= S.target) S.overrunning = true;

    updateUI();

    // Check chain (auto-combos after gravity)
    setTimeout(() => checkChain(), 200);
  }, 350);
}

function checkChain() {
  // After gravity, no auto-chain in standard samegame — just end turn
  S.inputLocked = false;
  renderBoard(null);
  checkGameState();
}

function checkGameState() {
  if (!hasAnyGroup(S.board) && S.hands <= 0) {
    if (S.overrunning) overrunPenalty();
    else gameOver('手詰まり — 消せるブロックがなく手数も尽きた...');
  }
}

// ============================================================
//  REFILL
// ============================================================
function handleRefill() {
  if (S.hands <= 0 || S.inputLocked) return;
  S.hands--;
  fillBoard(S.board);
  Sound.refill();
  renderBoard(null);
  updateUI();
}

// ============================================================
//  ITEMS
// ============================================================
function useItem(idx) {
  if (S.inputLocked) return;
  const itemId = S.items[idx];

  if (itemId === 'gravity') {
    const dir = prompt('重力方向 (left / right):');
    if (dir === 'left' || dir === 'right') {
      S.gravityDir = dir;
      S.items.splice(idx, 1);
      Sound.uiClick();
      renderItems();
    }
    return;
  }

  if (itemId === 'paint') {
    const colorStr = prompt('塗り替える色 (0:赤△, 1:青○, 2:緑□, 3:橙×, 4:紫◇):');
    const c = parseInt(colorStr);
    if (c >= 0 && c < COLORS) {
      S.paintMode = true;
      S.paintColor = c;
      S.paintItemIdx = idx;
      renderBoard(null);
    }
    return;
  }

  if (itemId === 'hammer') {
    S.hammerMode = true;
    S.hammerItemIdx = idx;
    renderBoard(null);
    return;
  }
}

function usePaint(r, c) {
  if (!S.paintMode) return;
  // Paint 3x3 area centered on (r,c)
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && S.board[nr][nc] >= 0)
        S.board[nr][nc] = S.paintColor;
    }
  S.items.splice(S.paintItemIdx, 1);
  S.paintMode = false;
  Sound.uiClick();
  renderBoard(null); renderItems();
}

function useHammer(r, c) {
  if (!S.hammerMode) return;
  S.board[r][c] = -1;
  applyGravity(S.board);
  S.items.splice(S.hammerItemIdx, 1);
  S.hammerMode = false;
  Sound.pop(1);
  renderBoard(null); renderItems(); updateUI();
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
    { name: 'SMALL', mult: 1, reward: 3 },
    { name: 'BIG', mult: 1.5, reward: 4 },
    { name: 'BOSS', mult: 2, reward: 6 },
  ];
  for (let i = S.blindIdx; i < types.length; i++) {
    const t = types[i];
    const target = Math.floor(ANTE_BASE[S.ante - 1] * t.mult);
    const card = document.createElement('div');
    card.className = 'blind-card';
    card.innerHTML = `<div class="b-name">${t.name} BLIND</div><div class="b-target">${target.toLocaleString()}</div><div class="b-reward">報酬: $${t.reward}</div>`;
    card.addEventListener('click', () => { Sound.uiClick(); startPuzzle(i, target, t.reward); });
    container.appendChild(card);
  }
}

// ============================================================
//  PUZZLE PHASE
// ============================================================
function startPuzzle(blindIdx, target, reward) {
  S.blindIdx = blindIdx; S.target = target; S.reward = reward;
  S.score = 0; S.overrunning = false;
  S.inputLocked = false;
  S.hands = INIT_HANDS;
  S.colorsUsed = new Set();
  S.paintMode = false; S.hammerMode = false; S.gravityDir = null;

  // Fill if board is empty
  if (isBoardEmpty(S.board)) fillBoard(S.board);

  showScreen('puzzle');
  document.getElementById('goal-banner').classList.add('hidden');
  document.getElementById('calc-display').classList.add('hidden');
  document.getElementById('btn-round-clear').onclick = roundClearManual;
  document.getElementById('btn-refill').onclick = handleRefill;

  startBGM();
  renderBoard(null); renderArtifacts(); renderItems(); updateUI();
}

// ============================================================
//  ROUND CLEAR / PENALTY / GAME OVER
// ============================================================
function roundClearManual() {
  if (!S.overrunning) return;
  stopBGM();
  Sound.roundClear();

  // Reset board for next round
  S.board = emptyBoard();

  const interest = Math.min(Math.floor(S.money / 5), 5);
  let prismBonus = 0;
  if (hasArtifact('prismMining') && S.colorsUsed.size >= COLORS) prismBonus = 10;
  const total = S.reward + interest + prismBonus;
  S.money += total;

  let html = `<div class="result-title clear">CLEAR!</div><div class="result-box">
    <div><span class="rl">スコア: </span><span class="rv">${S.score.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
    <div><span class="rl">報酬: </span><span class="rv">$${S.reward}</span></div>
    <div><span class="rl">利子: </span><span class="rv">$${interest}</span></div>`;
  if (prismBonus > 0) html += `<div><span class="rl">プリズム・マイニング: </span><span class="rv">$${prismBonus}</span></div>`;
  html += `<div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
    <span class="rl">合計: </span><span class="rv">$${total}</span></div>
    </div><button class="btn" id="btn-to-shop">ショップへ</button>`;
  document.getElementById('result-content').innerHTML = html;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function overrunPenalty() {
  stopBGM(); Sound.gameOverSnd();
  S.board = emptyBoard(); // Reset board
  const interest = Math.min(Math.floor(S.money / 5), 5);
  const total = S.reward + interest;
  S.money += total;

  document.getElementById('result-content').innerHTML = `
    <div class="result-title" style="color:var(--fail)">PENALTY</div>
    <div style="color:var(--fail);font-size:11px;border:1px solid var(--fail);padding:5px 12px">欲張りの代償</div>
    <div class="result-box">
      <div><span class="rl">報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子: </span><span class="rv">$${interest}</span></div>
      <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
        <span class="rl">合計: </span><span class="rv">$${total}</span></div>
    </div><button class="btn" id="btn-to-shop">ショップへ</button>`;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function gameOver(reason) {
  stopBGM(); Sound.gameOverSnd();
  showScreen('gameover');
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-stats').innerHTML = `
    <div>ANTE: ${S.ante} / ${MAX_ANTE}</div>
    <div>スコア: ${S.score.toLocaleString()} / ${S.target.toLocaleString()}</div>`;
}

function showWin() {
  stopBGM(); Sound.roundClear();
  showScreen('win');
  document.getElementById('win-stats').innerHTML = `
    <div>全 ${MAX_ANTE} ANTE クリア！</div>
    <div>最終所持金: $${S.money}</div>
    <div>アーティファクト: ${S.artifacts.map(a => a.name).join(', ') || 'なし'}</div>`;
}

function advanceBlind() {
  S.blindIdx++;
  if (S.blindIdx > 2) { S.blindIdx = 0; S.ante++; if (S.ante > MAX_ANTE) { showWin(); return; } }
  showShop();
}

// ============================================================
//  SHOP
// ============================================================
function showShop() {
  stopBGM();
  showScreen('shop');
  document.getElementById('shop-money').textContent = `$${S.money}`;
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  const ownedIds = S.artifacts.map(a => a.id);
  const avail = Object.keys(ARTIFACT_DEFS).filter(id => !ownedIds.includes(id));
  shuffle(avail);

  const offered = [
    ...avail.slice(0, 3).map(id => ({ def: ARTIFACT_DEFS[id], cat: 'artifact' })),
    ...shuffle(Object.keys(ITEM_DEFS)).slice(0, 2).map(id => ({ def: ITEM_DEFS[id], cat: 'consumable' })),
  ];
  offered.forEach(({ def, cat }) => {
    const el = document.createElement('div');
    el.className = 'shop-item';
    const nc = cat === 'consumable' ? 'si-name consumable' : 'si-name';
    el.innerHTML = `<div class="si-type">${cat === 'artifact' ? 'ARTIFACT' : 'CONSUMABLE'}</div>
      <div class="${nc}">${def.name}</div><div class="si-desc">${def.desc}</div>
      <div class="si-price">$${def.price}</div>`;
    el.addEventListener('click', () => {
      if (el.classList.contains('sold')) return;
      if (S.money < def.price) return;
      if (cat === 'artifact') { if (S.artifacts.length >= MAX_ARTIFACTS) return; S.artifacts.push({ ...def }); }
      else { if (S.items.length >= MAX_ITEMS) return; S.items.push(def.id); }
      S.money -= def.price; el.classList.add('sold');
      el.querySelector('.si-price').textContent = 'SOLD';
      document.getElementById('shop-money').textContent = `$${S.money}`;
      Sound.shopBuy();
    });
    container.appendChild(el);
  });
}

// ============================================================
//  INIT
// ============================================================
function initGame() {
  S.ante = 1; S.blindIdx = 0; S.money = 4;
  S.artifacts = []; S.items = [];
  S.board = emptyBoard(); S.hands = INIT_HANDS;
  S.overrunning = false; S.colorsUsed = new Set();
  S.paintMode = false; S.hammerMode = false; S.gravityDir = null;
}

document.getElementById('btn-start').addEventListener('click', () => { Sound.uiClick(); initGame(); showBlindSelect(); });
document.getElementById('btn-next-round').addEventListener('click', () => { Sound.uiClick(); showBlindSelect(); });
document.getElementById('btn-retry').addEventListener('click', () => { Sound.uiClick(); initGame(); showBlindSelect(); });
document.getElementById('btn-win-retry').addEventListener('click', () => { Sound.uiClick(); initGame(); showBlindSelect(); });

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
