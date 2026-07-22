// 晶能經濟：全站唯一收支入口。key sci_econ。收入掛真實學習量，每日上限 100（'achievement' 不計）。
const SciEconomy = (() => {
  const KEY = 'sci_econ';
  const DAILY_CAP = 100;
  const MAX_BALANCE = 999999;
  // 退款與市集錢包出金不是新產出的晶能，不佔每日獲取額度。
  const UNCAPPED = new Set(['achievement', 'fusion-refund', 'mkt-withdraw', 'mkt-refund']);
  const EARN_TABLE = { answer: 1, combo: 1, battleWin: 5, master: 3 };

  function defaultEcon() {
    return { v: 1, balance: 0, daily: { date: null, earned: 0 }, combo: 0, bestCombo: 0 };
  }

  const clampInt = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));

  function sanitize(value) {
    const def = defaultEcon();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return def;
    const daily = value.daily && typeof value.daily === 'object' && !Array.isArray(value.daily) ? value.daily : {};
    return {
      v: 1,
      balance: clampInt(value.balance, MAX_BALANCE),
      daily: {
        date: typeof daily.date === 'string' ? daily.date : null,
        earned: clampInt(daily.earned, DAILY_CAP),
      },
      combo: clampInt(value.combo, 9999),
      bestCombo: clampInt(value.bestCombo, 9999),
    };
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function load() {
    const def = defaultEcon();
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return sanitize(parsed);
    } catch { return def; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(econ)); return true; } catch { return false; }
  }

  let econ = null;
  function state() {
    if (!econ) econ = load();
    return econ;
  }

  function rollDaily(e) {
    const today = todayStr();
    if (e.daily.date !== today) e.daily = { date: today, earned: 0 };
  }

  function earnCrystals(n, reason) {
    const e = state();
    rollDaily(e);
    let amount = Math.max(0, Math.floor(n) || 0);
    let capped = false;
    if (!UNCAPPED.has(reason)) {
      const room = Math.max(0, DAILY_CAP - e.daily.earned);
      if (amount > room) { amount = room; capped = true; }
      if (e.daily.earned >= DAILY_CAP) capped = true;
      e.daily.earned += amount;
    }
    e.balance += amount;
    save();
    return { ok: true, earned: amount, balance: e.balance, capped };
  }

  function spendCrystals(n, reason) {
    const e = state();
    const amount = Math.max(0, Math.floor(n) || 0);
    if (e.balance < amount) return { ok: false, msg: '晶能不足', balance: e.balance };
    e.balance -= amount;
    save();
    return { ok: true, balance: e.balance };
  }

  function getBalance() { return state().balance; }
  function getBestCombo() { return state().bestCombo; }

  function exportState() { return { ...state(), daily: { ...state().daily } }; }

  function importState(value) {
    econ = sanitize(value);
    save();
    return exportState();
  }

  // 唯一作答掛鉤：app.js recordAnswer() 每答一題呼叫一次
  function onAnswer(correct, prevBox, newBox) {
    const e = state();
    if (!correct) {
      e.combo = 0;
      save();
      return { earned: 0, combo: 0 };
    }
    e.combo += 1;
    e.bestCombo = Math.max(e.bestCombo, e.combo);
    let total = earnCrystals(EARN_TABLE.answer, 'answer').earned;
    if (e.combo >= 3) total += earnCrystals(EARN_TABLE.combo, 'combo').earned;
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    if (newBox === maxBox && prevBox < maxBox) total += earnCrystals(EARN_TABLE.master, 'master').earned;
    save();
    return { earned: total, combo: e.combo };
  }

  return { earnCrystals, spendCrystals, getBalance, getBestCombo, onAnswer, exportState, importState, EARN_TABLE, DAILY_CAP, MAX_BALANCE };
})();
