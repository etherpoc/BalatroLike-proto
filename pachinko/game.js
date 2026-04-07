/* ================================================================
   パチンコ × バラトロライク — game.js
   Matter.js 物理演算 + ローグライク・スコアアタック
   ================================================================ */
'use strict';

// Matter.js aliases
const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector, Mouse, World } = Matter;

// ── Constants ──────────────────────────────────────────────
const BOARD_W = 420;
const BOARD_H = 600;
const PIN_RADIUS = 5;
const BALL_RADIUS = 8;
const POCKET_COUNT = 5;
const PIN_ROWS = 10;
const PIN_COLS = 11;
const PIN_SPACING_X = 36;
const PIN_SPACING_Y = 42;
const PIN_OFFSET_X = (BOARD_W - (PIN_COLS - 1) * PIN_SPACING_X) / 2;
const PIN_OFFSET_Y = 100;
const DROP_ZONE_Y = 30;
const POCKET_Y = BOARD_H - 40;
const POCKET_H = 40;
const WALL_THICKNESS = 20;

const CATEGORY_BALL = 0x0001;
const CATEGORY_PIN  = 0x0002;
const CATEGORY_WALL = 0x0004;
const CATEGORY_POCKET = 0x0008;

// ── Sound (Web Audio API) ─────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

