// ============================================================
//  リバーシ × バラトロライク プロトタイプ v4
// ============================================================

const SIZE = 8;
const MAX_ANTE = 8;
const MAX_ARTIFACTS = 5;
const MAX_ITEMS = 2;

const EMPTY = 0, BLACK = 1, WHITE = 2;

// ============================================================
//  ARTIFACT DEFINITIONS
// ============================================================
const ARTIFACT_DEFS = {
  edgeGuardian: {
    id: 'edgeGuardian', name: '辺の守護者', cat: 'chip',
    desc: 'ひっくり返した辺の石1枚につきチップ+30', price: 5,
  },
  cornerKing: {
    id: 'cornerKing', name: '角の支配者', cat: 'mult',
    desc: '角を取った時の役ボーナスが+10に強化', price: 7,
  },
  greedyPot: {
    id: 'greedyPot', name: '強欲の壺', cat: 'overrun',
    desc: 'オーバーラン中10,000点ごとにクリア時$1増加', price: 6,
  },
  collector: {
    id: 'collector', name: 'コレクター', cat: 'overrun',
    desc: 'オーバーラン中に返すたびベースチップ永続+1', price: 6,
    scalingValue: 0,
  },
  goldenWedge: {
    id: 'goldenWedge', name: '黄金の楔', cat: 'economy',
    desc: '角に黒石がある状態で精算すると$15ボーナス', price: 5,
  },
};

// ============================================================
//  CONSUMABLE DEFINITIONS
// ============================================================
const ITEM_DEFS = {
  whiteout: {
    id: 'whiteout', name: 'ホワイトアウト', price: 5,
    desc: '黒石を最大5つ白石に戻す', target: 'multi', maxSelect: 5,
  },
  tectonicShift: {
    id: 'tectonicShift', name: '地殻変動', price: 6,
    desc: '全石を白黒反転', target: 'none',
  },
  forceThrough: {
    id: 'forceThrough', name: '強行突破', price: 4,
    desc: '次の1手は空きマスにも黒石を置ける', target: 'none',
  },
};

// ---- Target scores ----
const ANTE_BASE = [200, 500, 1000, 2000, 3500, 5500, 8000, 12000];
const AI_NAMES = ['', 'Lv1 強欲', 'Lv2 警戒', 'Lv3 戦略'];

// ============================================================
//  GAME STATE
// ============================================================
const S = {
  board: [],
  ante: 1,
  blindIdx: 0,
  money: 4,
  artifacts: [],
  items: [],
  score: 0,
  target: 0,
  reward: 0,
  aiLevel: 1,
  inputLocked: false,
  forceThroughActive: false,
  targeting: null,
  selectedCells: [],
  // Overrun state
  overrunning: false,
  scoreAtTarget: 0,       // score when target was first reached
};

// ============================================================
//  SCREENS
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// ============================================================
//  REVERSI CORE ENGINE
// ============================================================
function emptyBoard() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)); }

function initBoard() {
  S.board = emptyBoard();
  const m = SIZE / 2;
  S.board[m-1][m-1] = WHITE; S.board[m-1][m] = BLACK;
  S.board[m][m-1] = BLACK;   S.board[m][m] = WHITE;
}

const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function getFlips(board, r, c, color) {
  if (board[r][c] !== EMPTY) return [];
  const opp = color === BLACK ? WHITE : BLACK;
  const all = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === opp) {
      line.push([nr, nc]); nr += dr; nc += dc;
    }
    if (line.length > 0 && nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === color)
      all.push(...line);
  }
  return all;
}

function getValidMoves(board, color) {
  const moves = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue;
      const flips = getFlips(board, r, c, color);
      if (flips.length > 0) moves.push({ r, c, flips });
    }
  return moves;
}

