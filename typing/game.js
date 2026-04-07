/* ================================================================
   タイピング × バラトロライク — game.js
   ターミナル風タイピング + ローグライク・スコアアタック
   ================================================================ */
'use strict';

// ── Sound (Web Audio API) ─────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

function playTone(freq, dur, type = 'sine', vol = 0.08) {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
}

// Mechanical keyboard click sounds
function sfxKeyPress() {
  const freq = 3000 + Math.random() * 2000;
  ensureAudio();
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.03, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.15));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = 0.06;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 2;
  src.connect(filter).connect(g).connect(audioCtx.destination);
  src.start();
}
function sfxTypo()   { playTone(200, 0.12, 'sawtooth', 0.06); }
function sfxScore()  { playTone(523, 0.1, 'square', 0.06); setTimeout(() => playTone(784, 0.12, 'square', 0.06), 60); setTimeout(() => playTone(1047, 0.15, 'square', 0.06), 140); }
function sfxBuy()    { playTone(660, 0.08, 'sine', 0.06); setTimeout(() => playTone(880, 0.12, 'sine', 0.06), 60); }
function sfxSelect() { playTone(880, 0.06, 'sine', 0.04); }

// BGM
let bgmGain = null;
function startBGM() {
  ensureAudio();
  if (bgmGain) return;
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.012;
  bgmGain.connect(audioCtx.destination);
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'sine'; osc1.frequency.value = 55;
  osc1.connect(bgmGain); osc1.start();
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine'; osc2.frequency.value = 82.5;
  osc2.connect(bgmGain); osc2.start();
}

// ── Word Pool ──────────────────────────────────────────────
const WORD_POOL = [
  'algorithm','function','variable','pointer','callback','syntax','binary',
  'compile','runtime','buffer','overflow','kernel','thread','socket',
  'protocol','encrypt','decrypt','hashmap','iterate','boolean',
  'integer','string','object','module','import','export','async',
  'promise','method','class','interface','struct','queue','stack',
  'debug','deploy','server','client','proxy','router','cache',
  'query','index','schema','table','column','insert','delete',
  'update','select','trigger','cursor','malloc','realloc','printf',
  'scanf','typedef','extern','inline','volatile','register',
  'switch','default','return','continue','break','while','const',
  'static','public','private','abstract','virtual','override',
  'lambda','closure','factory','builder','adapter','bridge',
  'command','facade','proxy','chain','state','visitor','flyweight',
  'docker','nginx','redis','kafka','graphql','webpack','typescript',
  'python','golang','kotlin','swift','flutter','django','express',
  'quantum','neural','tensor','matrix','vector','scalar','gradient',
  'entropy','cipher','token','session','cookie','header','payload',
  'sudo','chmod','grep','pipe','fork','exec','signal',
  'mutex','atomic','barrier','channel','goroutine','coroutine',
  'regex','parser','lexer','compiler','linker','loader','garbage',
  'refactor','optimize','benchmark','profile','memory','latency',
  'throughput','bandwidth','serialize','marshal','unmarshal',
  'vulnerability','injection','exploit','payload','shellcode',
  'SYSTEM_CALL','NULL_POINTER','SEGFAULT','DEADLOCK','RACE_CONDITION',
  'BUFFER_OVERFLOW','STACK_TRACE','HEAP_DUMP','CORE_DUMP',
];

// ── Key Chip Values (Scrabble-inspired) ────────────────────
const BASE_KEY_CHIPS = {
  A:2, B:8, C:6, D:5, E:2, F:8, G:6, H:5, I:2, J:20, K:12, L:4, M:6,
  N:4, O:2, P:6, Q:20, R:4, S:4, T:4, U:2, V:10, W:10, X:20, Y:8, Z:20,
};

const HOME_ROW = new Set(['A','S','D','F','G','H','J','K','L']);
const VOWELS = new Set(['A','E','I','O','U']);

// ── Artifact Definitions ───────────────────────────────────
const ARTIFACT_DEFS = [
  { id:'home_pos',    name:'ホームポジション',   desc:'A,S,D,F,G,H,J,K,Lで倍率+1.0', category:'配列' },
  { id:'mechanical',  name:'メカニカル・スイッチ', desc:'ノーミスで最終倍率×2', category:'技術' },
  { id:'vowel_rebel', name:'母音の反逆',         desc:'A,E,I,O,Uのチップが+20に', category:'文字' },
  { id:'camel_case',  name:'キャメルケース',     desc:'大小混合単語で倍率+5.0', category:'条件' },
  { id:'blind_touch', name:'ブラインドタッチ',   desc:'入力文字が*で隠れる。全スコア×3', category:'狂気' },
];