function playTone(freq, duration, type = 'sine', vol = 0.08) {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfxPinHit(isRed) {
  playTone(isRed ? 880 : 1200, 0.08, 'sine', 0.06);
}
function sfxPocketIn() {
  playTone(523, 0.1, 'square', 0.07);
  setTimeout(() => playTone(784, 0.15, 'square', 0.07), 80);
  setTimeout(() => playTone(1047, 0.2, 'square', 0.07), 180);
}
function sfxDrop() {
  playTone(220, 0.12, 'triangle', 0.05);
}
function sfxWallBounce() {
  playTone(300, 0.06, 'sawtooth', 0.04);
}
function sfxBuy() {
  playTone(660, 0.08, 'sine', 0.06);
  setTimeout(() => playTone(880, 0.12, 'sine', 0.06), 60);
}

// BGM — looping ambient drone
let bgmOsc1 = null, bgmOsc2 = null, bgmGain = null;
function startBGM() {
  ensureAudio();
  if (bgmGain) return;
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.02;
  bgmGain.connect(audioCtx.destination);
  bgmOsc1 = audioCtx.createOscillator();
  bgmOsc1.type = 'sine';
  bgmOsc1.frequency.value = 55;
  bgmOsc1.connect(bgmGain);
  bgmOsc1.start();
  bgmOsc2 = audioCtx.createOscillator();
  bgmOsc2.type = 'sine';
  bgmOsc2.frequency.value = 82.5;
  bgmOsc2.connect(bgmGain);
  bgmOsc2.start();
}

// ── Game State ─────────────────────────────────────────────
const state = {
  ante: 1,
  round: 1,
  money: 4,
  score: 0,
  target: 0,
  balls: 0,
  maxBalls: 5,
  dropping: false,
  activeBall: null,
  currentChips: 0,
  currentMult: 0,
  hitCount: 0,
  wallHitCount: 0,
  artifacts: [],       // max 5
  consumables: [],     // max 2
  pins: [],            // { body, type:'blue'|'red', mods:[] }
  pockets: [],         // { body, chips, mult, label }
  goalReached: false,
  phase: 'title',      // title | blind | play | shop | gameover | win
};

// ── Ante / Blind Config ────────────────────────────────────
const BLINDS = [
  { name: 'SMALL BLIND', mult: 1.0, reward: 3 },
  { name: 'BIG BLIND',   mult: 1.5, reward: 4 },
  { name: 'BOSS BLIND',  mult: 2.5, reward: 6 },
];
function baseTarget(ante) { return 300 + ante * 500; }

// ── Artifact Definitions ───────────────────────────────────
const ARTIFACT_DEFS = [
  { id:'low_gravity',  name:'低重力空間',       desc:'落下速度-50%。バウンド増加', category:'物理介入',
    onApply(eng){ eng.gravity.y = 0.5; }, onRemove(eng){ eng.gravity.y = 1; } },
  { id:'bumper',       name:'バンパー',         desc:'ランダム3本が弾き返しピンに', category:'物理介入' },
  { id:'pinball_wiz',  name:'ピンボール・ウィザード', desc:'30回以上衝突で最終倍率×3', category:'乗算' },
  { id:'wall_bound',   name:'ウォール・バウンド', desc:'壁衝突ごとに倍率+2.0', category:'条件' },
  { id:'black_hole',   name:'ブラックホール',   desc:'1ポケット×0、他ポケット×2', category:'ギャンブル' },
];

// ── Consumable Definitions ─────────────────────────────────
const CONSUMABLE_DEFS = [
  { id:'add_pin',      name:'ピンの打ち込み', desc:'空きスペースにピンを1本追加', action:'place_pin' },
  { id:'convert_red',  name:'属性付与（赤）', desc:'青ピンを赤ピンに変換', action:'convert_red' },
  { id:'glass_pin',    name:'ガラスのピン',   desc:'ピンをガラス化。×2だが30%で破壊', action:'glass_pin' },
  { id:'magnetize',    name:'磁力化',        desc:'ピンを磁石に。ボールを引き寄せる', action:'magnetize' },
];

// ── Matter.js Setup ────────────────────────────────────────
let engine, render, runner;
const canvas = document.getElementById('board-canvas');

function initPhysics() {
  engine = Engine.create({ gravity: { x: 0, y: 1 } });
  render = Render.create({
    canvas,
    engine,
    options: {
      width: BOARD_W,
      height: BOARD_H,
      wireframes: false,
      background: '#050505',
      pixelRatio: window.devicePixelRatio || 1,
    },
  });
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  canvas.style.width = BOARD_W + 'px';
  canvas.style.height = BOARD_H + 'px';
  runner = Runner.create();

  // Walls
  const wallOpts = { isStatic: true, render: { fillStyle: '#111' }, label: 'wall',
    collisionFilter: { category: CATEGORY_WALL } };
  Composite.add(engine.world, [
    Bodies.rectangle(BOARD_W / 2, -WALL_THICKNESS / 2, BOARD_W + WALL_THICKNESS * 2, WALL_THICKNESS, wallOpts),               // top
    Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_H / 2, WALL_THICKNESS, BOARD_H, wallOpts),                                     // left
    Bodies.rectangle(BOARD_W + WALL_THICKNESS / 2, BOARD_H / 2, WALL_THICKNESS, BOARD_H, wallOpts),                            // right
  ]);

  // Collision events
  Events.on(engine, 'collisionStart', onCollision);

  Render.run(render);
  Runner.run(runner, engine);
}

// ── Pin Management ─────────────────────────────────────────
function createPin(x, y, type) {
  const isBumper = type === 'bumper';
  const body = Bodies.circle(x, y, PIN_RADIUS, {
    isStatic: true,
    restitution: isBumper ? 2.0 : 0.5,
    label: 'pin',
    render: { fillStyle: pinColor(type) },
    collisionFilter: { category: CATEGORY_PIN },
  });
  const pin = { body, type, mods: [], x, y };
  body._pinRef = pin;
  Composite.add(engine.world, body);
  state.pins.push(pin);
  return pin;
}

function pinColor(type, mods) {
  if (type === 'bumper') return '#ffaa00';
  if (mods && mods.includes('glass')) return '#ffffff';
  if (mods && mods.includes('magnet')) return '#ff44ff';
  if (type === 'red') return '#ff4466';
  return '#44aaff';
}

function updatePinVisual(pin) {
  pin.body.render.fillStyle = pinColor(pin.type, pin.mods);
}

