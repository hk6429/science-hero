// 精靈融合系統：四科精靈滿階融合出稚靈（6 隻封頂）。純前端、獨立存檔 sci_fusion。
// 晶能收支走 SciEconomy；未上線時走內建 stub（離線保險，勿刪）。
// 硬性規則：雙親精靈永不消耗；本模組不寫入學習卡片狀態。
const SciFusionStore = (() => {
  const KEY = 'sci_fusion';
  const ECON_KEY = 'sci_econ';

  function defaults() {
    return {
      v: 1,
      hatched: [],
      nicknames: {},
      revealed: [],
      failStreak: 0,
      lastFuseDate: '',
      fuseCount: 0,
      activeCub: '',
      grandBorn: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      const fallback = defaults();
      return {
        v: 1,
        hatched: Array.isArray(parsed.hatched) ? parsed.hatched : fallback.hatched,
        nicknames: parsed.nicknames && typeof parsed.nicknames === 'object' && !Array.isArray(parsed.nicknames)
          ? parsed.nicknames : fallback.nicknames,
        revealed: Array.isArray(parsed.revealed) ? parsed.revealed : fallback.revealed,
        failStreak: Number.isFinite(parsed.failStreak) ? parsed.failStreak : 0,
        lastFuseDate: typeof parsed.lastFuseDate === 'string' ? parsed.lastFuseDate : '',
        fuseCount: Number.isFinite(parsed.fuseCount) ? parsed.fuseCount : 0,
        activeCub: typeof parsed.activeCub === 'string' ? parsed.activeCub : '',
        grandBorn: parsed.grandBorn === true,
      };
    } catch {
      return defaults();
    }
  }

  function save(fstate) {
    try {
      localStorage.setItem(KEY, JSON.stringify(fstate));
      return true;
    } catch {
      return false;
    }
  }

  const __econStub = (() => {
    function read() {
      try {
        return JSON.parse(localStorage.getItem(ECON_KEY)) || { balance: 0 };
      } catch {
        return { balance: 0 };
      }
    }

    function write(econ) {
      try { localStorage.setItem(ECON_KEY, JSON.stringify(econ)); } catch { /* 隱私模式下靜默失敗 */ }
    }

    return {
      getBalance() { return read().balance || 0; },
      spendCrystals(n) {
        const econ = read();
        if (!Number.isFinite(n) || n < 0 || (econ.balance || 0) < n) {
          return { ok: false, balance: econ.balance || 0 };
        }
        econ.balance = (econ.balance || 0) - Math.floor(n);
        write(econ);
        return { ok: true, balance: econ.balance };
      },
      earnCrystals(n) {
        const econ = read();
        if (!Number.isFinite(n) || n <= 0) return { earned: 0, balance: econ.balance || 0 };
        const earned = Math.floor(n);
        econ.balance = (econ.balance || 0) + earned;
        write(econ);
        return { earned, balance: econ.balance };
      },
    };
  })();

  const Econ = typeof SciEconomy !== 'undefined' && SciEconomy && SciEconomy.spendCrystals
    ? SciEconomy
    : __econStub;

  function crystalBalance() { return Econ.getBalance(); }
  function spendCrystals(n) { return Econ.spendCrystals(n, 'fusion'); }
  function refundCrystals(n) { return Econ.earnCrystals(n, 'fusion-refund'); }

  const MASTER_GATE = 100;
  const ACC_GATE = 0.8;
  const ACC_WINDOW = 30;
  const ACC_MIN_SAMPLE = 15;
  const SUBJECT_ORDER = ['nature', 'biology', 'chemphys', 'earth'];

  function pairKey(a, b) {
    return [a, b]
      .sort((x, y) => SUBJECT_ORDER.indexOf(x) - SUBJECT_ORDER.indexOf(y))
      .join('+');
  }

  function accuracyBySubject(state, subjectKey, opts = {}) {
    const windowSize = opts.window || ACC_WINDOW;
    const log = (state && state.weakLog) || [];
    const recent = log
      .filter((entry) => SciBattle.subjectOfId(entry.termId) === subjectKey)
      .slice(-windowSize);
    const total = recent.length;
    const correct = recent.filter((entry) => entry.correct).length;
    return { accuracy: total ? correct / total : 0, total };
  }

  const FUSE_COST = 30;
  const FAIL_RATE = 0.2;
  const MAX_FUSE_PER_DAY = 3;
  const FAIL_LINES = [
    '兩股靈力沒能合上——別急，這不扣你的精靈、也不扣你的學習，退你一半晶能，明天再來一次。',
    '光曈閃了一下又散開了。稚靈感覺得到你的努力，只是還差一點火候，這半數晶能拿回去。',
    '這次沒接住，但精靈毫髮無傷、進度一格沒少。休息一下，多練幾題晶能又滿了。',
  ];

  function failLine(fstate) {
    const index = Math.min(Math.max((fstate.failStreak || 1) - 1, 0), FAIL_LINES.length - 1);
    return FAIL_LINES[index];
  }

  const CUBS = [
    { id: 'cub_forestdeer', name: '森靈鹿', emoji: '🦌', pair: ['nature', 'biology'],
      bornLine: '苔綠鹿角上棲著整片生態系，牠一踏步，荒地便冒出新芽。' },
    { id: 'cub_crystalfox', name: '晶石狐', emoji: '🦊', pair: ['nature', 'chemphys'],
      bornLine: '尾尖凝著會變色的結晶，牠嗅得出每一次反應該往哪走。' },
    { id: 'cub_windhawk', name: '風嵐鷹', emoji: '🦅', pair: ['nature', 'earth'],
      bornLine: '乘著季風巡遊高空，牠的翅膀讀得懂雲、也讀得懂地層。' },
    { id: 'cub_alchemydragon', name: '煉金龍', emoji: '🐉', pair: ['biology', 'chemphys'],
      bornLine: '體內流著會呼吸的化學反應，一吐息就是一場生命與元素的交換。' },
    { id: 'cub_deepwhale', name: '深海鯨', emoji: '🐋', pair: ['biology', 'earth'],
      bornLine: '潛行於洋流最深處，牠的歌聲同時是生命的脈動與地球的心跳。' },
    { id: 'cub_starcore', name: '星核獸', emoji: '🌟', pair: ['chemphys', 'earth'],
      bornLine: '胸口嵌著一顆微型恆星，把物質的規律與星空的尺度收進同一副身軀。' },
  ];
  const CUB_BY_PAIR = new Map(CUBS.map((cub) => [pairKey(cub.pair[0], cub.pair[1]), cub]));
  const CUB_BY_ID = new Map(CUBS.map((cub) => [cub.id, cub]));

  function cubForPair(a, b) {
    return CUB_BY_PAIR.get(pairKey(a, b)) || null;
  }

  // 終局融合：集滿六稚靈（＝全四科各精通滿階＋近期正確率達標）後迎接的元靈聖獸。
  // 這是收藏天花板的頂點，掛在真實學習量上；一次性、保證成功、不再賭博。
  const GRAND = {
    id: 'cub_primordial', name: '元靈聖獸', emoji: '🌌',
    bornLine: '六隻稚靈的光在牠身上重新匯流，自然、生命、物質與大地的規律，終於在同一顆心跳裡合而為一。',
  };
  const GRAND_COST = 100;

  function canFuseGrand(fstate) {
    const reasons = [];
    const hatched = Array.isArray(fstate.hatched) ? fstate.hatched : [];
    const missing = CUBS.filter((cub) => !hatched.includes(cub.id)).length;
    if (missing > 0) reasons.push(`cubs:${missing}`);
    if (fstate.grandBorn) reasons.push('already-grand');
    return { ok: reasons.length === 0, reasons, missing };
  }

  function fuseGrand(fstate) {
    const gate = canFuseGrand(fstate);
    if (!gate.ok) return { ok: false, reason: 'ineligible', reasons: gate.reasons };
    const paid = spendCrystals(GRAND_COST);
    if (!paid.ok) return { ok: false, reason: 'crystals' };
    fstate.grandBorn = true;
    return { ok: true, result: 'success', fstate, grand: { ...GRAND } };
  }

  // 科學守護者巡禮：純正向紀念冊資料（四科滿階精靈＋六稚靈誕生語＋元靈＋旅程統計）。
  // 只讀既有學習統計，不含任何 reset／倒數／掉段語意。
  function buildPrestigeData(fstate, state, opts = {}) {
    const maxBox = opts && Number.isFinite(opts.maxBox) ? opts.maxBox : 4;
    const mastered = SciBattle.masteredBySubject(state, maxBox);
    const spirits = SUBJECT_ORDER.map((key) => {
      const count = mastered[key] || 0;
      const spirit = SciBattle.companionForSubject(key, count);
      return {
        key, label: SUBJECT_LABELS[key] || key, mastered: count,
        spiritName: spirit.name, spiritEmoji: spirit.emoji, level: spirit.level,
      };
    });
    const hatched = Array.isArray(fstate.hatched) ? fstate.hatched : [];
    const cubs = CUBS.map((cub) => ({
      id: cub.id, name: cub.name, emoji: cub.emoji, bornLine: cub.bornLine,
      owned: hatched.includes(cub.id),
      displayName: (fstate.nicknames && fstate.nicknames[cub.id]) || cub.name,
    }));
    const totalMastered = spirits.reduce((sum, item) => sum + item.mastered, 0);
    return {
      grandBorn: !!fstate.grandBorn,
      grand: { ...GRAND },
      spirits,
      cubs,
      cubCount: cubs.filter((cub) => cub.owned).length,
      totalMastered,
    };
  }

  function canFuse(meta, state, subjA, subjB) {
    const maxBox = meta && Number.isFinite(meta.maxBox) ? meta.maxBox : 4;
    const reasons = [];
    if (subjA === subjB) reasons.push('same-subject');
    const mastered = SciBattle.masteredBySubject(state, maxBox);
    [subjA, subjB].forEach((subject) => {
      if ((mastered[subject] || 0) < MASTER_GATE && !reasons.includes(`master:${subject}`)) {
        reasons.push(`master:${subject}`);
      }
      const accuracy = accuracyBySubject(state, subject);
      if ((accuracy.total < ACC_MIN_SAMPLE || accuracy.accuracy < ACC_GATE)
        && !reasons.includes(`accuracy:${subject}`)) {
        reasons.push(`accuracy:${subject}`);
      }
    });
    if (subjA !== subjB) {
      const cub = cubForPair(subjA, subjB);
      if (cub && load().hatched.includes(cub.id)) reasons.push('already-hatched');
    }
    return { ok: reasons.length === 0, reasons };
  }

  function fuse(fstate, state, subjA, subjB, opts = {}) {
    const { rng = Math.random, today = '', meta = { maxBox: 4 } } = opts;
    const gate = canFuse(meta, state, subjA, subjB);
    if (!gate.ok) return { ok: false, reason: 'ineligible', reasons: gate.reasons };
    if (fstate.lastFuseDate !== today) {
      fstate.lastFuseDate = today;
      fstate.fuseCount = 0;
    }
    if (fstate.fuseCount >= MAX_FUSE_PER_DAY) return { ok: false, reason: 'daily-limit' };
    const cub = cubForPair(subjA, subjB);
    if (!cub) return { ok: false, reason: 'ineligible' };
    const paid = spendCrystals(FUSE_COST);
    if (!paid.ok) return { ok: false, reason: 'crystals' };
    fstate.fuseCount += 1;
    if (rng() < FAIL_RATE) {
      const refund = Math.floor(FUSE_COST / 2);
      refundCrystals(refund);
      fstate.failStreak = (fstate.failStreak || 0) + 1;
      return { ok: true, result: 'fail', line: failLine(fstate), refund, fstate };
    }
    fstate.hatched.push(cub.id);
    fstate.failStreak = 0;
    fstate.lastFuseDate = today;
    return {
      ok: true,
      result: 'success',
      fstate,
      cub: { id: cub.id, name: cub.name, emoji: cub.emoji, bornLine: cub.bornLine, pair: cub.pair.slice() },
    };
  }

  function listCubs(fstate) {
    return fstate.hatched.map((id) => {
      const cub = CUB_BY_ID.get(id);
      if (!cub) return null;
      const nickname = fstate.nicknames[id] || '';
      return {
        id,
        name: cub.name,
        emoji: cub.emoji,
        pair: cub.pair.slice(),
        nickname,
        displayName: nickname || cub.name,
        isActive: fstate.activeCub === id,
      };
    }).filter(Boolean);
  }

  function isRevealed(fstate, a, b) {
    return fstate.revealed.includes(pairKey(a, b));
  }

  function revealPair(fstate, a, b) {
    const key = pairKey(a, b);
    if (!fstate.revealed.includes(key)) fstate.revealed.push(key);
    return { fstate, revealed: true };
  }

  function pickRevealTarget(pool, rng) {
    const advanced = pool.filter((term) => term.advanced);
    const candidates = advanced.length ? advanced : pool;
    return candidates[Math.floor(rng() * candidates.length)] || pool[0];
  }

  function buildRevealQuestion(a, b, poolsBySubject, rng = Math.random) {
    const subjects = pairKey(a, b).split('+');
    const subject = subjects[Math.floor(rng() * subjects.length)] || subjects[0];
    const pool = (poolsBySubject && poolsBySubject[subject]) || [];
    const target = pickRevealTarget(pool, rng);
    return { subject, question: SciQuiz.buildQuestion(target, pool) };
  }

  function getFusionPreview(fstate, a, b) {
    if (!isRevealed(fstate, a, b)) return { known: false };
    const cub = cubForPair(a, b);
    return cub
      ? { known: true, cub: { id: cub.id, name: cub.name, emoji: cub.emoji, bornLine: cub.bornLine } }
      : { known: false };
  }

  const CUB_ASSIST = { atk: 3, leech: 4, leechChance: 0.15, atkCap: 5 };

  function setActiveCub(fstate, cubId) {
    if (!fstate.hatched.includes(cubId)) return { fstate, ok: false, reason: 'not-owned' };
    fstate.activeCub = cubId;
    return { fstate, ok: true, reason: null };
  }

  function clearActiveCub(fstate) {
    fstate.activeCub = '';
    return { fstate, ok: true };
  }

  function cubBattleMods(fstate) {
    if (!fstate.activeCub || !fstate.hatched.includes(fstate.activeCub)) {
      return { atk: 0, leech: 0, leechChance: 0 };
    }
    return {
      atk: Math.min(CUB_ASSIST.atk, CUB_ASSIST.atkCap),
      leech: CUB_ASSIST.leech,
      leechChance: CUB_ASSIST.leechChance,
    };
  }

  const SUBJECT_LABELS = {
    nature: '國小自然', biology: '國中生物', chemphys: '國中理化', earth: '國中地科',
  };
  const NICK_PREFIXES = ['小', '阿', '靈', '晶', '森', '風', '星', '海'];
  const NICK_SUFFIXES = ['寶', '仔', '靈', '兒', '醬', '君'];
  const NICK_SET = new Set();
  NICK_PREFIXES.forEach((prefix) => NICK_SUFFIXES.forEach((suffix) => NICK_SET.add(prefix + suffix)));

  function composeNickname(prefixIndex, suffixIndex) {
    const prefix = NICK_PREFIXES[prefixIndex];
    const suffix = NICK_SUFFIXES[suffixIndex];
    return prefix && suffix ? prefix + suffix : '';
  }

  function setNickname(fstate, cubId, nickname) {
    if (!fstate.hatched.includes(cubId)) return { fstate, ok: false, reason: 'not-owned' };
    const next = String(nickname);
    if (!next) {
      delete fstate.nicknames[cubId];
      return { fstate, ok: true, reason: null };
    }
    if (!NICK_SET.has(next)) return { fstate, ok: false, reason: 'not-allowed' };
    fstate.nicknames[cubId] = next;
    return { fstate, ok: true, reason: null };
  }

  function buildCubCardData(fstate, cubId, opts = {}) {
    if (!fstate.hatched.includes(cubId)) return null;
    const cub = CUB_BY_ID.get(cubId);
    if (!cub) return null;
    const nickname = fstate.nicknames[cubId] || '';
    return {
      id: cubId,
      name: cub.name,
      displayName: nickname || cub.name,
      emoji: cub.emoji,
      parents: cub.pair.map((key) => ({ key, label: SUBJECT_LABELS[key] || key })),
      bornLine: cub.bornLine,
      cubCount: fstate.hatched.length,
      rankLabel: opts.rankLabel || '',
    };
  }

  return {
    KEY, defaults, load, save, crystalBalance, spendCrystals, refundCrystals,
    MASTER_GATE, ACC_GATE, ACC_WINDOW, ACC_MIN_SAMPLE, SUBJECT_ORDER,
    pairKey, accuracyBySubject, canFuse,
    CUBS, cubForPair, FUSE_COST, FAIL_RATE, fuse, listCubs,
    GRAND, GRAND_COST, canFuseGrand, fuseGrand, buildPrestigeData,
    MAX_FUSE_PER_DAY, FAIL_LINES, failLine,
    isRevealed, revealPair, buildRevealQuestion, getFusionPreview,
    setActiveCub, clearActiveCub, cubBattleMods,
    SUBJECT_LABELS, NICK_PREFIXES, NICK_SUFFIXES, composeNickname, setNickname, buildCubCardData,
  };
})();
