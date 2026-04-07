/* ================================================================
   花札（こいこい） × バラトロライク — game.js
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
function sfxMatch()  { playTone(880, 0.1, 'sine', 0.06); setTimeout(() => playTone(1100, 0.08, 'sine', 0.06), 60); }
function sfxDraw()   { playTone(440, 0.06, 'triangle', 0.04); }
function sfxShoubu() { playTone(523, 0.1, 'square', 0.06); setTimeout(() => playTone(784, 0.15, 'square', 0.06), 80); setTimeout(() => playTone(1047, 0.2, 'square', 0.06), 180); }
function sfxKoikoi() { playTone(330, 0.15, 'sawtooth', 0.05); setTimeout(() => playTone(440, 0.2, 'sawtooth', 0.06), 100); }
function sfxBuy()    { playTone(660, 0.08, 'sine', 0.06); setTimeout(() => playTone(880, 0.12, 'sine', 0.06), 60); }
function sfxFail()   { playTone(200, 0.3, 'sawtooth', 0.06); }

// BGM
let bgmOsc1 = null, bgmGain = null;
function startBGM() {
  ensureAudio();
  if (bgmGain) return;
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.015;
  bgmGain.connect(audioCtx.destination);
  bgmOsc1 = audioCtx.createOscillator();
  bgmOsc1.type = 'sine'; bgmOsc1.frequency.value = 65;
  bgmOsc1.connect(bgmGain); bgmOsc1.start();
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine'; osc2.frequency.value = 98;
  osc2.connect(bgmGain); osc2.start();
}

// ── Hanafuda Deck Definition ──────────────────────────────
// 12 months, 4 cards each = 48 cards
// Types: hikari(光), tane(タネ), tanzaku(短冊), kasu(カス)
const MONTHS = [
  { id:1,  name:'1月',  plant:'松',   icon:'🌲' },
  { id:2,  name:'2月',  plant:'梅',   icon:'🌸' },
  { id:3,  name:'3月',  plant:'桜',   icon:'🌺' },
  { id:4,  name:'4月',  plant:'藤',   icon:'🌿' },
  { id:5,  name:'5月',  plant:'菖蒲', icon:'🪻' },
  { id:6,  name:'6月',  plant:'牡丹', icon:'🌹' },
  { id:7,  name:'7月',  plant:'萩',   icon:'🍀' },
  { id:8,  name:'8月',  plant:'芒',   icon:'🌾' },
  { id:9,  name:'9月',  plant:'菊',   icon:'🏵' },
  { id:10, name:'10月', plant:'紅葉', icon:'🍁' },
  { id:11, name:'11月', plant:'柳',   icon:'🌧' },
  { id:12, name:'12月', plant:'桐',   icon:'🎋' },
];

// Full 48 card definitions
const CARD_DEFS = [
  // 1月 松
  { month:1, type:'hikari', name:'松に鶴',       chips:20 },
  { month:1, type:'tanzaku',name:'松に赤短',     chips:5  },
  { month:1, type:'kasu',   name:'松のカス①',   chips:1  },
  { month:1, type:'kasu',   name:'松のカス②',   chips:1  },
  // 2月 梅
  { month:2, type:'tane',   name:'梅に鶯',       chips:10 },
  { month:2, type:'tanzaku',name:'梅に赤短',     chips:5  },
  { month:2, type:'kasu',   name:'梅のカス①',   chips:1  },
  { month:2, type:'kasu',   name:'梅のカス②',   chips:1  },
  // 3月 桜
  { month:3, type:'hikari', name:'桜に幕',       chips:20 },
  { month:3, type:'tanzaku',name:'桜に赤短',     chips:5  },
  { month:3, type:'kasu',   name:'桜のカス①',   chips:1  },
  { month:3, type:'kasu',   name:'桜のカス②',   chips:1  },
  // 4月 藤
  { month:4, type:'tane',   name:'藤にホトトギス',chips:10 },
  { month:4, type:'tanzaku',name:'藤に短冊',     chips:5  },
  { month:4, type:'kasu',   name:'藤のカス①',   chips:1  },
  { month:4, type:'kasu',   name:'藤のカス②',   chips:1  },
  // 5月 菖蒲
  { month:5, type:'tane',   name:'菖蒲に八橋',   chips:10 },
  { month:5, type:'tanzaku',name:'菖蒲に短冊',   chips:5  },
  { month:5, type:'kasu',   name:'菖蒲のカス①', chips:1  },
  { month:5, type:'kasu',   name:'菖蒲のカス②', chips:1  },
  // 6月 牡丹
  { month:6, type:'tane',   name:'牡丹に蝶',     chips:10 },
  { month:6, type:'tanzaku',name:'牡丹に青短',   chips:5  },
  { month:6, type:'kasu',   name:'牡丹のカス①', chips:1  },
  { month:6, type:'kasu',   name:'牡丹のカス②', chips:1  },
  // 7月 萩
  { month:7, type:'tane',   name:'萩に猪',       chips:10 },
  { month:7, type:'tanzaku',name:'萩に短冊',     chips:5  },
  { month:7, type:'kasu',   name:'萩のカス①',   chips:1  },
  { month:7, type:'kasu',   name:'萩のカス②',   chips:1  },
  // 8月 芒
  { month:8, type:'hikari', name:'芒に月',       chips:20 },
  { month:8, type:'tane',   name:'芒に雁',       chips:10 },
  { month:8, type:'kasu',   name:'芒のカス①',   chips:1  },
  { month:8, type:'kasu',   name:'芒のカス②',   chips:1  },
  // 9月 菊
  { month:9, type:'tane',   name:'菊に盃',       chips:10 },
  { month:9, type:'tanzaku',name:'菊に青短',     chips:5  },
  { month:9, type:'kasu',   name:'菊のカス①',   chips:1  },
  { month:9, type:'kasu',   name:'菊のカス②',   chips:1  },
  // 10月 紅葉
  { month:10, type:'tane',   name:'紅葉に鹿',    chips:10 },
  { month:10, type:'tanzaku',name:'紅葉に青短',  chips:5  },
  { month:10, type:'kasu',   name:'紅葉のカス①',chips:1  },
  { month:10, type:'kasu',   name:'紅葉のカス②',chips:1  },
  // 11月 柳
  { month:11, type:'hikari', name:'柳に小野道風', chips:20 },
  { month:11, type:'tane',   name:'柳に燕',      chips:10 },
  { month:11, type:'tanzaku',name:'柳に短冊',    chips:5  },
  { month:11, type:'kasu',   name:'柳のカス',    chips:1  },
  // 12月 桐
  { month:12, type:'hikari', name:'桐に鳳凰',    chips:20 },
  { month:12, type:'kasu',   name:'桐のカス①',  chips:1  },
  { month:12, type:'kasu',   name:'桐のカス②',  chips:1  },
  { month:12, type:'kasu',   name:'桐のカス③',  chips:1  },
];

// ── Yaku (役) Definitions ─────────────────────────────────
const YAKU_DEFS = [
  { id:'goko',       name:'五光',     mult:50,  test: c => c.filter(x=>x.type==='hikari').length >= 5 },
  { id:'shiko',      name:'四光',     mult:20,  test: c => { const h = c.filter(x=>x.type==='hikari'&&x.month!==11); return h.length >= 4; } },
  { id:'ame_shiko',  name:'雨四光',   mult:12,  test: c => c.filter(x=>x.type==='hikari').length >= 4 },
  { id:'sanko',      name:'三光',     mult:8,   test: c => { const h = c.filter(x=>x.type==='hikari'&&x.month!==11); return h.length >= 3; } },
  { id:'inoshika',   name:'猪鹿蝶',   mult:5,   test: c => {
    return c.some(x=>x.name==='萩に猪') && c.some(x=>x.name==='紅葉に鹿') && c.some(x=>x.name==='牡丹に蝶');
  }},
  { id:'hanami',     name:'花見酒',   mult:5,   test: c => c.some(x=>x.name==='桜に幕') && c.some(x=>x.name==='菊に盃') },
  { id:'tsukimi',    name:'月見酒',   mult:5,   test: c => c.some(x=>x.name==='芒に月') && c.some(x=>x.name==='菊に盃') },
  { id:'akatan',     name:'赤短',     mult:6,   test: c => {
    return c.some(x=>x.name==='松に赤短') && c.some(x=>x.name==='梅に赤短') && c.some(x=>x.name==='桜に赤短');
  }},
  { id:'aotan',      name:'青短',     mult:6,   test: c => {
    return c.some(x=>x.name==='牡丹に青短') && c.some(x=>x.name==='菊に青短') && c.some(x=>x.name==='紅葉に青短');
  }},
  { id:'tane5',      name:'タネ5枚',  mult:1,   test: c => c.filter(x=>x.type==='tane').length >= 5,
    extra: c => Math.max(0, c.filter(x=>x.type==='tane').length - 5) * 0.5 },
  { id:'tan5',       name:'短冊5枚',  mult:1,   test: c => c.filter(x=>x.type==='tanzaku').length >= 5,
    extra: c => Math.max(0, c.filter(x=>x.type==='tanzaku').length - 5) * 0.5 },
  { id:'kasu10',     name:'カス10枚', mult:1,   test: c => c.filter(x=>x.type==='kasu').length >= 10,
    extra: c => Math.max(0, c.filter(x=>x.type==='kasu').length - 10) * 0.1 },
];

// ── Artifact Definitions ───────────────────────────────────
const ARTIFACT_DEFS = [
  { id:'kasu_soul',   name:'雑草魂',       desc:'カス札のチップが+1→+15に', category:'チップ' },
  { id:'sake_lover',  name:'風流人',       desc:'月見酒/花見酒の倍率+15.0', category:'倍率' },
  { id:'madness',     name:'狂気の沙汰',   desc:'こいこい時×2→×3、手札1枚消滅', category:'欲張り' },
  { id:'boar_rush',   name:'猪突猛進',     desc:'猪獲得ターンに勝負で×2', category:'乗算' },
  { id:'moonshine',   name:'密造酒',       desc:'山札にワイルドカード2枚混入', category:'ルール変更' },
];

// ── Consumable Definitions ─────────────────────────────────
const CONSUMABLE_DEFS = [
  { id:'upgrade_pen', name:'昇格の筆',   desc:'カス札1枚を光札に書き換え', action:'upgrade' },
  { id:'season_swap', name:'季節はずれ', desc:'札の月を別の月に変更',       action:'swap_month' },
  { id:'force_take',  name:'強制収穫',   desc:'場札1枚を直接獲得',         action:'force_take' },
];

// ── Game State ─────────────────────────────────────────────
const state = {
  ante: 1, round: 1, money: 4,
  score: 0, target: 0,
  hands: 0, maxHands: 8,
  koikoiCount: 0,
  pendingScore: 0,
  deck: [],        // draw pile
  hand: [],        // player hand
  table: [],       // field cards
  captured: [],    // player's captured cards
  artifacts: [],   // max 5
  consumables: [], // max 2
  phase: 'title',
  turnPhase: 'hand_play', // hand_play | hand_match | deck_draw | deck_match | done
  selectedHandCard: null,
  selectedTableCard: null,
  goalReached: false,
  prevYaku: [],    // yaku already counted before current koikoi streak
  boarCapturedThisTurn: false,
  pendingConsumable: null,
};

// ── Ante / Blind Config ────────────────────────────────────
const BLINDS = [
  { name: 'SMALL BLIND', mult: 1.0, reward: 3 },
  { name: 'BIG BLIND',   mult: 1.5, reward: 4 },
  { name: 'BOSS BLIND',  mult: 2.5, reward: 6 },
];
function baseTarget(ante) { return 200 + ante * 400; }

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

function getMonthInfo(monthId) {
  return MONTHS.find(m => m.id === monthId) || MONTHS[0];
}

// ── Build Deck ─────────────────────────────────────────────
function buildDeck() {
  let cards = CARD_DEFS.map((def, i) => ({
    ...def,
    id: i,
    originalMonth: def.month,
    originalType: def.type,
    originalChips: def.chips,
  }));

  // Apply artifact: kasu_soul (upgrade kasu chips)
  if (state.artifacts.some(a => a.id === 'kasu_soul')) {
    cards.forEach(c => { if (c.type === 'kasu') c.chips = 15; });
  }

  // Apply artifact: moonshine (add wild cards)
  if (state.artifacts.some(a => a.id === 'moonshine')) {
    for (let w = 0; w < 2; w++) {
      cards.push({
        id: 100 + w, month: 0, type: 'wild', name: 'ワイルド',
        chips: 5, originalMonth: 0, originalType: 'wild', originalChips: 5,
      });
    }
  }

  return shuffle(cards);
}

// ── Deal ───────────────────────────────────────────────────
function deal() {
  state.deck = buildDeck();
  state.hand = state.deck.splice(0, 8);
  state.table = state.deck.splice(0, 8);
  state.captured = [];
  state.koikoiCount = 0;
  state.pendingScore = 0;
  state.prevYaku = [];
  state.turnPhase = 'hand_play';
  state.selectedHandCard = null;
  state.selectedTableCard = null;
  state.boarCapturedThisTurn = false;
}

// ── Match Logic ────────────────────────────────────────────
function getMatchingTableCards(card) {
  if (card.type === 'wild') return [...state.table]; // wild matches all
  return state.table.filter(t => t.month === card.month || t.type === 'wild');
}

function playHandCard(handIdx) {
  if (state.turnPhase !== 'hand_play') return;
  if (state.pendingConsumable) return;

  const card = state.hand[handIdx];
  state.selectedHandCard = handIdx;
  const matches = getMatchingTableCards(card);

  if (matches.length === 0) {
    // No match: place card on table
    state.table.push(state.hand.splice(handIdx, 1)[0]);
    state.selectedHandCard = null;
    sfxDraw();
    goToDeckDraw();
  } else if (matches.length === 1) {
    // Exactly one match: auto-capture
    captureCards(card, matches[0]);
    state.hand.splice(handIdx, 1);
    state.selectedHandCard = null;
    goToDeckDraw();
  } else {
    // Multiple matches: player selects
    state.turnPhase = 'hand_match';
    renderAll();
  }
}

function selectTableCard(tableIdx) {
  const tableCard = state.table[tableIdx];

  if (state.pendingConsumable) {
    handleConsumableTarget(tableIdx, 'table');
    return;
  }

  if (state.turnPhase === 'hand_match') {
    const handCard = state.hand[state.selectedHandCard];
    if (tableCard.month === handCard.month || handCard.type === 'wild' || tableCard.type === 'wild') {
      captureCards(handCard, tableCard);
      state.hand.splice(state.selectedHandCard, 1);
      state.selectedHandCard = null;
      goToDeckDraw();
    }
  } else if (state.turnPhase === 'deck_match') {
    const drawnCard = state._drawnCard;
    if (tableCard.month === drawnCard.month || drawnCard.type === 'wild' || tableCard.type === 'wild') {
      captureCards(drawnCard, tableCard);
      state._drawnCard = null;
      endTurn();
    }
  }
}

function captureCards(playedCard, matchedCard) {
  // Remove matchedCard from table
  const tidx = state.table.indexOf(matchedCard);
  if (tidx >= 0) state.table.splice(tidx, 1);

  state.captured.push(playedCard, matchedCard);

  // Check boar capture
  if (playedCard.name === '萩に猪' || matchedCard.name === '萩に猪') {
    state.boarCapturedThisTurn = true;
  }

  sfxMatch();
}

function goToDeckDraw() {
  state.turnPhase = 'deck_draw';
  renderAll();

  // Auto-draw from deck after short delay
  setTimeout(() => {
    if (state.deck.length === 0) {
      endTurn();
      return;
    }
    const drawn = state.deck.shift();
    state._drawnCard = drawn;
    const matches = getMatchingTableCards(drawn);

    if (matches.length === 0) {
      state.table.push(drawn);
      state._drawnCard = null;
      sfxDraw();
      endTurn();
    } else if (matches.length === 1) {
      captureCards(drawn, matches[0]);
      state._drawnCard = null;
      endTurn();
    } else {
      state.turnPhase = 'deck_match';
      renderAll();
    }
  }, 400);
}

function endTurn() {
  // Check for new yaku
  const currentYaku = detectYaku();
  const newYaku = currentYaku.filter(y => !state.prevYaku.includes(y.id));

  if (newYaku.length > 0) {
    showKoikoiModal(currentYaku, newYaku);
  } else {
    finishTurn();
  }
}

function finishTurn() {
  state.hands--;
  state.boarCapturedThisTurn = false;

  if (state.hand.length === 0 || state.hands <= 0) {
    // Ran out of hands while in koikoi → bust
    if (state.koikoiCount > 0) {
      sfxFail();
      state.pendingScore = 0;
      setTimeout(() => showScreen('gameover', 'こいこいバースト！スコア没収'), 600);
      return;
    }
    // Normal end — check if goal reached
    if (state.score >= state.target) {
      state.goalReached = true;
      document.getElementById('goal-banner').classList.remove('hidden');
    } else if (state.hands <= 0 && state.hand.length === 0) {
      setTimeout(() => showScreen('gameover', `スコア ${fmtNum(state.score)} / 目標 ${fmtNum(state.target)}`), 600);
      return;
    }
  }

  state.turnPhase = 'hand_play';
  updateUI();
  renderAll();
}

// ── Yaku Detection ─────────────────────────────────────────
function detectYaku() {
  const matched = [];
  YAKU_DEFS.forEach(y => {
    if (y.test(state.captured)) {
      const extra = y.extra ? y.extra(state.captured) : 0;
      matched.push({ id: y.id, name: y.name, mult: y.mult + extra });
    }
  });
  return matched;
}

// ── Koikoi / Shoubu ────────────────────────────────────────
function showKoikoiModal(allYaku, newYaku) {
  state.turnPhase = 'done'; // pause
  const modal = document.getElementById('koikoi-modal');
  modal.classList.remove('hidden');

  const yakuList = document.getElementById('modal-yaku-list');
  yakuList.innerHTML = allYaku.map(y => {
    const isNew = newYaku.some(n => n.id === y.id);
    return `<div style="color:${isNew ? 'var(--accent)' : 'var(--dim)'}">
      ${isNew ? '★ ' : ''}${y.name} — 倍率 +${y.mult.toFixed(1)}
    </div>`;
  }).join('');

  updateCalcPreview(allYaku);
}

function doShoubu() {
  document.getElementById('koikoi-modal').classList.add('hidden');
  sfxShoubu();

  const allYaku = detectYaku();
  const totalChips = calcTotalChips();
  let totalMult = allYaku.reduce((s, y) => s + y.mult, 0);

  // Artifact: sake_lover
  if (state.artifacts.some(a => a.id === 'sake_lover')) {
    if (allYaku.some(y => y.id === 'hanami' || y.id === 'tsukimi')) {
      totalMult += 15;
    }
  }

  // Koikoi multiplier
  let koikoiMult = 1;
  const madness = state.artifacts.some(a => a.id === 'madness');
  for (let i = 0; i < state.koikoiCount; i++) {
    koikoiMult *= madness ? 3 : 2;
  }

  // Artifact: boar_rush
  let artMult = 1;
  if (state.artifacts.some(a => a.id === 'boar_rush') && state.boarCapturedThisTurn) {
    artMult = 2;
  }

  const earned = Math.floor(totalChips * totalMult * koikoiMult * artMult);
  state.score += earned;

  // Reset captured for next hand within same round
  state.captured = [];
  state.koikoiCount = 0;
  state.prevYaku = [];
  state.pendingScore = 0;

  // Flash calc
  const el = document.getElementById('calc-display');
  document.getElementById('calc-chips').textContent = fmtNum(totalChips);
  const multLabel = totalMult.toFixed(1) + (koikoiMult > 1 ? `×${koikoiMult}` : '') + (artMult > 1 ? `×${artMult}` : '');
  document.getElementById('calc-mult').textContent = multLabel;
  document.getElementById('calc-result').textContent = fmtNum(earned);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');

  if (state.score >= state.target && !state.goalReached) {
    state.goalReached = true;
    document.getElementById('goal-banner').classList.remove('hidden');
  }

  finishTurn();
}

function doKoikoi() {
  document.getElementById('koikoi-modal').classList.add('hidden');
  sfxKoikoi();

  state.koikoiCount++;
  state.prevYaku = detectYaku().map(y => y.id);

  // Madness: remove a random hand card
  if (state.artifacts.some(a => a.id === 'madness') && state.hand.length > 0) {
    const ri = Math.floor(Math.random() * state.hand.length);
    state.hand.splice(ri, 1);
  }

  // Flash effect
  const flash = document.createElement('div');
  flash.className = 'koikoi-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  finishTurn();
}

function calcTotalChips() {
  return state.captured.reduce((s, c) => s + c.chips, 0);
}

function updateCalcPreview(yaku) {
  const chips = calcTotalChips();
  const mult = yaku.reduce((s, y) => s + y.mult, 0);
  document.getElementById('calc-chips').textContent = fmtNum(chips);
  document.getElementById('calc-mult').textContent = mult.toFixed(1);
  document.getElementById('calc-result').textContent = fmtNum(Math.floor(chips * mult));
}

// ── Consumable Usage ───────────────────────────────────────
function useConsumable(idx) {
  const item = state.consumables[idx];
  if (!item || state.turnPhase !== 'hand_play') return;

  state.pendingConsumable = { idx, action: item.action };
  renderAll();
}

function handleConsumableTarget(cardIdx, zone) {
  const pending = state.pendingConsumable;
  if (!pending) return;

  if (pending.action === 'upgrade') {
    // Upgrade kasu to hikari
    const cards = zone === 'hand' ? state.hand : state.table;
    const card = cards[cardIdx];
    if (card && card.type === 'kasu') {
      card.type = 'hikari';
      card.chips = 20;
      card.name = card.name.replace('カス', '光(昇格)');
      finishConsumable();
    }
  } else if (pending.action === 'swap_month') {
    const cards = zone === 'hand' ? state.hand : state.table;
    const card = cards[cardIdx];
    if (card) {
      // Cycle to next month
      card.month = (card.month % 12) + 1;
      finishConsumable();
    }
  } else if (pending.action === 'force_take') {
    if (zone === 'table') {
      const card = state.table[cardIdx];
      if (card) {
        state.captured.push(card);
        state.table.splice(cardIdx, 1);
        sfxMatch();
        finishConsumable();
        // Check yaku after forced take
        const currentYaku = detectYaku();
        const newYaku = currentYaku.filter(y => !state.prevYaku.includes(y.id));
        if (newYaku.length > 0) {
          showKoikoiModal(currentYaku, newYaku);
        }
      }
    }
  }
}

function selectHandCardForConsumable(handIdx) {
  if (!state.pendingConsumable) return;
  handleConsumableTarget(handIdx, 'hand');
}

function finishConsumable() {
  const idx = state.pendingConsumable.idx;
  state.consumables.splice(idx, 1);
  state.pendingConsumable = null;
  sfxBuy();
  renderSlots();
  renderAll();
}

// ── Rendering ──────────────────────────────────────────────
function renderAll() {
  renderHand();
  renderTable();
  renderCaptured();
  renderSlots();
  updateUI();
}

function createCardEl(card, extraClass = '') {
  const m = getMonthInfo(card.month);
  const div = document.createElement('div');
  let typeClass = `type-${card.type}`;
  div.className = `card ${typeClass} ${extraClass}`;
  const typeLabel = { hikari:'光', tane:'タネ', tanzaku:'短冊', kasu:'カス', wild:'WILD' }[card.type] || '';
  div.innerHTML = `
    <div class="card-month">${card.type === 'wild' ? 'ALL' : m.name}</div>
    <div class="card-icon">${card.type === 'wild' ? '✦' : m.icon}</div>
    <div class="card-type">${typeLabel}</div>
  `;
  return div;
}

function renderHand() {
  const el = document.getElementById('hand-cards');
  el.innerHTML = '';
  state.hand.forEach((card, i) => {
    const div = createCardEl(card);
    if (state.selectedHandCard === i) div.classList.add('selected');

    // Match hint: hover shows matching table cards
    div.addEventListener('mouseenter', () => {
      if (state.turnPhase !== 'hand_play' && state.turnPhase !== 'hand_match') return;
      const matches = getMatchingTableCards(card);
      document.querySelectorAll('#table-cards .card').forEach((tel, ti) => {
        if (matches.includes(state.table[ti])) tel.classList.add('match-hint');
      });
    });
    div.addEventListener('mouseleave', () => {
      document.querySelectorAll('#table-cards .card').forEach(tel => tel.classList.remove('match-hint'));
    });

    div.addEventListener('click', () => {
      if (state.pendingConsumable) {
        selectHandCardForConsumable(i);
      } else {
        playHandCard(i);
      }
    });
    el.appendChild(div);
  });

  // Show drawn card during deck_draw/deck_match
  if ((state.turnPhase === 'deck_draw' || state.turnPhase === 'deck_match') && state._drawnCard) {
    const drawnEl = createCardEl(state._drawnCard);
    drawnEl.style.marginLeft = '20px';
    drawnEl.style.border = '1px solid var(--accent)';
    drawnEl.style.boxShadow = '0 0 10px rgba(255,51,102,.3)';
    drawnEl.style.cursor = 'default';
    el.appendChild(drawnEl);
  }
}

function renderTable() {
  const el = document.getElementById('table-cards');
  el.innerHTML = '';
  state.table.forEach((card, i) => {
    const div = createCardEl(card);
    div.addEventListener('click', () => selectTableCard(i));
    el.appendChild(div);
  });
}

function renderCaptured() {
  const el = document.getElementById('captured-cards');
  el.innerHTML = '';

  // Group by type
  const groups = { hikari: [], tane: [], tanzaku: [], kasu: [], wild: [] };
  state.captured.forEach(c => {
    const g = groups[c.type] || groups.kasu;
    g.push(c);
  });

  ['hikari', 'tane', 'tanzaku', 'kasu', 'wild'].forEach(type => {
    const cards = groups[type];
    if (cards.length === 0) return;
    cards.forEach(card => {
      const div = createCardEl(card, 'captured-card');
      el.appendChild(div);
    });
  });
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
  document.getElementById('ui-deck').textContent = state.deck.length;
  document.getElementById('ui-koikoi').textContent = state.koikoiCount;
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
      document.getElementById('koikoi-modal').classList.add('hidden');
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
  deal();
  showScreen('play');
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
      if (div.classList.contains('sold') || state.money < price || state.artifacts.length >= 5) return;
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
    hands: 0, maxHands: 8, koikoiCount: 0, pendingScore: 0,
    deck: [], hand: [], table: [], captured: [],
    artifacts: [], consumables: [],
    phase: 'title', turnPhase: 'hand_play',
    selectedHandCard: null, selectedTableCard: null,
    goalReached: false, prevYaku: [],
    boarCapturedThisTurn: false, pendingConsumable: null,
  });
}

document.getElementById('btn-start').addEventListener('click', () => {
  startBGM();
  resetGame();
  showScreen('blind');
});

document.getElementById('btn-round-clear').addEventListener('click', () => roundClear());
document.getElementById('btn-next-round').addEventListener('click', () => showScreen('blind'));
document.getElementById('btn-retry').addEventListener('click', () => { resetGame(); showScreen('blind'); });
document.getElementById('btn-win-retry').addEventListener('click', () => { resetGame(); showScreen('blind'); });
document.getElementById('btn-shoubu').addEventListener('click', () => doShoubu());
document.getElementById('btn-koikoi').addEventListener('click', () => doKoikoi());

showScreen('title');
