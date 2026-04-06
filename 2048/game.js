// ============================================================
//  2048 × バラトロライク プロトタイプ v4
// ============================================================

const SIZE = 4;
const MAX_ANTE = 8;
const MAX_ARTIFACTS = 5;
const MAX_ITEMS = 2;

// ============================================================
//  TILE: { value: number, mod: null|'glass'|'gold' }
// ============================================================
function T(value, mod) { return { value: value || 0, mod: mod || null }; }
function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => T(0)));
}
function cloneGrid(g) { return g.map(r => r.map(t => T(t.value, t.mod))); }

// ============================================================
//  ARTIFACT DEFINITIONS
// ============================================================
const ARTIFACT_DEFS = {
  // --- v3 originals ---
  wallPlay: {
    id: 'wallPlay', name: '壁際の攻防', cat: 'condBuff',
    desc: '外周で合体時 倍率+3', price: 5,
  },
  evenAesthetics: {
    id: 'evenAesthetics', name: '偶数の美学', cat: 'condBuff',
    desc: '16以上のタイル完成時 チップ+30', price: 5,
  },
  chainReaction: {
    id: 'chainReaction', name: '連鎖反応', cat: 'multiply',
    desc: '2組以上同時合体で 最終倍率×2', price: 7,
  },
  lastStand: {
    id: 'lastStand', name: '背水の陣', cat: 'multiply',
    desc: '空きマス3つ以下で合体時 最終倍率×2', price: 7,
  },
  purify: {
    id: 'purify', name: '浄化の力', cat: 'scaling',
    desc: '「2」を消すたびチップ永続+5', price: 6,
    scalingValue: 0,
  },
  achiever: {
    id: 'achiever', name: '到達者', cat: 'scaling',
    desc: '64以上タイル作成ごとに永続倍率+0.3', price: 6,
    scalingValue: 0,
  },
  // --- v4 combo artifacts ---
  metronome: {
    id: 'metronome', name: 'メトロノーム', cat: 'combo',
    desc: 'コンボ5以上で 最終倍率×2', price: 7,
  },
  cushion: {
    id: 'cushion', name: '緩衝材', cat: 'combo',
    desc: '空振り1回だけコンボ維持（3スライド後再発動）', price: 5,
    cooldown: 0,
  },
  comboEater: {
    id: 'comboEater', name: 'コンボ・イーター', cat: 'combo',
    desc: 'コンボリセット時 コンボ数×100スコア獲得', price: 6,
  },
  euphoria: {
    id: 'euphoria', name: '高揚感', cat: 'combo',
    desc: 'コンボ上昇ごとにラウンド中チップ+1', price: 5,
    scalingValue: 0,
  },
  echo: {
    id: 'echo', name: '残響', cat: 'combo',
    desc: 'コンボリセット時 次スライドはコンボ半分を維持', price: 5,
  },
  comboMaster: {
    id: 'comboMaster', name: '連撃の極意', cat: 'combo',
    desc: 'コンボ偶数の時 倍率加算が2倍', price: 6,
  },
  fanaticCrowd: {
    id: 'fanaticCrowd', name: '熱狂的な観客', cat: 'combo',
    desc: 'コンボ10超で生成タイルが必ず「4」に', price: 5,
  },
  precisionMachine: {
    id: 'precisionMachine', name: '精密機械', cat: 'tech',
    desc: '4方向すべてで合体成功すると$10獲得', price: 6,
  },
};

// ============================================================
//  CONSUMABLE DEFINITIONS
// ============================================================
const ITEM_DEFS = {
  // --- v3 originals ---
  delete: {
    id: 'delete', name: 'デリート', price: 4,
    desc: '任意タイルを1つ消滅', target: 'single',
  },
  swap: {
    id: 'swap', name: 'スワップ', price: 4,
    desc: '2つのタイルの位置を交換', target: 'two',
  },
  fission: {
    id: 'fission', name: 'フィッション', price: 5,
    desc: 'タイルを半分×2に分割', target: 'single',
  },
  scoreBoost: {
    id: 'scoreBoost', name: 'スコアブースト', price: 6,
    desc: '次の1スライドのスコア×10', target: 'none',
  },
  rewrite4: {
    id: 'rewrite4', name: 'タイル変換', price: 3,
    desc: '指定タイルを「4」に書き換え', target: 'single',
  },
  // --- v4 combo consumables ---
  freezeCombo: {
    id: 'freezeCombo', name: 'フリーズ・コンボ', price: 4,
    desc: '次の3スライド コンボリセット無効', target: 'none',
  },
  jumpStart: {
    id: 'jumpStart', name: 'ジャンプ・スタート', price: 3,
    desc: 'コンボ数を即座に+3', target: 'none',
  },
};