function buildPinBoard() {
  // Clear old pins
  state.pins.forEach(p => Composite.remove(engine.world, p.body));
  state.pins.length = 0;

  for (let row = 0; row < PIN_ROWS; row++) {
    const cols = row % 2 === 0 ? PIN_COLS : PIN_COLS - 1;
    const offsetX = row % 2 === 0 ? PIN_OFFSET_X : PIN_OFFSET_X + PIN_SPACING_X / 2;
    for (let col = 0; col < cols; col++) {
      const x = offsetX + col * PIN_SPACING_X;
      const y = PIN_OFFSET_Y + row * PIN_SPACING_Y;
      // ~15% red pins
      const type = Math.random() < 0.15 ? 'red' : 'blue';
      createPin(x, y, type);
    }
  }
}

// ── Pocket Management ──────────────────────────────────────
function buildPockets() {
  state.pockets.forEach(p => Composite.remove(engine.world, p.body));
  state.pockets.length = 0;

  const pocketW = BOARD_W / POCKET_COUNT;
  const pocketConfigs = [
    { chips: 10, mult: 1.0 },
    { chips: 20, mult: 1.5 },
    { chips: 50, mult: 3.0 },
    { chips: 20, mult: 1.5 },
    { chips: 10, mult: 1.0 },
  ];

  // Apply black hole artifact
  const hasBlackHole = state.artifacts.some(a => a.id === 'black_hole');
  let blackHoleIdx = -1;
  if (hasBlackHole) {
    blackHoleIdx = Math.floor(Math.random() * POCKET_COUNT);
  }

  for (let i = 0; i < POCKET_COUNT; i++) {
    const x = pocketW / 2 + i * pocketW;
    const body = Bodies.rectangle(x, POCKET_Y + POCKET_H / 2, pocketW - 4, POCKET_H, {
      isStatic: true,
      isSensor: true,
      label: 'pocket',
      render: { fillStyle: 'transparent' },
      collisionFilter: { category: CATEGORY_POCKET },
    });

    let cfg = { ...pocketConfigs[i] };
    if (hasBlackHole) {
      if (i === blackHoleIdx) {
        cfg.mult = 0;
        cfg.label = '×0';
      } else {
        cfg.mult *= 2;
      }
    }

    cfg.label = cfg.label || `×${cfg.mult}`;
    body._pocketRef = { idx: i, ...cfg };
    Composite.add(engine.world, body);
    state.pockets.push({ body, ...cfg });
  }

  // Divider walls between pockets
  for (let i = 1; i < POCKET_COUNT; i++) {
    const divider = Bodies.rectangle(i * pocketW, POCKET_Y + POCKET_H / 2, 3, POCKET_H, {
      isStatic: true, render: { fillStyle: '#333' }, label: 'divider',
    });
    Composite.add(engine.world, divider);
  }

  // Bottom wall (below pockets, to catch anything that slips)
  const bottom = Bodies.rectangle(BOARD_W / 2, BOARD_H + 10, BOARD_W + 40, 20, {
    isStatic: true, isSensor: true, label: 'bottom_catch', render: { visible: false },
  });
  Composite.add(engine.world, bottom);
}

// ── Apply Artifacts to Board ───────────────────────────────
function applyArtifacts() {
  // Reset gravity
  engine.gravity.y = 1;

  state.artifacts.forEach(art => {
    if (art.id === 'low_gravity') {
      engine.gravity.y = 0.5;
    }
    if (art.id === 'bumper') {
      // Convert 3 random blue pins to bumper
      const blues = state.pins.filter(p => p.type === 'blue' && !p.mods.includes('bumper_converted'));
      const shuffled = blues.sort(() => Math.random() - 0.5).slice(0, 3);
      shuffled.forEach(p => {
        p.type = 'bumper';
        p.mods.push('bumper_converted');
        p.body.restitution = 2.0;
        updatePinVisual(p);
      });
    }
  });
}

