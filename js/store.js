// localStorage 存檔層。比照字鬥英雄 store.js 精簡版：每詞一筆 SRS 紀錄 + 全域統計。
const SciStore = (() => {
  const KEY = 'science-hero:v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
      const parsed = JSON.parse(raw);
      parsed.cards = parsed.cards || {};
      parsed.stats = parsed.stats || { streakDays: 0, lastActiveDate: null, totalReviews: 0 };
      return parsed;
    } catch {
      return { cards: {}, stats: { streakDays: 0, lastActiveDate: null, totalReviews: 0 } };
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getCard(state, id) {
    return state.cards[id] || { box: 0, due: 0, seen: 0, wrong: 0 };
  }

  function setCard(state, id, card) {
    state.cards[id] = card;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function touchDailyStreak(state) {
    const today = todayStr();
    if (state.stats.lastActiveDate === today) return;
    // 累計型：每逢新的活躍日 +1，永不歸零。刻意不做「連續」重置——
    // 「連續 N 天、斷了砍回 1」是損失趨避型黑帽鉤子，對兒童不負責任；
    // 改成單調累加的「累計練習天數」，保留正向累積感、拿掉損失威脅。
    state.stats.streakDays = (state.stats.streakDays || 0) + 1;
    state.stats.lastActiveDate = today;
  }

  function exportState(state) {
    return JSON.stringify({
      version: 2,
      core: state,
      econ: typeof SciEconomy !== 'undefined' ? SciEconomy.exportState() : null,
      fusion: typeof SciFusionStore !== 'undefined' ? SciFusionStore.exportState() : null,
      base: typeof SciBaseStore !== 'undefined' ? SciBaseStore.exportState() : null,
      market: typeof SciMarketStore !== 'undefined' ? SciMarketStore.exportState() : null,
    }, null, 2);
  }

  function importState(json) {
    const imported = JSON.parse(json);
    if (imported && Object.prototype.hasOwnProperty.call(imported, 'version') && imported.version !== 2) {
      throw new TypeError('不支援的進度檔版本');
    }
    const parsed = imported && imported.version === 2 ? imported.core : imported;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('進度檔格式不正確');
    parsed.cards = parsed.cards || {};
    parsed.stats = parsed.stats || { streakDays: 0, lastActiveDate: null, totalReviews: 0 };
    // 匯入時把 SRS 欄位夾回合法範圍，擋掉最粗糙的越界偽造
    //（例如手改匯出檔把每張卡設成超高 box 假裝精通）。純前端無法根絕作弊，但至少不放行明顯造假。
    for (const id of Object.keys(parsed.cards)) {
      const card = parsed.cards[id] || {};
      card.box = Math.max(0, Math.min(4, Math.round(Number(card.box) || 0)));
      card.seen = Math.max(0, Math.round(Number(card.seen) || 0));
      card.wrong = Math.max(0, Math.round(Number(card.wrong) || 0));
      card.due = Number(card.due) || 0;
      parsed.cards[id] = card;
    }
    if (imported && imported.version === 2) {
      if (typeof SciEconomy !== 'undefined' && imported.econ) SciEconomy.importState(imported.econ);
      if (typeof SciFusionStore !== 'undefined' && imported.fusion) SciFusionStore.importState(imported.fusion);
      if (typeof SciBaseStore !== 'undefined' && imported.base) SciBaseStore.importState(imported.base);
      if (typeof SciMarketStore !== 'undefined' && imported.market) SciMarketStore.importState(imported.market);
    }
    return parsed;
  }

  function bumpDailyCount(state) {
    const today = todayStr();
    if (!state.stats.dailyReviews || state.stats.dailyReviews.date !== today) {
      state.stats.dailyReviews = { date: today, count: 0 };
    }
    state.stats.dailyReviews.count += 1;
  }

  return { load, save, getCard, setCard, touchDailyStreak, todayStr, exportState, importState, bumpDailyCount };
})();