// ============================================================
//  BOSS BLIND DEFINITIONS
// ============================================================
const BOSS_DEFS = [
  { id: 'gravity', name: '重力異常', desc: '上方向にスライド不可' },
  { id: 'silence', name: '沈黙', desc: '「4」の合体ではスコアが入らない' },
  { id: 'noEdge', name: '中央集権', desc: '外周での合体ではスコアが入らない' },
];

// ---- Target scores ----
const ANTE_BASE = [300, 800, 1500, 2800, 5000, 8000, 12000, 18000];

// ============================================================
//  GAME STATE
// ============================================================
const S = {
  grid: [],
  ante: 1,
  blindIdx: 0,
  money: 4,
  artifacts: [],
  items: [],
  score: 0,
  target: 0,
  reward: 0,
  bossEffect: null,
  inputLocked: false,
  // Consumable flags
  scoreBoostActive: false,
  freezeComboLeft: 0,       // remaining slides of freeze
  // Combo system
  combo: 0,
  echoCombo: 0,             // stored from 残響 on reset
  // Precision machine tracking (4-direction merge)
  dirMerged: { left: false, right: false, up: false, down: false },
  // Targeting state
  targeting: null,
};

// ============================================================
//  SCREEN MANAGEMENT
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${id}`).classList.add('active');
}

// ============================================================
//  2048 CORE ENGINE
// ============================================================
function spawnTile(grid) {
  const empty = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c].value === 0) empty.push([r, c]);
  if (empty.length === 0) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];

  // 熱狂的な観客: combo>10 → always 4
  const hasFanatic = hasArtifact('fanaticCrowd');
  let val;
  if (hasFanatic && S.combo > 10) {
    val = 4;
  } else {
    val = Math.random() < 0.9 ? 2 : 4;
  }
  grid[r][c] = T(val);
  return [r, c];
}

function slideRow(row) {
  const filtered = row.filter(t => t.value !== 0);
  const result = [];
  const merges = [];
  const consumed = [];
  let i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i].value === filtered[i + 1].value) {
      const newVal = filtered[i].value * 2;
      let newMod = filtered[i].mod || filtered[i + 1].mod || null;
      result.push(T(newVal, newMod));
      merges.push(result.length - 1);
      consumed.push(filtered[i], filtered[i + 1]);
      i += 2;
    } else {
      result.push(T(filtered[i].value, filtered[i].mod));
      i++;
    }
  }
  while (result.length < SIZE) result.push(T(0));
  return { result, merges, consumed };
}

function rotate(grid, n) {
  let g = cloneGrid(grid);
  for (let t = 0; t < ((n % 4 + 4) % 4); t++) {
    const ng = emptyGrid();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        ng[c][SIZE - 1 - r] = T(g[r][c].value, g[r][c].mod);
    g = ng;
  }
  return g;
}

function executeMove(grid, dir) {
  const rotations = { left: 0, down: 1, right: 2, up: 3 };
  const rot = rotations[dir];
  let g = rotate(grid, rot);

  let moved = false;
  const mergeEvents = [];
  const allConsumed = [];

  for (let r = 0; r < SIZE; r++) {
    const { result, merges, consumed } = slideRow(g[r]);
    if (result.some((t, i) => t.value !== g[r][i].value)) moved = true;
    g[r] = result;
    for (const ci of merges) {
      mergeEvents.push({ value: result[ci].value, mod: result[ci].mod, row: r, col: ci });
    }
    allConsumed.push(...consumed);
  }

  if (!moved) return null;

  g = rotate(g, (4 - rot) % 4);
  for (const ev of mergeEvents) {
    let pr = ev.row, pc = ev.col;
    for (let t = 0; t < (4 - rot) % 4; t++) {
      const nr = pc, nc = SIZE - 1 - pr;
      pr = nr; pc = nc;
    }
    ev.row = pr; ev.col = pc;
  }

  return { grid: g, mergeEvents, consumed: allConsumed };
}

function canMove(grid) {
  for (const dir of ['left', 'right', 'up', 'down']) {
    if (executeMove(grid, dir)) return true;
  }
  return false;
}

function countEmpty(grid) {
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c].value === 0) n++;
  return n;
}

function isEdge(r, c) {
  return r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1;
}

function hasArtifact(id) {
  return S.artifacts.some(a => a.id === id);
}
function getArtifact(id) {
  return S.artifacts.find(a => a.id === id);
}

// ============================================================
//  GLASS TILE SHATTER
// ============================================================
function processGlassTiles(mergeEvents) {
  const shattered = [];
  for (const ev of mergeEvents) {
    if (ev.mod === 'glass' && Math.random() < 0.3) {
      shattered.push({ row: ev.row, col: ev.col });
      S.grid[ev.row][ev.col] = T(0);
    }
  }
  return shattered;
}

// ============================================================
//  GOLD TILE BONUS
// ============================================================
function countGoldTiles() {
  let n = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (S.grid[r][c].mod === 'gold') n++;
  return n;
}

// ============================================================
//  COMBO SYSTEM
// ============================================================
function updateCombo(hasMerge) {
  if (hasMerge) {
    // Apply echo combo (残響) from previous reset
    if (S.echoCombo > 0) {
      S.combo = S.echoCombo;
      S.echoCombo = 0;
    }
    S.combo++;

    // 高揚感: combo上昇ごとにラウンド中チップ+1
    const euphoria = getArtifact('euphoria');
    if (euphoria) euphoria.scalingValue++;

    // 緩衝材 cooldown tick
    const cushion = getArtifact('cushion');
    if (cushion && cushion.cooldown > 0) cushion.cooldown--;

  } else {
    // Miss (no merge) — combo reset logic
    let resetBlocked = false;

    // フリーズ・コンボ
    if (S.freezeComboLeft > 0) {
      S.freezeComboLeft--;
      resetBlocked = true;
    }

    // 緩衝材: 1回だけ空振りを無効化
    if (!resetBlocked) {
      const cushion = getArtifact('cushion');
      if (cushion && cushion.cooldown <= 0) {
        cushion.cooldown = 3;
        resetBlocked = true;
      }
    }

    if (!resetBlocked && S.combo > 0) {
      // コンボ・イーター: リセット時 combo×100スコア
      if (hasArtifact('comboEater')) {
        const bonus = S.combo * 100;
        S.score += bonus;
      }

      // 残響: 次スライドにコンボ半分を維持
      if (hasArtifact('echo')) {
        S.echoCombo = Math.floor(S.combo / 2);
      }

      S.combo = 0;
    }
  }

  // フリーズ tick (on merge slides too)
  if (hasMerge && S.freezeComboLeft > 0) {
    S.freezeComboLeft--;
  }
}

// ============================================================
//  SCORE CALCULATION
// ============================================================
function calcSlideScore(mergeEvents, consumed) {
  if (mergeEvents.length === 0) return null;

  let chips = 0;
  let addMult = 0;
  let mulMult = 1;
  let baseMult = 1;

  // Base chips
  for (const ev of mergeEvents) chips += ev.value;

  // Boss effects
  if (S.bossEffect && S.bossEffect.id === 'silence') {
    chips -= mergeEvents.filter(ev => ev.value === 4).reduce((s, ev) => s + ev.value, 0);
  }
  if (S.bossEffect && S.bossEffect.id === 'noEdge') {
    chips -= mergeEvents.filter(ev => isEdge(ev.row, ev.col)).reduce((s, ev) => s + ev.value, 0);
  }
  chips = Math.max(chips, 0);

  // --- Combo bonus ---
  let comboMult = S.combo * 0.2;

  // 連撃の極意: コンボ偶数 → コンボ倍率加算2倍
  if (hasArtifact('comboMaster') && S.combo % 2 === 0 && S.combo > 0) {
    comboMult *= 2;
  }

  addMult += comboMult;

  // --- Artifact effects ---
  for (const art of S.artifacts) {
    switch (art.id) {
      case 'wallPlay':
        for (const ev of mergeEvents) {
          if (isEdge(ev.row, ev.col)) addMult += 3;
        }
        break;
      case 'evenAesthetics':
        for (const ev of mergeEvents) {
          if (ev.value >= 16) chips += 30;
        }
        break;
      case 'chainReaction':
        if (mergeEvents.length >= 2) mulMult *= 2;
        break;
      case 'lastStand':
        if (countEmpty(S.grid) <= 3) mulMult *= 2;
        break;
      case 'purify':
        for (const t of consumed) {
          if (t.value === 2) art.scalingValue += 5;
        }
        chips += art.scalingValue;
        break;
      case 'achiever':
        for (const ev of mergeEvents) {
          if (ev.value >= 64) art.scalingValue += 0.3;
        }
        addMult += art.scalingValue;
        break;
      case 'euphoria':
        chips += art.scalingValue;
        break;
      case 'metronome':
        if (S.combo >= 5) mulMult *= 2;
        break;
    }
  }

  // Glass tile bonus
  for (const ev of mergeEvents) {
    if (ev.mod === 'glass') mulMult *= 2;
  }

  const totalMult = (baseMult + addMult) * mulMult;
  let total = Math.floor(chips * totalMult);

  // Score boost
  if (S.scoreBoostActive) {
    total *= 10;
    S.scoreBoostActive = false;
  }

  return { chips, baseMult, addMult, mulMult, totalMult, total, comboMult };
}

// ============================================================
//  RENDERING
// ============================================================
function renderBoard(mergedCells, spawnedCell, shatteredCells) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const targeting = S.targeting !== null;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = S.grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';

      if (tile.value === 0) {
        cell.classList.add('empty');
      } else {
        cell.classList.add(`t${Math.min(tile.value, 2048)}`);
        cell.textContent = tile.value;
        if (tile.mod === 'glass') cell.classList.add('mod-glass');
        if (tile.mod === 'gold') cell.classList.add('mod-gold');
        if (mergedCells && mergedCells.some(m => m.row === r && m.col === c)) cell.classList.add('merged');
        if (spawnedCell && spawnedCell[0] === r && spawnedCell[1] === c) cell.classList.add('spawned');
        if (shatteredCells && shatteredCells.some(s => s.row === r && s.col === c)) cell.classList.add('shatter');
      }

      if (targeting) {
        const t = S.targeting;
        const clickable =
          (t.itemId === 'swap' && tile.value !== 0) ||
          (t.itemId === 'fission' && tile.value >= 4) ||
          (t.itemId !== 'swap' && t.itemId !== 'fission' && tile.value !== 0);
        if (clickable) {
          cell.classList.add('clickable');
          cell.addEventListener('click', () => handleTargetClick(r, c));
        }
      }

      boardEl.appendChild(cell);
    }
  }
}

function updateUI() {
  document.getElementById('ui-target').textContent = S.target.toLocaleString();
  document.getElementById('ui-score').textContent = S.score.toLocaleString();
  document.getElementById('ui-money').textContent = `$${S.money}`;
  updateComboMeter();
}

function updateComboMeter() {
  const el = document.getElementById('combo-meter');
  const numEl = document.getElementById('combo-num');
  numEl.textContent = S.combo;

  // Visual intensity
  el.classList.remove('hot', 'fire', 'inferno');
  if (S.combo >= 10) el.classList.add('inferno');
  else if (S.combo >= 5) el.classList.add('fire');
  else if (S.combo >= 2) el.classList.add('hot');

  // Freeze indicator
  const freezeEl = document.getElementById('combo-freeze');
  if (S.freezeComboLeft > 0) {
    freezeEl.textContent = `FREEZE ${S.freezeComboLeft}`;
    freezeEl.classList.remove('hidden');
  } else {
    freezeEl.classList.add('hidden');
  }
}

function flashCalc(chips, totalMult, total) {
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = chips;
  document.getElementById('calc-mult').textContent =
    totalMult % 1 === 0 ? totalMult : totalMult.toFixed(1);
  document.getElementById('calc-result').textContent = `+${total.toLocaleString()}`;
  el.classList.remove('hidden');
  el.classList.remove('flash');
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
      if ((art.cat === 'scaling' || art.id === 'euphoria') && art.scalingValue > 0) {
        const label = (art.id === 'purify' || art.id === 'euphoria')
          ? `+${art.scalingValue} chips` : `+${art.scalingValue.toFixed(1)} mult`;
        html += `<div class="a-scaling">${label}</div>`;
      }
      slot.innerHTML = html;
    } else {
      slot.className = 'art-slot empty';
      slot.textContent = '—';
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
      slot.className = 'item-slot empty';
      slot.textContent = '—';
    }
    el.appendChild(slot);
  }
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
      case 'scoreBoost': S.scoreBoostActive = true; break;
      case 'freezeCombo': S.freezeComboLeft += 3; break;
      case 'jumpStart': S.combo += 3; break;
    }
    S.items.splice(idx, 1);
    renderItems();
    updateUI();
    return;
  }

  S.targeting = { itemIdx: idx, itemId, phase: 1, firstCell: null };
  document.getElementById('target-overlay').classList.remove('hidden');
  updateTargetMsg();
  renderBoard(null, null, null);
}

function updateTargetMsg() {
  const t = S.targeting;
  if (!t) return;
  const msgs = {
    delete: 'タイルをクリックして消滅',
    swap: t.phase === 1 ? '1つ目のタイルを選択' : '2つ目のタイルを選択（交換先）',
    fission: 'タイル(4以上)を選択して分割',
    rewrite4: 'タイルを選択して「4」に変換',
  };
  document.getElementById('target-msg').textContent = msgs[t.itemId] || '';
}

function handleTargetClick(r, c) {
  const t = S.targeting;
  if (!t) return;

  switch (t.itemId) {
    case 'delete':
      S.grid[r][c] = T(0);
      finishTargeting();
      break;
    case 'rewrite4':
      S.grid[r][c] = T(4, S.grid[r][c].mod);
      finishTargeting();
      break;
    case 'fission': {
      const tile = S.grid[r][c];
      if (tile.value < 4) return;
      const half = tile.value / 2;
      S.grid[r][c] = T(half, tile.mod);
      const empty = [];
      for (let rr = 0; rr < SIZE; rr++)
        for (let cc = 0; cc < SIZE; cc++)
          if (S.grid[rr][cc].value === 0) empty.push([rr, cc]);
      if (empty.length > 0) {
        const [er, ec] = empty[Math.floor(Math.random() * empty.length)];
        S.grid[er][ec] = T(half);
      }
      finishTargeting();
      break;
    }
    case 'swap':
      if (t.phase === 1) {
        t.firstCell = [r, c];
        t.phase = 2;
        updateTargetMsg();
        renderBoard(null, null, null);
      } else {
        const [r1, c1] = t.firstCell;
        const tmp = S.grid[r1][c1];
        S.grid[r1][c1] = S.grid[r][c];
        S.grid[r][c] = tmp;
        finishTargeting();
      }
      break;
  }
}

function finishTargeting() {
  S.items.splice(S.targeting.itemIdx, 1);
  S.targeting = null;
  document.getElementById('target-overlay').classList.add('hidden');
  renderBoard(null, null, null);
  renderItems();
}

function cancelTargeting() {
  S.targeting = null;
  document.getElementById('target-overlay').classList.add('hidden');
  renderBoard(null, null, null);
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
    { name: 'SMALL', mult: 1, reward: 3, isBoss: false },
    { name: 'BIG', mult: 1.5, reward: 4, isBoss: false },
    { name: 'BOSS', mult: 2, reward: 6, isBoss: true },
  ];

  const boss = BOSS_DEFS[(S.ante - 1) % BOSS_DEFS.length];

  for (let i = S.blindIdx; i < types.length; i++) {
    const t = types[i];
    const target = Math.floor(ANTE_BASE[S.ante - 1] * t.mult);
    const card = document.createElement('div');
    card.className = `blind-card${t.isBoss ? ' boss' : ''}`;
    card.innerHTML = `
      <div class="b-name">${t.name} BLIND</div>
      <div class="b-target">${target.toLocaleString()}</div>
      <div class="b-reward">報酬: $${t.reward}</div>
      <div class="b-boss">${t.isBoss ? boss.name + ' — ' + boss.desc : ''}</div>
    `;
    card.addEventListener('click', () => startPuzzle(i, target, t.reward, t.isBoss ? boss : null));
    container.appendChild(card);
  }
}

// ============================================================
//  PUZZLE PHASE
// ============================================================
function startPuzzle(blindIdx, target, reward, boss) {
  S.blindIdx = blindIdx;
  S.target = target;
  S.reward = reward;
  S.bossEffect = boss;
  S.score = 0;
  S.inputLocked = false;
  S.scoreBoostActive = false;
  S.freezeComboLeft = 0;
  S.targeting = null;
  S.combo = 0;
  S.echoCombo = 0;
  S.dirMerged = { left: false, right: false, up: false, down: false };

  // Reset per-round scaling (高揚感)
  const euphoria = getArtifact('euphoria');
  if (euphoria) euphoria.scalingValue = 0;

  // Fresh board if empty
  const hasAnyTile = S.grid.some(row => row.some(t => t.value !== 0));
  if (!hasAnyTile) {
    spawnTile(S.grid);
    spawnTile(S.grid);
  }

  showScreen('puzzle');

  const banner = document.getElementById('boss-banner');
  if (boss) {
    banner.textContent = `BOSS: ${boss.name} — ${boss.desc}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  renderBoard(null, null, null);
  renderArtifacts();
  renderItems();
  updateUI();
  document.getElementById('calc-display').classList.add('hidden');
  document.getElementById('target-overlay').classList.add('hidden');
}