// ── Collision Handler ──────────────────────────────────────
function onCollision(event) {
  event.pairs.forEach(pair => {
    const a = pair.bodyA;
    const b = pair.bodyB;
    const ball = a.label === 'ball' ? a : b.label === 'ball' ? b : null;
    const other = ball === a ? b : a;
    if (!ball || !state.dropping) return;

    if (other.label === 'pin' && other._pinRef) {
      handlePinHit(other._pinRef, ball);
    } else if (other.label === 'wall') {
      handleWallHit();
    } else if (other.label === 'pocket' && other._pocketRef) {
      handlePocketIn(other._pocketRef);
    } else if (other.label === 'bottom_catch') {
      // Failsafe: if ball misses all pockets
      handlePocketIn({ chips: 5, mult: 0.5, idx: -1 });
    }
  });
}

function handlePinHit(pin, ballBody) {
  state.hitCount++;
  const isRed = pin.type === 'red';
  const isGlass = pin.mods.includes('glass');
  const isBumper = pin.type === 'bumper';

  if (isRed) {
    state.currentMult += 1.0;
  } else if (isBumper) {
    state.currentChips += 15;
    // Bounce upward
    Body.setVelocity(ballBody, { x: ballBody.velocity.x, y: -Math.abs(ballBody.velocity.y) * 1.5 });
  } else {
    state.currentChips += 10;
  }

  if (isGlass) {
    state.currentMult *= 2;
    if (Math.random() < 0.3) {
      // Shatter
      Composite.remove(engine.world, pin.body);
      const idx = state.pins.indexOf(pin);
      if (idx >= 0) state.pins.splice(idx, 1);
    }
  }

  // Magnet effect — slight attraction
  if (pin.mods.includes('magnet')) {
    const dx = pin.x - ballBody.position.x;
    const dy = pin.y - ballBody.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      Body.applyForce(ballBody, ballBody.position, {
        x: dx / dist * 0.0005,
        y: dy / dist * 0.0005,
      });
    }
  }

  sfxPinHit(isRed);
  updateCalcDisplay();

  // Visual flash on pin
  const orig = pin.body.render.fillStyle;
  pin.body.render.fillStyle = '#ffffff';
  setTimeout(() => { if (pin.body) pin.body.render.fillStyle = orig; }, 60);
}

function handleWallHit() {
  state.wallHitCount++;
  sfxWallBounce();
  if (state.artifacts.some(a => a.id === 'wall_bound')) {
    state.currentMult += 2.0;
    updateCalcDisplay();
  }
}

function handlePocketIn(pocketRef) {
  if (!state.dropping) return;
  state.dropping = false;

  const totalChips = pocketRef.chips + state.currentChips;
  const totalMult = pocketRef.mult + state.currentMult;

  // Artifact multiplier
  let artMult = 1;
  if (state.artifacts.some(a => a.id === 'pinball_wiz') && state.hitCount >= 30) {
    artMult *= 3;
  }

  const earned = Math.floor(totalChips * totalMult * artMult);
  state.score += earned;

  sfxPocketIn();

  // Remove ball
  if (state.activeBall) {
    Composite.remove(engine.world, state.activeBall);
    state.activeBall = null;
  }

  // Show result flash
  showResultFlash(totalChips, totalMult, artMult, earned);

  // Check goal
  if (state.score >= state.target && !state.goalReached) {
    state.goalReached = true;
    document.getElementById('goal-banner').classList.remove('hidden');
  }

  // Check balls remaining
  if (state.balls <= 0 && !state.goalReached) {
    setTimeout(() => showScreen('gameover', `スコア ${fmtNum(state.score)} / 目標 ${fmtNum(state.target)}`), 1200);
  }

  updateUI();
}

