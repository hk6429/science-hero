// 科學基地純邏輯層：擺設/樣式/門牌/慶典狀態（自有 key sci_base）。
// 主樓/展館/裝飾/成就牆一律由 science-hero:v1 與 sci_econ 唯讀 derive，本模組絕不寫回它們。零 DOM。
const SciBaseStore = (() => {
  const BASE_KEY = 'sci_base';
  const RESEARCH_DONATION_COST = 50;

  function defaultBase() {
    return { v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [], researchDonations: 0 };
  }

  function loadBase() {
    const def = defaultBase();
    try {
      const parsed = JSON.parse(localStorage.getItem(BASE_KEY));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return def;
      const merged = { ...def, ...parsed, v: 1 };
      if (!Array.isArray(merged.celebrated)) merged.celebrated = [];
      merged.researchDonations = Math.max(0, Math.floor(Number(merged.researchDonations) || 0));
      return merged;
    } catch { return def; }
  }

  function saveBase(state) {
    try { localStorage.setItem(BASE_KEY, JSON.stringify(state)); return true; } catch { return false; }
  }

  // 主樓階梯：門檻鏡射 app.js RANK_TIERS（SciApp 私有無法引用）；測試已釘死，改 RANK_TIERS 必同步
  const STAGES = [
    [0, '見習營帳'], [1, '初階研究站'], [10, '進階實驗樓'], [30, '資深研究院'], [80, '領域總部'],
    [120, '學者研究院'], [200, '科學殿堂'], [300, '宗師天文臺'], [400, '科學典藏館'],
    [550, '星海研究總部'], [700, '萬象觀測城'], [850, '宇宙探索基地'], [1000, '科學大典藏館'],
  ];

  function maxBox() { return SciFlashcard.BOX_INTERVAL_DAYS.length - 1; }

  function countMastered(state) {
    return Object.values((state && state.cards) || {}).filter((c) => c.box >= maxBox()).length;
  }

  function mainStage(masteredCount) {
    const n = masteredCount || 0;
    let i = 0;
    while (i + 1 < STAGES.length && n >= STAGES[i + 1][0]) i++;
    const next = STAGES[i + 1] || null;
    return { stage: i, name: STAGES[i][1], at: STAGES[i][0], next: next ? { at: next[0], name: next[1] } : null };
  }

  // 四科展館：讀該科精通% 換繁茂度五級（門檻 0/10/30/60/100，鼎盛=全科精通）
  const PAVILIONS = [
    { key: 'nature', name: '自然園圃', emoji: '🌱' },
    { key: 'biology', name: '生物標本館', emoji: '🔬' },
    { key: 'chemphys', name: '理化實驗室', emoji: '⚗️' },
    { key: 'earth', name: '地科天文台', emoji: '🔭' },
  ];
  const FLOURISH_TIERS = ['荒蕪', '初萌', '漸盛', '繁茂', '鼎盛'];
  const FLOURISH_AT = [0, 10, 30, 60, 100];

  function flourishTier(pct) {
    let tier = 0;
    for (let i = 1; i < FLOURISH_AT.length; i++) if (pct >= FLOURISH_AT[i]) tier = i;
    return tier;
  }

  function getPavilions(state, termsBySubject) {
    return PAVILIONS.map((p) => {
      const list = (termsBySubject && termsBySubject[p.key]) || [];
      const done = list.filter((term) => {
        const card = state && state.cards ? state.cards[term.id] : null;
        return card && card.box >= maxBox();
      }).length;
      const total = list.length;
      const pct = total ? Math.floor(done / total * 100) : 0;
      const tier = flourishTier(pct);
      return { ...p, done, total, pct, tier, tierName: FLOURISH_TIERS[tier] };
    });
  }

  // 詞卡實體化：精通卡 → 展館裝飾。品階看煉成過程，主題看科別
  const DECOR_THEMES = {
    nature: { name: '植栽昆蟲箱', emoji: '🪴' },
    biology: { name: '標本罐顯微鏡', emoji: '🧫' },
    chemphys: { name: '燒杯儀器', emoji: '🧪' },
    earth: { name: '礦石星象儀', emoji: '🪨' },
  };
  const GRADES = [{ id: 'gold', name: '金級' }, { id: 'silver', name: '銀級' }, { id: 'bronze', name: '銅級' }];
  const GRADE_ORDER = { gold: 0, silver: 1, bronze: 2 };
  const DECOR_CAP = 12;

  function gradeOf(card) {
    if (card.wrong === 0) return 'gold';
    if (card.wrong === 1) return 'silver';
    return 'bronze';
  }

  function masteredOf(state, list) {
    const mb = maxBox();
    return list
      .map((t) => ({ term: t, card: state.cards[t.id] }))
      .filter((x) => x.card && x.card.box >= mb);
  }

  // 自由擺放：依 id hash 的確定性散佈（FNV-1a）＋自訂座標（百分比 2–98）
  const clampPct = (v) => Math.max(2, Math.min(98, v));

  function idHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const DECOR_BANDS = {
    nature: { x0: 6, x1: 40, y0: 8, y1: 38 },
    biology: { x0: 60, x1: 94, y0: 8, y1: 38 },
    chemphys: { x0: 6, x1: 40, y0: 62, y1: 92 },
    earth: { x0: 60, x1: 94, y0: 62, y1: 92 },
  };

  function defaultPos(subjectKey, decorId) {
    const b = DECOR_BANDS[subjectKey] || DECOR_BANDS.nature;
    const h = idHash(decorId);
    const x = b.x0 + (h % 1000) / 1000 * (b.x1 - b.x0);
    const y = b.y0 + (Math.floor(h / 1000) % 1000) / 1000 * (b.y1 - b.y0);
    return { x: Math.round(clampPct(x) * 10) / 10, y: Math.round(clampPct(y) * 10) / 10 };
  }

  function placeDecor(base, decorId, x, y) {
    if (!String(decorId).startsWith('d-')) return { ok: false, msg: '無效的裝飾' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, msg: '無效的座標' };
    base.placements[decorId] = { x: clampPct(x), y: clampPct(y) };
    return { ok: true };
  }

  function resetPlacements(base) {
    base.placements = {};
    return { ok: true };
  }

  function getDecorations(state, termsBySubject, base) {
    const out = [];
    for (const p of PAVILIONS) {
      const mastered = masteredOf(state, (termsBySubject && termsBySubject[p.key]) || [])
        .sort((a, b) => (GRADE_ORDER[gradeOf(a.card)] - GRADE_ORDER[gradeOf(b.card)]) || (a.term.id < b.term.id ? -1 : 1))
        .slice(0, DECOR_CAP);
      mastered.forEach(({ term, card }) => {
        const grade = gradeOf(card);
        const id = `d-${term.id}`;
        const saved = base && base.placements ? base.placements[id] : null;
        const pos = saved || defaultPos(p.key, id);
        out.push({
          id, termId: term.id, term: term.term, subject: p.key,
          theme: DECOR_THEMES[p.key].name, themeEmoji: DECOR_THEMES[p.key].emoji,
          grade, gradeName: GRADES.find((g) => g.id === grade).name,
          styleIdx: styleOf(base, p.key),
          x: pos.x, y: pos.y, custom: !!saved,
        });
      });
    }
    return out;
  }

  function decorSummary(state, termsBySubject) {
    const out = {};
    for (const p of PAVILIONS) {
      const stats = { gold: 0, silver: 0, bronze: 0 };
      const mastered = masteredOf(state, (termsBySubject && termsBySubject[p.key]) || []);
      for (const item of mastered) stats[gradeOf(item.card)] += 1;
      const total = mastered.length;
      const shown = Math.min(DECOR_CAP, total);
      out[p.key] = { ...stats, total, shown, hidden: total - shown };
    }
    return out;
  }

  // 門牌／銘言：預設詞庫選用，不開放自由輸入
  const PLAQUE_TARGETS = ['main', 'nature', 'biology', 'chemphys', 'earth'];
  const DEFAULT_PLAQUES = {
    main: '科學研究基地', nature: '自然園圃', biology: '生物標本館', chemphys: '理化實驗室', earth: '地科天文台',
  };
  const PLAQUE_BANK = [
    { id: 'xing', w: '星辰' }, { id: 'guang', w: '光譜' }, { id: 'liang', w: '量子' }, { id: 'yuan', w: '元素' },
    { id: 'jing', w: '晶能' }, { id: 'tan', w: '探索' }, { id: 'zhi', w: '智慧' }, { id: 'chuang', w: '創想' },
    { id: 'wei', w: '微光' }, { id: 'hong', w: '洪流' }, { id: 'di', w: '地心' }, { id: 'hai', w: '深海' },
    { id: 'feng', w: '季風' }, { id: 'lin', w: '森林' }, { id: 'huo', w: '火山' }, { id: 'bing', w: '冰晶' },
    { id: 'xueyuan', w: '學苑' }, { id: 'shiyan', w: '實驗' }, { id: 'yanjiu', w: '研究' }, { id: 'guance', w: '觀測' },
    { id: 'jidi', w: '基地' }, { id: 'zhongxin', w: '中心' }, { id: 'gongfang', w: '工坊' }, { id: 'xuetang', w: '學堂' },
  ];
  const PLAQUE_MIN = 1;
  const PLAQUE_MAX = 2;
  const PLAQUE_W = new Map(PLAQUE_BANK.map((w) => [w.id, w.w]));

  const MOTTO_BANK = [
    { id: 'm1', text: '大膽假設，小心求證' },
    { id: 'm2', text: '每一次答錯，都是一筆實驗數據' },
    { id: 'm3', text: '觀察是科學的第一步' },
    { id: 'm4', text: '今天的疑問，是明天的發現' },
    { id: 'm5', text: '精通不是天分，是複習的次數' },
    { id: 'm6', text: '仰望星空，腳踏實地' },
  ];
  const MOTTO_BY_ID = new Map(MOTTO_BANK.map((m) => [m.id, m]));

  const STYLE_SHOP = {
    nature: [{ name: '素陶盆栽', cost: 0 }, { name: '螢光溫室', cost: 30 }, { name: '雨林生態缸', cost: 60 }],
    biology: [{ name: '玻璃標本罐', cost: 0 }, { name: '黃銅顯微鏡', cost: 30 }, { name: '全息細胞儀', cost: 60 }],
    chemphys: [{ name: '基礎燒杯組', cost: 0 }, { name: '螺旋蒸餾塔', cost: 30 }, { name: '電漿反應爐', cost: 60 }],
    earth: [{ name: '礦石標本座', cost: 0 }, { name: '青銅渾天儀', cost: 30 }, { name: '星空投影儀', cost: 60 }],
  };

  function setPlaque(base, targetId, wordIds) {
    if (!PLAQUE_TARGETS.includes(targetId)) return { ok: false, msg: '無效的門牌對象' };
    if (!Array.isArray(wordIds) || wordIds.length < PLAQUE_MIN || wordIds.length > PLAQUE_MAX) return { ok: false, msg: `請選 ${PLAQUE_MIN}–${PLAQUE_MAX} 個詞` };
    if (!wordIds.every((id) => PLAQUE_W.has(id))) return { ok: false, msg: '門牌只能選用詞庫' };
    base.plaques[targetId] = wordIds.slice();
    return { ok: true };
  }

  function getPlaqueText(base, targetId) {
    const ids = base && base.plaques ? base.plaques[targetId] : null;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => PLAQUE_W.has(id))) return DEFAULT_PLAQUES[targetId] || '';
    return ids.map((id) => PLAQUE_W.get(id)).join('');
  }

  function setMotto(base, mottoId) {
    if (mottoId === null) { delete base.plaques.motto; return { ok: true }; }
    if (!MOTTO_BY_ID.has(mottoId)) return { ok: false, msg: '無效的銘言' };
    base.plaques.motto = [mottoId];
    return { ok: true };
  }

  function getMotto(base) {
    const ids = base && base.plaques ? base.plaques.motto : null;
    return Array.isArray(ids) && MOTTO_BY_ID.has(ids[0]) ? MOTTO_BY_ID.get(ids[0]) : null;
  }

  function styleState(base, subjectKey) {
    if (!base.styles[subjectKey] || typeof base.styles[subjectKey] !== 'object') base.styles[subjectKey] = { owned: [0], active: 0 };
    const s = base.styles[subjectKey];
    if (!Array.isArray(s.owned)) s.owned = [0];
    if (!s.owned.includes(0)) s.owned.push(0);
    return s;
  }

  function styleOf(base, subjectKey) {
    const shop = STYLE_SHOP[subjectKey];
    const saved = base && base.styles ? base.styles[subjectKey] : null;
    return shop && saved && Number.isInteger(saved.active) && saved.active >= 0 && saved.active < shop.length && Array.isArray(saved.owned) && saved.owned.includes(saved.active)
      ? saved.active
      : 0;
  }

  function buyStyle(base, subjectKey, styleIdx) {
    const shop = STYLE_SHOP[subjectKey];
    if (!shop || !Number.isInteger(styleIdx) || !shop[styleIdx]) return { ok: false, msg: '沒有這個樣式' };
    const s = styleState(base, subjectKey);
    if (s.owned.includes(styleIdx)) {
      s.active = styleIdx;
      return { ok: true, balance: SciEconomy.getBalance() };
    }
    const paid = SciEconomy.spendCrystals(shop[styleIdx].cost, `style:${subjectKey}`);
    if (!paid.ok) return paid;
    s.owned.push(styleIdx);
    s.active = styleIdx;
    return { ok: true, balance: paid.balance };
  }

  // 可重複的晶能出口：晶能仍只從既有學習行為取得；捐獻不新增任何收入。
  function donateResearch(base) {
    const paid = SciEconomy.spendCrystals(RESEARCH_DONATION_COST, 'research-donation');
    if (!paid.ok) return paid;
    base.researchDonations = Math.max(0, Math.floor(Number(base.researchDonations) || 0)) + 1;
    return { ok: true, balance: paid.balance, donations: base.researchDonations, spent: RESEARCH_DONATION_COST };
  }

  // 慶典佇列：主樓升階/展館升級/新金級裝飾各慶祝一次（只加不扣，白帽）
  function pendingCelebrations(state, termsBySubject, base) {
    const out = [];
    const seen = new Set(base.celebrated);
    const main = mainStage(countMastered(state));
    for (let s = 1; s <= main.stage; s++) {
      const id = `stage-${s}`;
      if (!seen.has(id)) out.push({ id, type: 'stage', title: `基地升階・${STAGES[s][1]}`, text: `精通突破 ${STAGES[s][0]} 張——你的研究基地擴建完成！` });
    }
    for (const p of getPavilions(state, termsBySubject)) {
      for (let t = 1; t <= p.tier; t++) {
        const id = `pav-${p.key}-t${t}`;
        if (!seen.has(id)) out.push({ id, type: 'pav', title: `展館升級・${p.name}`, text: `${p.name}進入「${FLOURISH_TIERS[t]}」——這一科的版圖越來越完整了。` });
      }
    }
    for (const d of getDecorations(state, termsBySubject, base)) {
      if (d.grade !== 'gold') continue;
      const id = `gold-${d.termId}`;
      if (!seen.has(id)) out.push({ id, type: 'gold', title: `金級入館・${d.term}`, text: `「${d.term}」零錯煉成，化為${d.theme}的金級珍藏！` });
    }
    return out;
  }

  function markCelebrated(base, celebId) {
    if (!base.celebrated.includes(celebId)) base.celebrated.push(celebId);
    return base;
  }

  function isSeeded(base) { return base.celebrated.includes('_seeded'); }

  function seedCelebrated(state, termsBySubject, base) {
    for (const p of pendingCelebrations(state, termsBySubject, base)) markCelebrated(base, p.id);
    markCelebrated(base, '_seeded');
    return base;
  }

  function getWall(state, base = defaultBase()) {
    const rank = (state && state.rank) || { pts: 0, peak: 0 };
    const peak = rank.peak || 0;
    let rankValue = '尚未出戰';
    if ((rank.pts || 0) > 0 || peak > 0) {
      let i = 0;
      while (i + 1 < SciBattle.RANKS.length && peak >= SciBattle.RANKS[i + 1].at) i++;
      const info = SciBattle.RANKS[i];
      rankValue = `${info.ico} ${info.name}（${peak} 分）`;
    }
    return [
      { icon: '🏆', label: '段位巔峰', value: rankValue },
      { icon: '🔥', label: '最高連對', value: `${SciEconomy.getBestCombo()} 題` },
      { icon: '📅', label: '累計天數', value: `${(state && state.stats && state.stats.streakDays) || 0} 天` },
      { icon: '♾️', label: '無盡巡禮最佳', value: `${(state && state.battle && state.battle.endlessBest) || 0} 連勝` },
    ];
  }

  function getBaseView(state, termsBySubject, base) {
    const masteredCount = countMastered(state);
    const plaques = {};
    for (const target of PLAQUE_TARGETS) plaques[target] = getPlaqueText(base, target);
    return {
      main: { ...mainStage(masteredCount), masteredCount },
      pavilions: getPavilions(state, termsBySubject),
      decorations: getDecorations(state, termsBySubject, base),
      summary: decorSummary(state, termsBySubject),
      plaques,
      motto: getMotto(base),
      balance: SciEconomy.getBalance(),
      wall: getWall(state, base),
    };
  }

  return {
    BASE_KEY, RESEARCH_DONATION_COST, defaultBase, loadBase, saveBase,
    STAGES, countMastered, mainStage,
    PAVILIONS, FLOURISH_TIERS, flourishTier, getPavilions,
    DECOR_THEMES, GRADES, gradeOf, DECOR_CAP, getDecorations, decorSummary,
    idHash, defaultPos, placeDecor, resetPlacements,
    PLAQUE_TARGETS, PLAQUE_BANK, PLAQUE_MIN, PLAQUE_MAX, setPlaque, getPlaqueText,
    MOTTO_BANK, setMotto, getMotto,
    STYLE_SHOP, styleOf, buyStyle, donateResearch,
    pendingCelebrations, markCelebrated, seedCelebrated, isSeeded, getWall, getBaseView,
  };
})();