// ── Consumable Definitions ─────────────────────────────────
const CONSUMABLE_DEFS = [
  { id:'gold_keycap', name:'金メッキのキートップ', desc:'指定キーを打つたび$1獲得', action:'gold' },
  { id:'glass_keycap',name:'ガラスのキートップ',   desc:'指定キーで倍率×2。30%で故障', action:'glass' },
  { id:'regex',       name:'正規表現（RegEx）',    desc:'単語リストをリロード', action:'reload' },
];

// ── Game State ─────────────────────────────────────────────
const state = {
  ante: 1, round: 1, money: 4,
  score: 0, target: 0,
  hands: 0, maxHands: 6,
  phase: 'title',
  words: [],           // { text, completed }
  selectedWordIdx: -1,
  typingActive: false,
  typedChars: [],      // array of { char, correct }
  cursorPos: 0,
  typoCount: 0,
  typingStartTime: 0,
  artifacts: [],       // max 5
  consumables: [],     // max 2
  keyMods: {},         // { 'A': { gold:bool, glass:bool, broken:bool, bonusMult:number } }
  goalReached: false,
  pendingConsumable: null,
};

// ── Ante / Blind Config ────────────────────────────────────
const BLINDS = [
  { name: 'SMALL BLIND', mult: 1.0, reward: 3 },
  { name: 'BIG BLIND',   mult: 1.5, reward: 4 },
  { name: 'BOSS BLIND',  mult: 2.5, reward: 6 },
];
function baseTarget(ante) { return 200 + ante * 350; }

// ── Utility ────────────────────────────────────────────────
function fmtNum(n) { return n.toLocaleString('en-US'); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getKeyChips(key) {
  const K = key.toUpperCase();
  let base = BASE_KEY_CHIPS[K] || 2;
  if (state.artifacts.some(a => a.id === 'vowel_rebel') && VOWELS.has(K)) {
    base = 20;
  }
  return base;
}

function getKeyMod(key) {
  return state.keyMods[key.toUpperCase()] || {};
}

// ── Generate Word List ─────────────────────────────────────
function generateWordList() {
  state.words = shuffle(WORD_POOL).slice(0, 10).map(w => ({ text: w, completed: false }));
  state.selectedWordIdx = -1;
  state.typingActive = false;
  state.typedChars = [];
  state.cursorPos = 0;
}

// ── Word Selection ─────────────────────────────────────────
function selectWord(idx) {
  if (state.words[idx].completed) return;
  if (state.typingActive) return;
  state.selectedWordIdx = idx;
  sfxSelect();
  renderAll();
}

function startTyping() {
  if (state.selectedWordIdx < 0) return;
  state.typingActive = true;
  state.typedChars = [];
  state.cursorPos = 0;
  state.typoCount = 0;
  state.typingStartTime = performance.now();
  renderAll();
}

// ── Typing Input Handler ───────────────────────────────────
function handleKeyDown(e) {
  if (state.phase !== 'play') return;

  // Consumable: selecting a key for gold/glass keycap
  if (state.pendingConsumable) {
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      applyKeycap(e.key.toUpperCase());
      e.preventDefault();
    }
    return;
  }

  if (!state.typingActive) {
    // Select word by typing first character
    if (state.selectedWordIdx >= 0 && e.key.length === 1) {
      startTyping();
      // Fall through to handle this keypress
    } else {
      return;
    }
  }

  if (e.key === 'Escape') {
    // Cancel current word
    state.typingActive = false;
    state.selectedWordIdx = -1;
    renderAll();
    return;
  }

  if (e.key.length !== 1) return;
  e.preventDefault();

  const word = state.words[state.selectedWordIdx].text;
  const expectedChar = word[state.cursorPos];
  const typedChar = e.key;
  const K = typedChar.toUpperCase();

  // Check if key is broken
  const mod = getKeyMod(K);
  if (mod.broken) {
    sfxTypo();
    addLog(`[ERR] Key "${K}" is broken!`, 'fail');
    return;
  }

  const correct = typedChar === expectedChar ||
    typedChar.toLowerCase() === expectedChar.toLowerCase();

  sfxKeyPress();

  state.typedChars.push({ char: typedChar, correct });
  if (correct) {
    state.cursorPos++;

    // Gold keycap: earn money
    if (mod.gold) {
      state.money++;
    }

    // Glass keycap: risk breaking
    if (mod.glass && Math.random() < 0.3) {
      state.keyMods[K] = { ...mod, broken: true };
      addLog(`[WARN] Key "${K}" shattered!`, 'fail');
    }
  } else {
    state.typoCount++;
    sfxTypo();
  }

  // Check if word complete
  if (state.cursorPos >= word.length) {
    completeWord();
  }

  renderAll();
}