function handleMove(dir) {
  if (S.inputLocked || S.targeting) return;

  // Boss: gravity — block up
  if (S.bossEffect && S.bossEffect.id === 'gravity' && dir === 'up') return;

  const result = executeMove(S.grid, dir);
  if (!result) return;

  S.grid = result.grid;
  const hasMerge = result.mergeEvents.length > 0;

  // Update combo BEFORE score calc so combo is current
  updateCombo(hasMerge);

  // Track direction for 精密機械
  if (hasMerge) {
    S.dirMerged[dir] = true;
    // Check if all 4 directions achieved
    if (hasArtifact('precisionMachine') &&
        S.dirMerged.left && S.dirMerged.right && S.dirMerged.up && S.dirMerged.down) {
      S.money += 10;
      S.dirMerged = { left: false, right: false, up: false, down: false };
    }
  }

  // Score
  const sc = calcSlideScore(result.mergeEvents, result.consumed);

  // Glass shatter
  const shattered = processGlassTiles(result.mergeEvents);

  // Spawn
  const spawned = spawnTile(S.grid);

  renderBoard(result.mergeEvents, spawned, shattered);
  renderArtifacts();

  if (sc && sc.total > 0) {
    S.score += sc.total;
    flashCalc(sc.chips, sc.totalMult, sc.total);
  }
  updateUI();

  S.inputLocked = true;
  setTimeout(() => {
    S.inputLocked = false;
    if (S.score >= S.target) {
      roundClear();
      return;
    }
    if (!canMove(S.grid)) {
      gameOver('盤面が詰まってしまった...');
    }
  }, 180);
}