function isCorner(r, c) { return (r === 0 || r === SIZE-1) && (c === 0 || c === SIZE-1); }
function isEdge(r, c) { return (r === 0 || r === SIZE-1 || c === 0 || c === SIZE-1) && !isCorner(r, c); }
function isDangerZone(r, c) {
  for (const [cr, cc] of [[0,0],[0,SIZE-1],[SIZE-1,0],[SIZE-1,SIZE-1]])
    if (Math.abs(r-cr) <= 1 && Math.abs(c-cc) <= 1 && !(r===cr && c===cc)) return true;
  return false;
}
function countStones(board) {
  let black=0, white=0, empty=0;
  for (let r=0; r<SIZE; r++) for (let c=0; c<SIZE; c++) {
    if (board[r][c]===BLACK) black++; else if (board[r][c]===WHITE) white++; else empty++;
  }
  return { black, white, empty };
}
function hasArtifact(id) { return S.artifacts.some(a => a.id === id); }
function getArtifact(id) { return S.artifacts.find(a => a.id === id); }

// ============================================================
//  AI LOGIC
// ============================================================
function aiLv1(moves) {
  const max = Math.max(...moves.map(m => m.flips.length));
  const best = moves.filter(m => m.flips.length === max);
  return best[Math.floor(Math.random() * best.length)];
}
function aiLv2(moves) {
  const scored = moves.map(m => {
    let s = m.flips.length;
    if (isCorner(m.r, m.c)) s += 100;
    else if (isEdge(m.r, m.c)) s += 20;
    else if (isDangerZone(m.r, m.c)) s -= 50;
    return { ...m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0];
}
function aiLv3(moves) {
  let best = null, bestS = -Infinity;
  for (const m of moves) {
    const sim = S.board.map(r => [...r]);
    sim[m.r][m.c] = WHITE;
    for (const [fr, fc] of m.flips) sim[fr][fc] = WHITE;
    let s = -getValidMoves(sim, BLACK).length * 10;
    if (isCorner(m.r, m.c)) s += 100;
    else if (isEdge(m.r, m.c)) s += 15;
    else if (isDangerZone(m.r, m.c)) s -= 40;
    s += m.flips.length;
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
function aiChooseMove(moves) {
  const lv = S.aiLevel;
  if (lv >= 3) return aiLv3(moves);
  if (lv >= 2) return aiLv2(moves);
  return aiLv1(moves);
}

// ============================================================
//  SCORE CALCULATION
// ============================================================
function calcScore(r, c, flips) {
  let chips = flips.length * 10;
  let addMult = 0, mulMult = 1, baseMult = 1.0;

  // Role bonuses
  if (isCorner(r, c)) addMult += hasArtifact('cornerKing') ? 10.0 : 3.0;
  else if (isEdge(r, c)) addMult += 1.0;

  // Artifact: 辺の守護者
  if (hasArtifact('edgeGuardian'))
    for (const [fr, fc] of flips) if (isEdge(fr, fc)) chips += 30;

  // Artifact: コレクター (permanent base chip during overrun)
  const collector = getArtifact('collector');
  if (collector) chips += collector.scalingValue;

  const totalMult = (baseMult + addMult) * mulMult;
  const total = Math.floor(chips * totalMult);
  return { chips, baseMult, addMult, mulMult, totalMult, total };
}

// ============================================================
//  RENDERING
// ============================================================
function renderBoard(flippedCells, placedCell) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const isPlayerTurn = !S.inputLocked && !S.targeting;
  const validMoves = isPlayerTurn
    ? (S.forceThroughActive ? getForceValidMoves() : getValidMoves(S.board, BLACK))
    : [];
  const validSet = new Set(validMoves.map(m => `${m.r},${m.c}`));
  const targeting = S.targeting !== null;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const val = S.board[r][c];

      if (val !== EMPTY) {
        const stone = document.createElement('div');
        stone.className = `stone ${val === BLACK ? 'black' : 'white'}`;
        if (flippedCells && flippedCells.some(([fr,fc]) => fr===r && fc===c)) stone.classList.add('flipped');
        if (placedCell && placedCell[0]===r && placedCell[1]===c) stone.classList.add('placed');
        cell.appendChild(stone);
      }

      // Targeting: whiteout select black stones
      if (targeting && S.targeting.itemId === 'whiteout' && val === BLACK) {
        cell.classList.add('clickable');
        cell.addEventListener('click', () => handleTargetClick(r, c));
      }
      // Normal play
      else if (isPlayerTurn && val === EMPTY && validSet.has(`${r},${c}`)) {
        cell.classList.add('valid');
        cell.addEventListener('click', () => handlePlayerMove(r, c));
      }

      boardEl.appendChild(cell);
    }
  }
}

function getForceValidMoves() {
  const moves = getValidMoves(S.board, BLACK);
  const set = new Set(moves.map(m => `${m.r},${m.c}`));
  for (let r=0; r<SIZE; r++) for (let c=0; c<SIZE; c++)
    if (S.board[r][c] === EMPTY && !set.has(`${r},${c}`)) moves.push({ r, c, flips: [] });
  return moves;
}

function setTurnBanner(text, cls) {
  const el = document.getElementById('turn-banner');
  el.textContent = text;
  el.className = `turn-banner ${cls}`;
}

function updateUI() {
  document.getElementById('ui-target').textContent = S.target.toLocaleString();
  document.getElementById('ui-score').textContent = S.score.toLocaleString();
  document.getElementById('ui-money').textContent = `$${S.money}`;

  const { black, white, empty } = countStones(S.board);
  const total = black + white + empty;
  const pct = Math.round((black / total) * 100);
  const fill = document.getElementById('life-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('danger', pct > 70);
  document.getElementById('life-text').textContent = `BLACK: ${pct}%`;

  document.getElementById('corner-status').innerHTML =
    [[0,0],[0,SIZE-1],[SIZE-1,0],[SIZE-1,SIZE-1]].map(([r,c]) => {
      const own = S.board[r][c] === BLACK;
      return `<span class="${own ? 'active' : ''}">角[${r},${c}]: ${own ? 'OWN' : '---'}</span>`;
    }).join('<br>');

  document.getElementById('enemy-level').textContent = `ENEMY: ${AI_NAMES[S.aiLevel]}`;

  // Goal banner visibility
  const goalEl = document.getElementById('goal-banner');
  if (S.overrunning) goalEl.classList.remove('hidden');
  else goalEl.classList.add('hidden');
}

function flashCalc(chips, totalMult, total) {
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = chips;
  document.getElementById('calc-mult').textContent = totalMult % 1 === 0 ? totalMult : totalMult.toFixed(1);
  document.getElementById('calc-result').textContent = `+${total.toLocaleString()}`;
  el.classList.remove('hidden', 'flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function renderArtifacts() {
  const el = document.getElementById('ui-artifacts');
  el.innerHTML = '';
  for (let i = 0; i < MAX_ARTIFACTS; i++) {
    const slot = document.createElement('div');
    if (i < S.artifacts.length) {
      const art = S.artifacts[i];
      slot.className = 'art-slot';
      let html = `<div class="a-name">${art.name}</div><div class="a-desc">${art.desc}</div>`;
      if (art.id === 'collector' && art.scalingValue > 0)
        html += `<div style="color:var(--gold);font-size:8px">+${art.scalingValue} chips</div>`;
      slot.innerHTML = html;
    } else {
      slot.className = 'art-slot empty'; slot.textContent = '—';
    }
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
    } else {
      slot.className = 'item-slot empty'; slot.textContent = '—';
    }
    el.appendChild(slot);
  }
}

// ============================================================
//  TURN MANAGEMENT
// ============================================================
function handlePlayerMove(r, c) {
  if (S.inputLocked) return;

  let flips = getFlips(S.board, r, c, BLACK);
  if (flips.length === 0 && !S.forceThroughActive) return;
  if (S.forceThroughActive) S.forceThroughActive = false;

  S.inputLocked = true;

  S.board[r][c] = BLACK;
  for (const [fr, fc] of flips) S.board[fr][fc] = BLACK;

  // Collector: +1 permanent chip per flip during overrun
  if (S.overrunning) {
    const collector = getArtifact('collector');
    if (collector) collector.scalingValue += flips.length;
  }

  const sc = calcScore(r, c, flips);
  renderBoard(flips, [r, c]);
  if (sc.total > 0) {
    S.score += sc.total;
    flashCalc(sc.chips, sc.totalMult, sc.total);
  }
  updateUI();
  renderArtifacts();

  setTimeout(() => {
    // Check if target just reached → enter overrun
    if (!S.overrunning && S.score >= S.target) {
      S.overrunning = true;
      S.scoreAtTarget = S.score;
      updateUI(); // show goal banner
    }

    startAITurn();
  }, 350);
}

function startAITurn() {
  const aiMoves = getValidMoves(S.board, WHITE);
  if (aiMoves.length === 0) {
    setTurnBanner('ENEMY: PASS', 'enemy');
    setTimeout(() => afterAITurn(), 500);
    return;
  }

  setTurnBanner('ENEMY: THINKING...', 'enemy');
  renderBoard(null, null);

  const delay = 400 + Math.random() * 400;
  setTimeout(() => {
    const move = aiChooseMove(aiMoves);
    S.board[move.r][move.c] = WHITE;
    for (const [fr, fc] of move.flips) S.board[fr][fc] = WHITE;

    renderBoard(move.flips, [move.r, move.c]);
    updateUI();

    setTimeout(() => afterAITurn(), 300);
  }, delay);
}

function afterAITurn() {
  const { empty } = countStones(S.board);
  const playerMoves = getValidMoves(S.board, BLACK);
  const aiMoves = getValidMoves(S.board, WHITE);
  const gameEnded = empty === 0 || (playerMoves.length === 0 && aiMoves.length === 0);

  if (gameEnded) {
    if (S.overrunning) {
      // Penalty: lose surplus, forced advance
      overrunPenalty();
    } else {
      gameOver('対局終了 — スコア未達成...');
    }
    return;
  }

  if (playerMoves.length === 0) {
    setTurnBanner('PLAYER: PASS', 'player');
    setTimeout(() => startAITurn(), 500);
    return;
  }

  S.inputLocked = false;
  setTurnBanner('YOUR TURN', 'player');
  renderBoard(null, null);
}

// ============================================================
//  OVERRUN / ROUND CLEAR / PENALTY
// ============================================================

// Player clicks "ROUND CLEAR" button during overrun
function roundClearManual() {
  if (!S.overrunning) return;
  S.inputLocked = true;

  const surplus = S.score - S.scoreAtTarget;
  const interest = Math.min(Math.floor(S.money / 5), 5);
  let goldBonus = 0;
  if (hasArtifact('goldenWedge')) {
    for (const [r,c] of [[0,0],[0,SIZE-1],[SIZE-1,0],[SIZE-1,SIZE-1]])
      if (S.board[r][c] === BLACK) goldBonus += 15;
  }
  let greedyBonus = 0;
  if (hasArtifact('greedyPot')) greedyBonus = Math.floor(surplus / 10000);

  const total = S.reward + interest + goldBonus + greedyBonus;
  S.money += total;

  let html = `
    <div class="result-title clear">CLEAR!</div>
    <div class="result-box">
      <div><span class="rl">スコア: </span><span class="rv">${S.score.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
      <div><span class="rl">余剰スコア（オーバーラン）: </span><span class="rv">+${surplus.toLocaleString()}</span></div>
      <div><span class="rl">ブラインド報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子 (所持金/5, 上限5): </span><span class="rv">$${interest}</span></div>`;
  if (goldBonus > 0) html += `<div><span class="rl">黄金の楔ボーナス: </span><span class="rv">$${goldBonus}</span></div>`;
  if (greedyBonus > 0) html += `<div><span class="rl">強欲の壺ボーナス: </span><span class="rv">$${greedyBonus}</span></div>`;
  html += `
      <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
        <span class="rl">合計報酬: </span><span class="rv">$${total}</span>
      </div>
    </div>
    <button class="btn" id="btn-to-shop">ショップへ</button>`;
  document.getElementById('result-content').innerHTML = html;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function overrunPenalty() {
  // Penalty: surplus score and bonus money confiscated, forced to next round with bad board
  S.score = S.scoreAtTarget; // revert to target score
  S.inputLocked = true;

  const interest = Math.min(Math.floor(S.money / 5), 5);
  const total = S.reward + interest; // no bonus
  S.money += total;

  let html = `
    <div class="result-title" style="color:var(--fail)">PENALTY</div>
    <div class="penalty-banner">欲張りの代償 — 余剰スコアとボーナス資金を没収！</div>
    <div class="result-box">
      <div><span class="rl">スコア（目標分のみ）: </span><span class="rv">${S.score.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
      <div><span class="rl">ブラインド報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子: </span><span class="rv">$${interest}</span></div>
      <div><span class="rl" style="color:var(--fail)">ボーナス没収: </span><span style="color:var(--fail)">$0</span></div>
      <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:5px">
        <span class="rl">合計報酬: </span><span class="rv">$${total}</span>
      </div>
    </div>
    <button class="btn" id="btn-to-shop">ショップへ（盤面引き継ぎ）</button>`;
  document.getElementById('result-content').innerHTML = html;
  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function advanceBlind() {
  S.blindIdx++;
  if (S.blindIdx > 2) { S.blindIdx = 0; S.ante++; if (S.ante > MAX_ANTE) { showWin(); return; } }
  showShop();
}

function gameOver(reason) {
  showScreen('gameover');
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-stats').innerHTML = `
    <div>ANTE: ${S.ante} / ${MAX_ANTE}</div>
    <div>スコア: ${S.score.toLocaleString()} / ${S.target.toLocaleString()}</div>
    <div>所持金: $${S.money}</div>`;
}

function showWin() {
  showScreen('win');
  document.getElementById('win-stats').innerHTML = `
    <div>全 ${MAX_ANTE} ANTE クリア！</div>
    <div>最終所持金: $${S.money}</div>
    <div>アーティファクト: ${S.artifacts.map(a => a.name).join(', ') || 'なし'}</div>`;
}

// ============================================================
//  ITEM USAGE & TARGETING
// ============================================================
function useItem(idx) {
  if (S.inputLocked || S.targeting) return;
  const itemId = S.items[idx];
  const def = ITEM_DEFS[itemId];

  if (def.target === 'none') {
    switch (itemId) {
      case 'tectonicShift':
        for (let r=0; r<SIZE; r++) for (let c=0; c<SIZE; c++) {
          if (S.board[r][c]===BLACK) S.board[r][c]=WHITE;
          else if (S.board[r][c]===WHITE) S.board[r][c]=BLACK;
        }
        break;
      case 'forceThrough': S.forceThroughActive = true; break;
    }
    S.items.splice(idx, 1);
    renderBoard(null, null); renderItems(); updateUI();
    return;
  }

  // Whiteout: multi-select
  if (itemId === 'whiteout') {
    S.targeting = { itemIdx: idx, itemId, maxSelect: def.maxSelect };
    S.selectedCells = [];
    document.getElementById('target-overlay').classList.remove('hidden');
    document.getElementById('target-msg').textContent = `黒石を最大${def.maxSelect}つ選択（クリックで選択、Enterで確定）`;
    renderBoard(null, null);
  }
}

function handleTargetClick(r, c) {
  if (!S.targeting || S.targeting.itemId !== 'whiteout') return;
  if (S.board[r][c] !== BLACK) return;
  const key = `${r},${c}`;
  const idx = S.selectedCells.findIndex(s => s.key === key);
  if (idx >= 0) S.selectedCells.splice(idx, 1);
  else if (S.selectedCells.length < S.targeting.maxSelect) S.selectedCells.push({ r, c, key });
  document.getElementById('target-msg').textContent =
    `黒石を選択中 (${S.selectedCells.length}/${S.targeting.maxSelect}) — Enterで確定`;
}

function confirmTargeting() {
  if (!S.targeting) return;
  for (const { r, c } of S.selectedCells) S.board[r][c] = WHITE;
  S.items.splice(S.targeting.itemIdx, 1);
  S.targeting = null; S.selectedCells = [];
  document.getElementById('target-overlay').classList.add('hidden');
  renderBoard(null, null); renderItems(); updateUI();
}

function cancelTargeting() {
  S.targeting = null; S.selectedCells = [];
  document.getElementById('target-overlay').classList.add('hidden');
  renderBoard(null, null);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.targeting) cancelTargeting();
  if (e.key === 'Enter' && S.targeting) confirmTargeting();
});

// ============================================================
//  BLIND SELECT
// ============================================================
function getAILevel(ante, blindIdx) {
  let lv = ante <= 3 ? 1 : ante <= 6 ? 2 : 3;
  if (blindIdx === 2) lv = Math.min(lv + 1, 3);
  return lv;
}

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
    const lv = getAILevel(S.ante, i);
    const card = document.createElement('div');
    card.className = `blind-card${i === 2 ? ' boss' : ''}`;
    card.innerHTML = `
      <div class="b-name">${t.name} BLIND</div>
      <div class="b-target">${target.toLocaleString()}</div>
      <div class="b-reward">報酬: $${t.reward}</div>
      <div class="b-boss">ENEMY ${AI_NAMES[lv]}</div>`;
    card.addEventListener('click', () => startPuzzle(i, target, t.reward, lv));
    container.appendChild(card);
  }
}

// ============================================================
//  PUZZLE PHASE
// ============================================================
function startPuzzle(blindIdx, target, reward, aiLevel) {
  S.blindIdx = blindIdx;
  S.target = target;
  S.reward = reward;
  S.aiLevel = aiLevel;
  S.score = 0;
  S.inputLocked = false;
  S.forceThroughActive = false;
  S.targeting = null;
  S.selectedCells = [];
  S.overrunning = false;
  S.scoreAtTarget = 0;

  const hasAnyStone = S.board.some(row => row.some(v => v !== EMPTY));
  if (!hasAnyStone) initBoard();

  showScreen('puzzle');
  setTurnBanner('YOUR TURN', 'player');
  document.getElementById('goal-banner').classList.add('hidden');
  renderBoard(null, null);
  renderArtifacts();
  renderItems();
  updateUI();
  document.getElementById('calc-display').classList.add('hidden');
  document.getElementById('target-overlay').classList.add('hidden');

  // Bind round clear button
  document.getElementById('btn-round-clear').onclick = roundClearManual;
}

// ============================================================
//  SHOP
// ============================================================
function showShop() {
  showScreen('shop');
  document.getElementById('shop-money').textContent = `$${S.money}`;
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  const ownedIds = S.artifacts.map(a => a.id);
  const availArts = Object.keys(ARTIFACT_DEFS).filter(id => !ownedIds.includes(id));
  shuffle(availArts);

  const allOffered = [
    ...availArts.slice(0, 3).map(id => ({ def: ARTIFACT_DEFS[id], category: 'artifact' })),
    ...shuffle(Object.keys(ITEM_DEFS)).slice(0, 2).map(id => ({ def: ITEM_DEFS[id], category: 'consumable' })),
  ];

  allOffered.forEach(({ def, category }) => {
    const el = document.createElement('div');
    el.className = 'shop-item';
    const nc = category === 'consumable' ? 'si-name consumable' : 'si-name';
    el.innerHTML = `
      <div class="si-type">${category === 'artifact' ? 'ARTIFACT' : 'CONSUMABLE'}</div>
      <div class="${nc}">${def.name}</div>
      <div class="si-desc">${def.desc}</div>
      <div class="si-price">$${def.price}</div>`;
    el.addEventListener('click', () => {
      if (el.classList.contains('sold')) return;
      if (S.money < def.price) return;
      if (category === 'artifact') {
        if (S.artifacts.length >= MAX_ARTIFACTS) return;
        S.artifacts.push({ ...def, scalingValue: def.scalingValue || 0 });
      } else {
        if (S.items.length >= MAX_ITEMS) return;
        S.items.push(def.id);
      }
      S.money -= def.price;
      el.classList.add('sold');
      el.querySelector('.si-price').textContent = 'SOLD';
      document.getElementById('shop-money').textContent = `$${S.money}`;
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
  S.board = emptyBoard();
  S.aiLevel = 1; S.forceThroughActive = false;
  S.targeting = null; S.selectedCells = [];
  S.overrunning = false; S.scoreAtTarget = 0;
}

document.getElementById('btn-start').addEventListener('click', () => { initGame(); showBlindSelect(); });
document.getElementById('btn-next-round').addEventListener('click', showBlindSelect);
document.getElementById('btn-retry').addEventListener('click', () => { initGame(); showBlindSelect(); });
document.getElementById('btn-win-retry').addEventListener('click', () => { initGame(); showBlindSelect(); });

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