function completeWord() {
  const word = state.words[state.selectedWordIdx];
  word.completed = true;
  state.typingActive = false;
  state.hands--;

  // Calculate score
  const text = word.text;
  const elapsed = (performance.now() - state.typingStartTime) / 1000; // seconds
  const wpm = Math.round((text.length / 5) / (elapsed / 60));

  let totalChips = 0;
  let totalMult = 0;

  // Base mult from word length
  totalMult += 1.0 + Math.max(0, text.length - 3) * 0.5;

  // Per-character chips and mult
  for (const ch of text) {
    const K = ch.toUpperCase();
    if (/[A-Z]/.test(K)) {
      totalChips += getKeyChips(K);

      // Key-specific bonus mult (from shop upgrades)
      const mod = getKeyMod(K);
      if (mod.bonusMult) totalMult += mod.bonusMult;

      // Artifact: home_pos
      if (state.artifacts.some(a => a.id === 'home_pos') && HOME_ROW.has(K)) {
        totalMult += 1.0;
      }
    } else {
      // Non-alpha chars (underscore etc.) — small chip bonus
      totalChips += 3;
    }
  }

  // WPM bonus
  let wpmBonus = 0;
  if (wpm >= 200) wpmBonus = 5.0;
  else if (wpm >= 150) wpmBonus = 3.0;
  else if (wpm >= 100) wpmBonus = 2.0;
  else if (wpm >= 60) wpmBonus = 1.0;
  totalMult += wpmBonus;

  // Artifact: mechanical (no typos = ×2)
  let artMult = 1;
  if (state.artifacts.some(a => a.id === 'mechanical') && state.typoCount === 0) {
    artMult *= 2;
  }

  // Artifact: camel_case (mixed case word)
  if (state.artifacts.some(a => a.id === 'camel_case')) {
    const hasUpper = /[A-Z]/.test(text);
    const hasLower = /[a-z]/.test(text);
    if (hasUpper && hasLower) {
      totalMult += 5.0;
    }
  }

  // Artifact: blind_touch (×3 all)
  if (state.artifacts.some(a => a.id === 'blind_touch')) {
    artMult *= 3;
  }

  // Typo penalty
  if (state.typoCount > 0) {
    totalMult = Math.max(totalMult * (1 - state.typoCount * 0.1), 0.5);
  }

  const earned = Math.floor(totalChips * totalMult * artMult);
  state.score += earned;

  sfxScore();

  // Log output (hacker-style)
  addLog(`[OK] Word completed: "${text}"`, 'ok');
  addLog(`[OK] Chips: ${totalChips} × Mult: ${totalMult.toFixed(1)}${artMult > 1 ? ' ×' + artMult : ''} = ${fmtNum(earned)}`, 'ok');
  addLog(`[OK] WPM: ${wpm} | Typos: ${state.typoCount}`, wpm >= 100 ? 'ok' : 'fail');

  // Flash calc display
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = fmtNum(totalChips);
  document.getElementById('calc-mult').textContent = totalMult.toFixed(1) + (artMult > 1 ? `×${artMult}` : '');
  document.getElementById('calc-result').textContent = fmtNum(earned);
  document.getElementById('ui-wpm').textContent = wpm;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');

  // Check goal
  if (state.score >= state.target && !state.goalReached) {
    state.goalReached = true;
    document.getElementById('goal-banner').classList.remove('hidden');
  }

  // Check game over
  if (state.hands <= 0 && !state.goalReached) {
    setTimeout(() => showScreen('gameover', `スコア ${fmtNum(state.score)} / 目標 ${fmtNum(state.target)}`), 800);
  }

  state.selectedWordIdx = -1;
  updateUI();
}