// ============================================================
//  ROUND END / GAME OVER
// ============================================================
function roundClear() {
  const interest = Math.min(Math.floor(S.money / 5), 5);
  const goldBonus = countGoldTiles() * 3;
  const total = S.reward + interest + goldBonus;
  S.money += total;

  const el = document.getElementById('result-content');
  let html = `
    <div class="result-title clear">CLEAR!</div>
    <div class="result-box">
      <div><span class="rl">スコア: </span><span class="rv">${S.score.toLocaleString()} / ${S.target.toLocaleString()}</span></div>
      <div><span class="rl">ブラインド報酬: </span><span class="rv">$${S.reward}</span></div>
      <div><span class="rl">利子 (所持金/5, 上限5): </span><span class="rv">$${interest}</span></div>`;
  if (goldBonus > 0) {
    html += `<div><span class="rl">黄金タイルボーナス: </span><span class="rv">$${goldBonus}</span></div>`;
  }
  html += `
      <div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px">
        <span class="rl">合計報酬: </span><span class="rv">$${total}</span>
      </div>
    </div>
    <button class="btn" id="btn-to-shop">ショップへ</button>`;
  el.innerHTML = html;

  showScreen('result');
  document.getElementById('btn-to-shop').addEventListener('click', advanceBlind);
}