function showResultFlash(chips, mult, artMult, earned) {
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = fmtNum(chips);
  document.getElementById('calc-mult').textContent = mult.toFixed(1) + (artMult > 1 ? `×${artMult}` : '');
  document.getElementById('calc-result').textContent = fmtNum(earned);
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ── Ball Drop ──────────────────────────────────────────────
function dropBall(x) {
  if (state.dropping || state.balls <= 0) return;
  state.dropping = true;
  state.balls--;
  state.currentChips = 0;
  state.currentMult = 0;
  state.hitCount = 0;
  state.wallHitCount = 0;

  const ball = Bodies.circle(x, DROP_ZONE_Y, BALL_RADIUS, {
    restitution: 0.5,
    friction: 0.05,
    density: 0.002,
    label: 'ball',
    render: { fillStyle: '#ffffff' },
    collisionFilter: { category: CATEGORY_BALL },
  });
  state.activeBall = ball;
  Composite.add(engine.world, ball);
  sfxDrop();
  updateCalcDisplay();
  updateUI();

  // Safety timeout — if ball gets stuck
  setTimeout(() => {
    if (state.dropping && state.activeBall === ball) {
      handlePocketIn({ chips: 5, mult: 0.5, idx: -1 });
    }
  }, 15000);
}

// ── Magnet attraction (per-tick) ───────────────────────────
Events.on && (function setupMagnetTick() {
  // Will be set up after engine is created
})();

function setupMagnetEffect() {
  Events.on(engine, 'beforeUpdate', () => {
    if (!state.activeBall || !state.dropping) return;
    const ball = state.activeBall;
    state.pins.forEach(pin => {
      if (!pin.mods.includes('magnet')) return;
      const dx = pin.x - ball.position.x;
      const dy = pin.y - ball.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 3600 && distSq > 1) { // within 60px
        const dist = Math.sqrt(distSq);
        Body.applyForce(ball, ball.position, {
          x: dx / dist * 0.00003,
          y: dy / dist * 0.00003,
        });
      }
    });
  });
}

// ── Canvas Click ───────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  if (state.phase !== 'play') return;

  // If using a consumable that needs pin selection
  if (state.pendingConsumable) {
    handleConsumableClick(e);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (y < PIN_OFFSET_Y - 20) {
    // ランダムな横ブレ（±40px）を加えて狙い撃ちを防ぐ
    const jitter = (Math.random() - 0.5) * 80;
    const dropX = Math.max(BALL_RADIUS + 5, Math.min(BOARD_W - BALL_RADIUS - 5, x + jitter));
    dropBall(dropX);
  }
});

// ── Consumable Usage ───────────────────────────────────────
state.pendingConsumable = null;

function useConsumable(idx) {
  const item = state.consumables[idx];
  if (!item) return;

  if (item.action === 'place_pin') {
    state.pendingConsumable = { idx, action: 'place_pin' };
    document.getElementById('drop-hint').textContent = '盤面をクリックしてピンを配置';
  } else if (item.action === 'convert_red' || item.action === 'glass_pin' || item.action === 'magnetize') {
    state.pendingConsumable = { idx, action: item.action };
    document.getElementById('drop-hint').textContent = 'ピンをクリックして選択';
  }
}

function handleConsumableClick(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const pending = state.pendingConsumable;

  if (pending.action === 'place_pin') {
    // Check not too close to existing pins
    const tooClose = state.pins.some(p => {
      const dx = p.x - x, dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < PIN_SPACING_X * 0.6;
    });
    if (!tooClose && y > PIN_OFFSET_Y - 20 && y < POCKET_Y - 20) {
      createPin(x, y, 'blue');
      finishConsumable(pending.idx);
    }
    return;
  }

  // Find nearest pin
  let nearest = null, bestDist = 30;
  state.pins.forEach(p => {
    const dx = p.x - x, dy = p.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) { bestDist = d; nearest = p; }
  });

  if (!nearest) return;

  if (pending.action === 'convert_red' && nearest.type === 'blue') {
    nearest.type = 'red';
    updatePinVisual(nearest);
    finishConsumable(pending.idx);
  } else if (pending.action === 'glass_pin') {
    nearest.mods.push('glass');
    updatePinVisual(nearest);
    finishConsumable(pending.idx);
  } else if (pending.action === 'magnetize') {
    nearest.mods.push('magnet');
    updatePinVisual(nearest);
    finishConsumable(pending.idx);
  }
}

