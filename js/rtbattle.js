// 即時對戰純邏輯：同 seed 不同機出同一組題；傷害權威在攻擊方。
const SciRtBattle = (() => {
  const ROUNDS = 10;
  const ROUND_SEC = 15;
  const POLL_MS = 1500;
  const DEAD_MS = 20000;
  const MAX_HP = 100;
  const NICK_ADJ = ['好奇的','冷靜的','閃亮的','勇敢的','機智的','沉穩的','敏銳的','熱血的'];
  const NICK_NOUN = ['電子','磁鐵','火山','彗星','葉綠體','光子','恐龍','石英','水分子','貓頭鷹'];
  const ADVENTURE_EVERY = 5;
  const ADVENTURE_RATE = 0.6;
  const ADVENTURES = [
    { id: 'insight', name: '靈感閃現', emoji: '💡', desc: '下一題答對傷害 ×2', effect: 'double' },
    { id: 'breakthrough', name: '實驗突破', emoji: '🧪', desc: '下一題排除一個錯誤選項', effect: 'eliminate' },
    { id: 'energy', name: '能量湧現', emoji: '⚡', desc: '立刻回復 10 HP', effect: 'heal', amount: 10 },
    { id: 'goggles', name: '護目鏡', emoji: '🥽', desc: '下一次答錯不中斷連擊', effect: 'goggles' },
  ];
  const ROLE_SALT = { p1: 0x515EED01, p2: 0x515EED02 };
  const SEASON_TITLES = [
    { min: 0, title: '見習觀測員' }, { min: 60, title: '正式研究員' },
    { min: 160, title: '資深實驗家' }, { min: 320, title: '首席研究員' },
    { min: 560, title: '科學院士' }, { min: 880, title: '星際科學家' },
  ];
  const WIN_PTS = 20;
  const LOSE_PTS = 5;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function withSeededRandom(rng, fn) {
    const original = Math.random;
    Math.random = rng;
    try { return fn(); } finally { Math.random = original; }
  }

  function buildQuestions(seed, pool, rounds = ROUNDS) {
    const rng = mulberry32(seed);
    const sorted = [...pool].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const count = Math.min(rounds, sorted.length);
    const used = new Set();
    const targets = [];
    while (targets.length < count) {
      const index = Math.floor(rng() * sorted.length);
      if (used.has(index)) continue;
      used.add(index);
      targets.push(sorted[index]);
    }
    return targets.map((target) => {
      const mode = rng() < 0.5 ? 'term2def' : 'def2term';
      return withSeededRandom(rng, () => SciQuiz.buildQuestion(target, sorted, mode));
    });
  }

  function answerResult({ correct, combo, myHp, boost = {} }) {
    if (!correct) return { dmg: 0, nextCombo: boost.goggles ? combo : 0 };
    return { dmg: SciBattle.calcDamage(combo, myHp) * (boost.double ? 2 : 1), nextCombo: combo + 1 };
  }

  function hpOf(maxHp, dmgTaken, healGained) {
    return Math.max(0, Math.min(maxHp, maxHp - dmgTaken + healGained));
  }

  function judge({ myHp, oppHp, myDone, oppDone, oppHbAgeMs }) {
    if (oppHbAgeMs > DEAD_MS) return 'win';
    if (myHp <= 0 && oppHp <= 0) return 'draw';
    if (myHp <= 0) return 'lose';
    if (oppHp <= 0) return 'win';
    if (myDone && oppDone) return myHp > oppHp ? 'win' : myHp < oppHp ? 'lose' : 'draw';
    return null;
  }

  function genNick(rng = Math.random) {
    const adj = NICK_ADJ[Math.floor(rng() * NICK_ADJ.length)];
    const noun = NICK_NOUN[Math.floor(rng() * NICK_NOUN.length)];
    return `${adj}${noun}${String(Math.floor(rng() * 100)).padStart(2, '0')}`;
  }

  function buildAdventureScript(seed, role, rounds = ROUNDS, every = ADVENTURE_EVERY) {
    const rng = mulberry32((seed ^ (ROLE_SALT[role] || 0)) >>> 0);
    const script = new Map();
    let lastId = null;
    for (let at = every; at <= rounds; at += every) {
      const isLast = at + every > rounds;
      const fire = rng() < ADVENTURE_RATE || (isLast && script.size === 0);
      const roll = rng();
      if (!fire) continue;
      const pool = ADVENTURES.filter((event) => event.id !== lastId);
      const picked = pool[Math.floor(roll * pool.length)];
      lastId = picked.id;
      script.set(at, picked);
    }
    return script;
  }

  function safeBoard(rows, myNick, topN = 5) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, topN).map(({ nick, score }) => ({ nick, score }));
    const index = sorted.findIndex((row) => row.nick === myNick);
    const me = index >= topN ? { rank: index + 1, nick: myNick, score: sorted[index].score } : null;
    return { top, me, total: sorted.length };
  }

  function loadClass() {
    try {
      const value = JSON.parse(localStorage.getItem('sci_class'));
      return value && typeof value.code === 'string' && typeof value.nick === 'string' ? { code: value.code, nick: value.nick } : null;
    } catch { return null; }
  }

  function saveClass(value) {
    try {
      if (value && typeof value.code === 'string' && typeof value.nick === 'string') localStorage.setItem('sci_class', JSON.stringify({ code: value.code, nick: value.nick }));
    } catch { /* 隱私模式禁止寫入時靜默降級 */ }
  }

  function seasonKey(dateStr) { return String(dateStr).slice(0, 7); }

  function titleFor(points) {
    let title = SEASON_TITLES[0].title;
    for (const tier of SEASON_TITLES) if (points >= tier.min) title = tier.title;
    return title;
  }

  function recordSeasonResult(state, todayStr, verdict) {
    const key = seasonKey(todayStr);
    let season = state.rtSeason;
    if (!season || season.key !== key) {
      const titles = season?.titles || {};
      if (season?.key) titles[season.key] = titleFor(season.pts);
      season = state.rtSeason = { key, pts: 0, wins: 0, battles: 0, titles };
    }
    season.battles += 1;
    if (verdict === 'win') { season.pts += WIN_PTS; season.wins += 1; }
    else season.pts += LOSE_PTS;
    return { key: season.key, pts: season.pts, wins: season.wins, battles: season.battles, title: titleFor(season.pts) };
  }

  return { ROUNDS, ROUND_SEC, POLL_MS, DEAD_MS, MAX_HP, mulberry32, withSeededRandom, buildQuestions, answerResult, hpOf, judge, NICK_ADJ, NICK_NOUN, genNick, ADVENTURE_EVERY, ADVENTURE_RATE, ADVENTURES, buildAdventureScript, safeBoard, loadClass, saveClass, SEASON_TITLES, WIN_PTS, LOSE_PTS, seasonKey, titleFor, recordSeasonResult };
})();