function addLog(text, type) {
  const log = document.getElementById('typing-log');
  const line = document.createElement('div');
  line.className = type === 'ok' ? 'log-ok' : type === 'fail' ? 'log-fail' : '';
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// ── Consumable ─────────────────────────────────────────────
function useConsumable(idx) {
  const item = state.consumables[idx];
  if (!item) return;

  if (item.action === 'reload') {
    generateWordList();
    state.consumables.splice(idx, 1);
    sfxBuy();
    addLog('> reloading words...', 'ok');
    renderAll();
    return;
  }

  if (item.action === 'gold' || item.action === 'glass') {
    state.pendingConsumable = { idx, action: item.action };
    addLog(`> Press a key to apply ${item.name}...`, 'ok');
    renderAll();
  }
}

function applyKeycap(key) {
  const pending = state.pendingConsumable;
  if (!pending) return;

  const mod = state.keyMods[key] || {};
  if (pending.action === 'gold') {
    mod.gold = true;
  } else if (pending.action === 'glass') {
    mod.glass = true;
  }
  state.keyMods[key] = mod;

  state.consumables.splice(pending.idx, 1);
  state.pendingConsumable = null;
  sfxBuy();
  addLog(`[OK] Applied to key "${key}"`, 'ok');
  renderAll();
}

// ── Rendering ──────────────────────────────────────────────
function renderAll() {
  renderWordList();
  renderTypingArea();
  renderKeyboard();
  renderSlots();
  updateUI();
}

function renderWordList() {
  const el = document.getElementById('word-list');
  el.innerHTML = '';
  state.words.forEach((w, i) => {
    const div = document.createElement('div');
    div.className = 'word-entry' +
      (w.completed ? ' completed' : '') +
      (i === state.selectedWordIdx ? ' selected' : '');
    const chips = [...w.text].reduce((s, c) => s + (/[A-Za-z]/.test(c) ? getKeyChips(c) : 3), 0);
    div.innerHTML = `
      <span class="we-num">${i + 1}.</span>
      <span class="we-word">${w.text}</span>
      <span class="we-info">(${w.text.length} chars, ~${chips} chips)</span>
    `;
    if (!w.completed) {
      div.addEventListener('click', () => selectWord(i));
    }
    el.appendChild(div);
  });
}

function renderTypingArea() {
  const output = document.getElementById('typed-output');
  if (!state.typingActive || state.selectedWordIdx < 0) {
    output.innerHTML = '';
    return;
  }

  const word = state.words[state.selectedWordIdx].text;
  const blindTouch = state.artifacts.some(a => a.id === 'blind_touch');
  let html = '';

  for (let i = 0; i < word.length; i++) {
    if (i < state.typedChars.length) {
      const tc = state.typedChars[i];
      html += `<span class="char-${tc.correct ? 'correct' : 'wrong'}">${tc.char}</span>`;
    } else {
      const displayChar = blindTouch ? '*' : word[i];
      html += `<span class="char-pending">${displayChar}</span>`;
    }
  }
  output.innerHTML = html;
}

function renderKeyboard() {
  const el = document.getElementById('keyboard-display');
  el.innerHTML = '';
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M'],
  ];
  rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'kb-row';
    row.forEach(key => {
      const div = document.createElement('div');
      const mod = getKeyMod(key);
      let cls = 'kb-key';
      if (mod.gold) cls += ' gold';
      if (mod.glass) cls += ' glass';
      if (mod.broken) cls += ' broken';
      // Highlight if typing and this is next expected char
      if (state.typingActive && state.selectedWordIdx >= 0) {
        const word = state.words[state.selectedWordIdx].text;
        if (state.cursorPos < word.length && word[state.cursorPos].toUpperCase() === key) {
          cls += ' active';
        }
      }
      div.className = cls;
      const chips = getKeyChips(key);
      div.innerHTML = `${key}<span class="kb-chip">+${chips}</span>`;
      if (mod.bonusMult) {
        div.innerHTML += `<span class="kb-mult">×${mod.bonusMult.toFixed(1)}</span>`;
      }
      el.appendChild(div);
    });
    el.appendChild(rowDiv);
  });
}

function renderSlots() {
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
      const ci = i;
      div.addEventListener('click', () => useConsumable(ci));
    }
    itemEl.appendChild(div);
  }
}