function advanceBlind() {
  S.blindIdx++;
  if (S.blindIdx > 2) {
    S.blindIdx = 0;
    S.ante++;
    if (S.ante > MAX_ANTE) { showWin(); return; }
  }
  showShop();
}

function gameOver(reason) {
  showScreen('gameover');
  document.getElementById('gameover-reason').textContent = reason;
  document.getElementById('gameover-stats').innerHTML = `
    <div>ANTE: ${S.ante} / ${MAX_ANTE}</div>
    <div>スコア: ${S.score.toLocaleString()} / ${S.target.toLocaleString()}</div>
    <div>所持金: $${S.money}</div>
  `;
}

function showWin() {
  showScreen('win');
  document.getElementById('win-stats').innerHTML = `
    <div>全 ${MAX_ANTE} ANTE クリア！</div>
    <div>最終所持金: $${S.money}</div>
    <div>アーティファクト: ${S.artifacts.map(a => a.name).join(', ') || 'なし'}</div>
  `;
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
  const offeredArts = availArts.slice(0, 3);

  const availItems = Object.keys(ITEM_DEFS);
  shuffle(availItems);
  const offeredItems = availItems.slice(0, 2);

  const allOffered = [
    ...offeredArts.map(id => ({ def: ARTIFACT_DEFS[id], category: 'artifact' })),
    ...offeredItems.map(id => ({ def: ITEM_DEFS[id], category: 'consumable' })),
  ];

  allOffered.forEach(({ def, category }) => {
    const el = document.createElement('div');
    el.className = 'shop-item';
    const nameClass = category === 'consumable' ? 'si-name consumable' : 'si-name';
    el.innerHTML = `
      <div class="si-type">${category === 'artifact' ? 'ARTIFACT' : 'CONSUMABLE'}</div>
      <div class="${nameClass}">${def.name}</div>
      <div class="si-desc">${def.desc}</div>
      <div class="si-price">$${def.price}</div>
    `;
    el.addEventListener('click', () => {
      if (el.classList.contains('sold')) return;
      if (S.money < def.price) return;

      if (category === 'artifact') {
        if (S.artifacts.length >= MAX_ARTIFACTS) return;
        S.artifacts.push({ ...def, scalingValue: def.scalingValue || 0, cooldown: def.cooldown || 0 });
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
//  INPUT
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.targeting) {
    cancelTargeting();
    return;
  }

  const map = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
  };
  const dir = map[e.key];
  if (dir && document.getElementById('screen-puzzle').classList.contains('active')) {
    e.preventDefault();
    handleMove(dir);
  }
});

let touchStart = null;
document.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});
document.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
  const dir = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  if (document.getElementById('screen-puzzle').classList.contains('active')) {
    handleMove(dir);
  }
});

// ============================================================
//  INIT
// ============================================================
function initGame() {
  S.ante = 1;
  S.blindIdx = 0;
  S.money = 4;
  S.artifacts = [];
  S.items = [];
  S.grid = emptyGrid();
  S.bossEffect = null;
  S.scoreBoostActive = false;
  S.freezeComboLeft = 0;
  S.combo = 0;
  S.echoCombo = 0;
  S.targeting = null;
  S.dirMerged = { left: false, right: false, up: false, down: false };
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