function finishConsumable(idx) {
  state.consumables.splice(idx, 1);
  state.pendingConsumable = null;
  document.getElementById('drop-hint').textContent = '盤面上部をクリックしてボールを投下（±40pxブレあり）';
  renderSlots();
  sfxBuy();
}

// ── Custom Render (pocket labels, drop zone) ───────────────
function setupCustomRender() {
  Events.on(render, 'afterRender', () => {
    const ctx = render.context;

    // Drop zone indicator
    ctx.save();
    ctx.strokeStyle = 'rgba(255,102,0,0.3)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, PIN_OFFSET_Y - 25);
    ctx.lineTo(BOARD_W, PIN_OFFSET_Y - 25);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,102,0,0.15)';
    ctx.fillRect(0, 0, BOARD_W, PIN_OFFSET_Y - 25);
    ctx.restore();

    // Drop zone text
    ctx.save();
    ctx.font = '9px JetBrains Mono';
    ctx.fillStyle = 'rgba(255,102,0,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('▼ DROP ZONE ▼', BOARD_W / 2, PIN_OFFSET_Y - 35);
    ctx.restore();

    // Pocket labels
    const pocketW = BOARD_W / POCKET_COUNT;
    ctx.save();
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    state.pockets.forEach((p, i) => {
      const px = pocketW / 2 + i * pocketW;
      // Pocket background
      const isCenter = i === 2;
      const alpha = isCenter ? 0.15 : 0.06;
      ctx.fillStyle = p.mult === 0
        ? 'rgba(255,0,0,0.15)'
        : `rgba(255,102,0,${alpha})`;
      ctx.fillRect(i * pocketW + 2, POCKET_Y, pocketW - 4, POCKET_H);

      // Label
      ctx.fillStyle = p.mult === 0 ? '#ff4444' : (isCenter ? '#ff6600' : '#666');
      ctx.fillText(`×${p.mult.toFixed(1)}`, px, POCKET_Y + 16);
      ctx.font = '8px JetBrains Mono';
      ctx.fillStyle = '#444';
      ctx.fillText(`+${p.chips}`, px, POCKET_Y + 30);
      ctx.font = '11px JetBrains Mono';
    });
    ctx.restore();

    // Ball trail glow
    if (state.activeBall && state.dropping) {
      const pos = state.activeBall.position;
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 20);
      gradient.addColorStop(0, 'rgba(255,255,255,0.3)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pin glow effects
    state.pins.forEach(pin => {
      const pos = pin.body.position;
      let glowColor;
      if (pin.type === 'red') glowColor = 'rgba(255,68,102,0.2)';
      else if (pin.type === 'bumper') glowColor = 'rgba(255,170,0,0.25)';
      else if (pin.mods.includes('glass')) glowColor = 'rgba(255,255,255,0.3)';
      else if (pin.mods.includes('magnet')) glowColor = 'rgba(255,68,255,0.25)';
      else glowColor = 'rgba(68,170,255,0.12)';

      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 12);
      g.addColorStop(0, glowColor);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

// ── UI Updates ─────────────────────────────────────────────
function updateUI() {
  document.getElementById('ui-target').textContent = fmtNum(state.target);
  document.getElementById('ui-score').textContent = fmtNum(state.score);
  document.getElementById('ui-money').textContent = `$${state.money}`;
  document.getElementById('ui-balls').textContent = state.balls;
}

function updateCalcDisplay() {
  document.getElementById('calc-chips').textContent = fmtNum(state.currentChips);
  document.getElementById('calc-mult').textContent = state.currentMult.toFixed(1);
  const est = state.currentChips * Math.max(state.currentMult, 0.1);
  document.getElementById('calc-result').textContent = fmtNum(Math.floor(est));
}

function renderSlots() {
  // Artifacts
  const artEl = document.getElementById('ui-artifacts');
  artEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const art = state.artifacts[i];
    const div = document.createElement('div');
    div.className = art ? 'art-slot' : 'art-slot empty';
    div.innerHTML = art
      ? `<div class="a-name">${art.name}</div><div class="a-desc">${art.desc}</div>`
      : '<span>—</span>';
    artEl.appendChild(div);
  }

  // Consumables
  const itemEl = document.getElementById('ui-items');
  itemEl.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const item = state.consumables[i];
    const div = document.createElement('div');
    div.className = item ? 'item-slot' : 'item-slot empty';
    div.innerHTML = item
      ? `<div class="i-name">${item.name}</div><div class="i-desc">${item.desc}</div>`
      : '<span>—</span>';
    if (item) {
      div.addEventListener('click', () => {
        if (!state.dropping) useConsumable(i);
      });
    }
    itemEl.appendChild(div);
  }
}

function fmtNum(n) { return n.toLocaleString('en-US'); }

// ── Screen Management ──────────────────────────────────────
function showScreen(name, extraData) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  state.phase = name;

  switch (name) {
    case 'title':
      document.getElementById('screen-title').classList.add('active');
      break;

    case 'blind':
      document.getElementById('screen-blind').classList.add('active');
      renderBlindSelect();
      break;

    case 'play':
      document.getElementById('screen-puzzle').classList.add('active');
      document.getElementById('goal-banner').classList.add('hidden');
      state.goalReached = false;
      updateUI();
      renderSlots();
      break;

    case 'shop':
      document.getElementById('screen-shop').classList.add('active');
      renderShop();
      break;

    case 'gameover':
      document.getElementById('screen-gameover').classList.add('active');
      document.getElementById('gameover-reason').textContent = extraData || '';
      document.getElementById('gameover-stats').innerHTML =
        `<div>Ante: ${state.ante} | Round: ${state.round}</div>` +
        `<div>最終スコア: ${fmtNum(state.score)}</div>`;
      break;

    case 'win':
      document.getElementById('screen-win').classList.add('active');
      document.getElementById('win-stats').innerHTML =
        `<div>全8アンティをクリア！</div><div>最終スコア: ${fmtNum(state.score)}</div>`;
      break;
  }
}

// ── Blind Selection ────────────────────────────────────────
function renderBlindSelect() {
  document.getElementById('ante-display').textContent = `ANTE ${state.ante}`;
  const container = document.getElementById('blind-cards');
  container.innerHTML = '';

  BLINDS.forEach((blind, i) => {
    const target = Math.floor(baseTarget(state.ante) * blind.mult);
    const card = document.createElement('div');
    card.className = 'blind-card';
    card.innerHTML = `
      <div class="b-name">${blind.name}</div>
      <div class="b-target">${fmtNum(target)}</div>
      <div class="b-reward">報酬: $${blind.reward}</div>
    `;
    card.addEventListener('click', () => startRound(blind, target));
    container.appendChild(card);
  });
}

// ── Round Start ────────────────────────────────────────────
function startRound(blind, target) {
  state.target = target;
  state.score = 0;
  state.balls = state.maxBalls;
  state.currentBlind = blind;

  // Clear physics world and rebuild
  Composite.clear(engine.world, false);

  // Re-add walls
  const wallOpts = { isStatic: true, render: { fillStyle: '#111' }, label: 'wall',
    collisionFilter: { category: CATEGORY_WALL } };
  Composite.add(engine.world, [
    Bodies.rectangle(BOARD_W / 2, -WALL_THICKNESS / 2, BOARD_W + WALL_THICKNESS * 2, WALL_THICKNESS, wallOpts),
    Bodies.rectangle(-WALL_THICKNESS / 2, BOARD_H / 2, WALL_THICKNESS, BOARD_H, wallOpts),
    Bodies.rectangle(BOARD_W + WALL_THICKNESS / 2, BOARD_H / 2, WALL_THICKNESS, BOARD_H, wallOpts),
  ]);

  if (state.round === 1 && state.ante === 1) {
    buildPinBoard();
  } else {
    // Re-add existing pins to world
    state.pins.forEach(p => Composite.add(engine.world, p.body));
  }

  buildPockets();
  applyArtifacts();
  showScreen('play');
}

// ── Round Clear ────────────────────────────────────────────
function roundClear() {
  const reward = state.currentBlind.reward;
  // Bonus money for remaining balls
  const ballBonus = state.balls;
  state.money += reward + ballBonus;
  state.round++;

  // Check win condition (ante 8 boss blind cleared)
  if (state.round > 3) {
    state.round = 1;
    state.ante++;
    if (state.ante > 8) {
      showScreen('win');
      return;
    }
  }

  showScreen('shop');
}

// ── Shop ───────────────────────────────────────────────────
function renderShop() {
  document.getElementById('shop-money').textContent = `$${state.money}`;
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  // Generate shop items: 2 artifacts + 2 consumables
  const availableArts = ARTIFACT_DEFS.filter(a => !state.artifacts.some(sa => sa.id === a.id));
  const shopArts = shuffle(availableArts).slice(0, 2);
  const shopCons = shuffle([...CONSUMABLE_DEFS]).slice(0, 2);

  shopArts.forEach(art => {
    const price = 4 + Math.floor(Math.random() * 4);
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <div class="si-type">ARTIFACT</div>
      <div class="si-name">${art.name}</div>
      <div class="si-desc">${art.desc}</div>
      <div class="si-price">$${price}</div>
    `;
    div.addEventListener('click', () => {
      if (div.classList.contains('sold')) return;
      if (state.money < price) return;
      if (state.artifacts.length >= 5) return;
      state.money -= price;
      state.artifacts.push({ ...art });
      div.classList.add('sold');
      document.getElementById('shop-money').textContent = `$${state.money}`;
      sfxBuy();
    });
    container.appendChild(div);
  });

  shopCons.forEach(con => {
    const price = 2 + Math.floor(Math.random() * 3);
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <div class="si-type">CONSUMABLE</div>
      <div class="si-name consumable">${con.name}</div>
      <div class="si-desc">${con.desc}</div>
      <div class="si-price">$${price}</div>
    `;
    div.addEventListener('click', () => {
      if (div.classList.contains('sold')) return;
      if (state.money < price) return;
      if (state.consumables.length >= 2) return;
      state.money -= price;
      state.consumables.push({ ...con });
      div.classList.add('sold');
      document.getElementById('shop-money').textContent = `$${state.money}`;
      sfxBuy();
    });
    container.appendChild(div);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Init & Event Bindings ──────────────────────────────────
function resetGame() {
  state.ante = 1;
  state.round = 1;
  state.money = 4;
  state.score = 0;
  state.target = 0;
  state.balls = 0;
  state.maxBalls = 5;
  state.dropping = false;
  state.activeBall = null;
  state.currentChips = 0;
  state.currentMult = 0;
  state.hitCount = 0;
  state.wallHitCount = 0;
  state.artifacts = [];
  state.consumables = [];
  state.pins = [];
  state.pockets = [];
  state.goalReached = false;
  state.pendingConsumable = null;
}

document.getElementById('btn-start').addEventListener('click', () => {
  startBGM();
  resetGame();
  initPhysics();
  setupCustomRender();
  setupMagnetEffect();
  showScreen('blind');
});

document.getElementById('btn-round-clear').addEventListener('click', () => {
  roundClear();
});

document.getElementById('btn-next-round').addEventListener('click', () => {
  showScreen('blind');
});

document.getElementById('btn-retry').addEventListener('click', () => {
  resetGame();
  // Re-init physics
  if (runner) Runner.stop(runner);
  if (render) Render.stop(render);
  initPhysics();
  setupCustomRender();
  setupMagnetEffect();
  showScreen('blind');
});

document.getElementById('btn-win-retry').addEventListener('click', () => {
  resetGame();
  if (runner) Runner.stop(runner);
  if (render) Render.stop(render);
  initPhysics();
  setupCustomRender();
  setupMagnetEffect();
  showScreen('blind');
});

// Start on title
showScreen('title');