function updateUI() {
  document.getElementById('ui-target').textContent = fmtNum(state.target);
  document.getElementById('ui-score').textContent = fmtNum(state.score);
  document.getElementById('ui-money').textContent = `$${state.money}`;
  document.getElementById('ui-hands').textContent = state.hands;
}

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
      document.getElementById('typing-log').innerHTML = '';
      document.getElementById('ui-wpm').textContent = '—';
      state.goalReached = false;
      renderAll();
      break;
    case 'shop':
      document.getElementById('screen-shop').classList.add('active');
      renderShop();
      break;
    case 'gameover':
      document.getElementById('screen-gameover').classList.add('active');
      document.getElementById('gameover-reason').textContent = extraData || '';
      document.getElementById('gameover-stats').innerHTML =
        `<div>Ante: ${state.ante} | Round: ${state.round}</div><div>最終スコア: ${fmtNum(state.score)}</div>`;
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
  BLINDS.forEach(blind => {
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
  state.hands = state.maxHands;
  state.currentBlind = blind;
  generateWordList();
  showScreen('play');
  addLog(`root@balatro:~# ./typing_game --target ${fmtNum(target)}`, 'ok');
  addLog('=========================================================', '');
  addLog(`TARGET: ${fmtNum(target)}  HANDS: ${state.hands}`, '');
  addLog('=========================================================', '');
}

// ── Round Clear ────────────────────────────────────────────
function roundClear() {
  const reward = state.currentBlind.reward;
  const handBonus = state.hands;
  state.money += reward + handBonus;
  state.round++;
  if (state.round > 3) {
    state.round = 1;
    state.ante++;
    if (state.ante > 8) { showScreen('win'); return; }
  }
  showScreen('shop');
}

// ── Shop ───────────────────────────────────────────────────
function renderShop() {
  document.getElementById('shop-money').textContent = `$${state.money}`;
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  const availableArts = ARTIFACT_DEFS.filter(a => !state.artifacts.some(sa => sa.id === a.id));
  const shopArts = shuffle(availableArts).slice(0, 2);
  const shopCons = shuffle([...CONSUMABLE_DEFS]).slice(0, 2);

  // Also offer key upgrades
  const keyUpgrades = shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).slice(0, 3);

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
      if (div.classList.contains('sold') || state.money < price || state.artifacts.length >= 5) return;
      state.money -= price;
      state.artifacts.push({ ...art });
      div.classList.add('sold');
      document.getElementById('shop-money').textContent = `$${state.money}`;
      sfxBuy();
    });
    container.appendChild(div);
  });

  // Key mult upgrades
  keyUpgrades.forEach(key => {
    const price = 3;
    const div = document.createElement('div');
    div.className = 'shop-item';
    const currentMult = (getKeyMod(key).bonusMult || 0);
    div.innerHTML = `
      <div class="si-type">KEY UPGRADE</div>
      <div class="si-name">「${key}」キー強化</div>
      <div class="si-desc">倍率 +1.0 (現在: +${currentMult.toFixed(1)})</div>
      <div class="si-price">$${price}</div>
    `;
    div.addEventListener('click', () => {
      if (div.classList.contains('sold') || state.money < price) return;
      state.money -= price;
      const mod = state.keyMods[key] || {};
      mod.bonusMult = (mod.bonusMult || 0) + 1.0;
      state.keyMods[key] = mod;
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
      if (div.classList.contains('sold') || state.money < price || state.consumables.length >= 2) return;
      state.money -= price;
      state.consumables.push({ ...con });
      div.classList.add('sold');
      document.getElementById('shop-money').textContent = `$${state.money}`;
      sfxBuy();
    });
    container.appendChild(div);
  });
}

// ── Init & Bindings ────────────────────────────────────────
function resetGame() {
  Object.assign(state, {
    ante: 1, round: 1, money: 4, score: 0, target: 0,
    hands: 0, maxHands: 6,
    phase: 'title', words: [], selectedWordIdx: -1,
    typingActive: false, typedChars: [], cursorPos: 0, typoCount: 0,
    artifacts: [], consumables: [], keyMods: {},
    goalReached: false, pendingConsumable: null,
  });
}

document.addEventListener('keydown', handleKeyDown);

document.getElementById('btn-start').addEventListener('click', () => {
  startBGM();
  resetGame();
  showScreen('blind');
});

document.getElementById('btn-round-clear').addEventListener('click', () => roundClear());
document.getElementById('btn-next-round').addEventListener('click', () => showScreen('blind'));
document.getElementById('btn-retry').addEventListener('click', () => { resetGame(); showScreen('blind'); });
document.getElementById('btn-win-retry').addEventListener('click', () => { resetGame(); showScreen('blind'); });

showScreen('title');
