// 科學市集純前端狀態。常數複本須與 functions/lib/market-core.js 同步，測試會鎖漂移。
const SciMarketStore = (() => {
  const KEY = 'sci_market';
  const DAILY_BUY_CAP = 3;
  const MAX_ITEM_COUNT = 99;
  const ITEM_CATALOG = {
    energy: { name: '能量飲', emoji: '⚡', kind: 'tool', base: 30 },
    magnifier: { name: '放大鏡', emoji: '🔍', kind: 'tool', base: 40 },
    goggles: { name: '護目鏡', emoji: '🥽', kind: 'tool', base: 60 },
  };
  const TIER_LABEL = { bronze: '銅品', silver: '銀品', gold: '金品' };
  const THANKS_CARDS = [
    { id: 1, text: '謝謝你！這件寶物我會好好用在實驗裡！' },
    { id: 2, text: '市集有你真好，交易愉快！' },
    { id: 3, text: '價格真公道，讚！' },
    { id: 4, text: '正好缺這件，救了我這一場！' },
    { id: 5, text: '祝你下次對戰旗開得勝！' },
    { id: 6, text: '同班的科學夥伴，就是可靠！' },
    { id: 7, text: '你的基地一定蓋得很棒！' },
    { id: 8, text: '一起成為科學英雄吧！' },
  ];
  const TOOL_EFFECTS = {
    energy: { hp: 10 },
    magnifier: { excludeOnce: true },
    goggles: { shieldOnce: true },
  };

  const empty = () => ({ inv: {}, claims: [], buys: { date: '', n: 0 }, ever: [], carry: null });
  function sanitizeState(value) {
    const next = empty();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return next;
    if (value.inv && typeof value.inv === 'object' && !Array.isArray(value.inv)) {
      for (const id of Object.keys(ITEM_CATALOG)) {
        const count = Math.max(0, Math.min(MAX_ITEM_COUNT, Math.floor(Number(value.inv[id]) || 0)));
        if (count > 0) next.inv[id] = count;
      }
    }
    next.claims = (Array.isArray(value.claims) ? value.claims : [])
      .filter((claim) => claim && typeof claim.id === 'string' && ITEM_CATALOG[claim.itemId])
      .slice(0, 100);
    if (value.buys && typeof value.buys === 'object' && !Array.isArray(value.buys)) {
      next.buys = {
        date: typeof value.buys.date === 'string' ? value.buys.date : '',
        n: Math.max(0, Math.min(DAILY_BUY_CAP, Math.floor(Number(value.buys.n) || 0))),
      };
    }
    next.ever = (Array.isArray(value.ever) ? value.ever : [])
      .filter((entry) => entry && ITEM_CATALOG[entry.itemId] && ['sold', 'bought'].includes(entry.dir))
      .slice(0, 100)
      .map((entry) => ({ itemId: entry.itemId, dir: entry.dir, peer: String(entry.peer || ''), ts: Number(entry.ts) || Date.now() }));
    next.carry = typeof value.carry === 'string' && ITEM_CATALOG[value.carry]?.kind === 'tool' && next.inv[value.carry] > 0
      ? value.carry
      : null;
    return next;
  }
  function load() {
    try {
      return sanitizeState(JSON.parse(localStorage.getItem(KEY)));
    } catch { return empty(); }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }
  function dayStr(nowMs = Date.now()) {
    return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function tierOf(itemId) {
    const item = ITEM_CATALOG[itemId];
    if (!item) return null;
    return item.base < 80 ? 'bronze' : item.base <= 200 ? 'silver' : 'gold';
  }
  function bandOf(itemId) {
    const item = ITEM_CATALOG[itemId];
    return item ? [Math.ceil(item.base * 0.5), Math.floor(item.base * 1.5)] : null;
  }
  function isMarketOpen(nowMs = Date.now()) {
    return new Date(nowMs + 8 * 3600 * 1000).getUTCDay() === 5;
  }
  function nextOpenText(nowMs = Date.now()) {
    const taipei = new Date(nowMs + 8 * 3600 * 1000);
    const days = (5 - taipei.getUTCDay() + 7) % 7;
    const friday = new Date(taipei.getTime() + days * 86400000);
    return `每週五全天開市，下次開市：${friday.getUTCMonth() + 1}/${friday.getUTCDate()}（週五）`;
  }
  function classInfo() {
    try {
      const parsed = JSON.parse(localStorage.getItem('sci_class'));
      if (!parsed || typeof parsed.nick !== 'string') return null;
      const classCode = typeof parsed.classCode === 'string' ? parsed.classCode : parsed.code;
      if (typeof classCode !== 'string') return null;
      return { classCode, nick: parsed.nick };
    } catch { return null; }
  }
  function getInv() { return { ...state.inv }; }
  function grantItem(itemId) {
    if (!ITEM_CATALOG[itemId]) return { ok: false };
    state.inv[itemId] = Math.max(0, Math.floor(Number(state.inv[itemId]) || 0)) + 1;
    save();
    return { ok: true, count: state.inv[itemId] };
  }
  function removeItem(itemId) {
    const count = Math.max(0, Math.floor(Number(state.inv[itemId]) || 0));
    if (!ITEM_CATALOG[itemId] || count < 1) return { ok: false };
    state.inv[itemId] = count - 1;
    if (state.inv[itemId] === 0) delete state.inv[itemId];
    if (state.carry === itemId && !state.inv[itemId]) state.carry = null;
    save();
    return { ok: true, count: state.inv[itemId] || 0 };
  }
  function buyDirect(itemId) {
    const item = ITEM_CATALOG[itemId];
    if (!item || item.kind !== 'tool') return { ok: false, msg: '此物品無法直購' };
    const paid = SciEconomy.spendCrystals(item.base, 'mkt-direct');
    if (!paid.ok) return paid;
    grantItem(itemId);
    return { ok: true, balance: paid.balance };
  }
  function setCarry(toolId) {
    if (toolId == null) { state.carry = null; save(); return { ok: true }; }
    const item = ITEM_CATALOG[toolId];
    if (!item || item.kind !== 'tool' || !(state.inv[toolId] > 0)) return { ok: false };
    state.carry = toolId;
    save();
    return { ok: true };
  }
  function getCarry() { return state.carry; }
  function toolEffect(toolId) {
    return TOOL_EFFECTS[toolId] ? { ...TOOL_EFFECTS[toolId] } : null;
  }
  function takeCarry() {
    const toolId = state.carry;
    if (!toolId || !(state.inv[toolId] > 0)) { state.carry = null; save(); return null; }
    const effect = toolEffect(toolId);
    if (!effect || !removeItem(toolId).ok) return null;
    state.carry = null;
    save();
    return { toolId, effect };
  }
  function getClaims() { return state.claims.map((claim) => ({ ...claim })); }
  function addClaim(claim) {
    if (!claim || typeof claim.id !== 'string' || !ITEM_CATALOG[claim.itemId]) return { ok: false };
    state.claims = [claim, ...state.claims.filter((entry) => entry.id !== claim.id)];
    save();
    return { ok: true };
  }
  function removeClaim(id) {
    const before = state.claims.length;
    state.claims = state.claims.filter((claim) => claim.id !== id);
    save();
    return { ok: state.claims.length < before };
  }
  function buysToday(nowMs = Date.now()) {
    return state.buys.date === dayStr(nowMs) ? Math.max(0, Math.floor(Number(state.buys.n) || 0)) : 0;
  }
  function bumpBuys(nowMs = Date.now()) {
    const date = dayStr(nowMs);
    if (state.buys.date !== date) state.buys = { date, n: 0 };
    state.buys.n += 1;
    save();
    return state.buys.n;
  }
  function recordEver(entry) {
    if (!entry || !ITEM_CATALOG[entry.itemId] || !['sold', 'bought'].includes(entry.dir)) return { ok: false };
    state.ever = [{ itemId: entry.itemId, dir: entry.dir, peer: String(entry.peer || ''), ts: Number(entry.ts) || Date.now() }, ...state.ever].slice(0, 100);
    save();
    return { ok: true };
  }
  function getEver() { return state.ever.map((entry) => ({ ...entry })); }
  const settleToLocal = (amount) => SciEconomy.earnCrystals(amount, 'mkt-withdraw');
  const refundLocal = (amount) => SciEconomy.earnCrystals(amount, 'mkt-refund');
  const payLocal = (amount) => SciEconomy.spendCrystals(amount, 'mkt-deposit');
  function exportState() {
    return { ...state, inv: { ...state.inv }, claims: state.claims.slice(), buys: { ...state.buys }, ever: state.ever.slice() };
  }

  function importState(value) {
    state = sanitizeState(value);
    save();
    return exportState();
  }

  return {
    ITEM_CATALOG, TIER_LABEL, THANKS_CARDS, DAILY_BUY_CAP, MAX_ITEM_COUNT,
    tierOf, bandOf, isMarketOpen, nextOpenText, classInfo,
    getInv, grantItem, removeItem, buyDirect,
    setCarry, getCarry, takeCarry, toolEffect,
    getClaims, addClaim, removeClaim, buysToday, bumpBuys,
    recordEver, getEver, settleToLocal, refundLocal, payLocal,
    exportState, importState,
  };
})();
