# 科學英雄科學基地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在科學英雄（`~/projects/science-hero`）新增「科學基地」視覺養成層＋晶能經濟地基：**主樓五階**綁 `RANK_TIERS` 門檻（見習營帳→初階研究站→進階實驗樓→資深研究院→領域總部）、**四科展館**（自然園圃／生物標本館／理化實驗室／地科天文台）讀該科精通%換繁茂度五級（荒蕪／初萌／漸盛／繁茂／鼎盛，門檻 0/10/30/60/100）、精通詞卡實體化為裝飾（零錯=金、錯 1 次=銀、其餘=銅）、自由拖曳擺放＋門牌銘言詞庫命名＋樣式晶能換購，並**建立全站共用晶能經濟 `SciEconomy`**（`earnCrystals/spendCrystals` 單一入口、每日上限 100）供之後的融合與市集計畫消費。最後補慶典佇列動畫與成就牆，煙霧測試涵蓋基地開啟／拖曳／持久化。

**Architecture:** 「純邏輯層＋UI 層分離」，全部用科學英雄的 `<script>` IIFE 全域掛載慣例：新增 `js/economy.js`（`SciEconomy`，key `sci_econ`）＋ `js/base-store.js`（`SciBaseStore`，key `sci_base`，零 DOM；一律從 `science-hero:v1` **唯讀 derive、絕不寫回**）＋ `js/base-ui.js`（`SciBaseUI`，管 DOM；`sceneHtml`/`wallHtml` 為純函式，node vm harness 可直測）。入口按鈕掛 `index.html`，overlay 為自建全螢幕 `div`（本站無既有 overlay 基建）。純前端、不依賴後端。

**Tech Stack:** Vanilla JS `<script>` IIFE（跟隨 `js/store.js`/`js/battle.js` 風格）、`node:test` + `node:assert/strict` + `node:vm` 串接 harness（跟隨 `test/logic.test.mjs`）、煙霧測試沿用 `test/smoke.mjs` playwright-core 模式、CSS 疊層場景＋`<img onerror>` emoji 佔位（姊妹站已驗證手法）。

## Global Constraints

- **純前端 vanilla JS，無框架、無 npm runtime 依賴**：新模組一律 `const SciXxx = (() => { ... return {...}; })();` 放 `js/` 平層，`index.html` 依相依序加 `<script>`、**全部排在 `js/app.js` 之前**。**不是 ES module，不寫 `import`/`export`**。註解、UI 文案、測試描述一律繁體中文台灣用語。
- **localStorage 鑰匙名稱一字不差**：唯二新 key 為 `sci_econ`（晶能）與 `sci_base`（基地佈局），讀寫全包 try/catch。既有 `science-hero:v1` 本計畫**只讀不寫**（主樓／展館／裝飾／成就牆全部唯讀 derive）。
- **晶能收支只走 `SciEconomy` 單一入口**：`earnCrystals(n, reason)` / `spendCrystals(n, reason)`，每日獲取上限 100（一次性成就不計）；數值一律掛真實學習量（答對／精通／勝場），不掛操作次數。其他模組（含未來融合／市集）不得直改 `sci_econ`。
- **鉤子只接規格明定的出口**：作答只從 `app.js` `recordAnswer()` 接、對戰結算只從 `SciBattle` `finish()` 接。既有 `SciQuiz`/`SciFlashcard`/`SciWeak`/`SciStore`/`SciBattle` 簽名與回傳形狀不改；`app.js`/`battle.js` 只改本計畫指明的插入點。
- **單元測試全寫進 `test/logic.test.mjs`**（沿用 vm 串接 harness；新檔要同步加入 `loadScripts` 清單與 `__exports`）。⚠️ 一律指定檔名跑 `node --test test/logic.test.mjs`——整目錄跑會把需要本機 server 的 `smoke.mjs` 拖進來。
- **驗證指令固定三支**：`node --test test/logic.test.mjs`、`node scripts/validate-all.mjs`、`node test/smoke.mjs`（需本機已快取 playwright-core chromium）。
- **損失規避走白帽**：無任何懲罰設計——裝飾不消失、無蒙塵衰退、慶典只加不扣、還原擺設二次確認且明講不失去東西、成就牆只陳列不催促；同裝置 PvP 不發晶能（防同機自刷）。
- **文字安全**：門牌／銘言一律從預設詞庫選，不開放自由輸入（國中小情境，杜絕不當字詞）。
- **美術先佔位**：所有圖走 `<img onerror>` 退回 emoji，UI 預留固定尺寸掛載點；正式生圖另批、開發不阻塞（清單見附錄）。
- **工作目錄**：`~/projects/science-hero`（git，**master** 分支），每個 Task 完成即 commit。母版 iCloud 路徑不在操作範圍；三平台部署聽候另令、不在本計畫內。

---

## 事前必讀：既有原始碼介面（已逐一核實，引用前請再對一次）

| 介面 | 出處 | 已核實的事實 |
|---|---|---|
| `SciStore` | `js/store.js` | key `'science-hero:v1'`；`load()` 回 `{ cards:{}, stats:{ streakDays, lastActiveDate, totalReviews } }`；`save/getCard`（無卡回 `{box:0,due:0,seen:0,wrong:0}`）`/setCard/...` |
| `SciFlashcard` | `js/flashcard.js` | `BOX_INTERVAL_DAYS = [0,1,3,7,14]`（**精通 = box >= 4**）；`bumpBox(state,id,correct)` 回更新後 card、答錯歸零盒序 |
| `SciQuiz` | `js/quiz.js` | `buildQuestion(target, pool, mode=null)` 回 `{mode,prompt,options:[{id,label}],answerId}` |
| `recordAnswer(target, correct, elapsedMs)` | `js/app.js`（`SciApp` 私有） | 依序 `SciWeak.recordAnswer` → `SciFlashcard.bumpBox` → `totalReviews += 1` → streak/每日/`save` → 渲染音效。**全站唯一作答記錄出口**，`onAnswer` 鉤子插這裡 |
| `RANK_TIERS` | `js/app.js`（私有） | `[[0,'見習生'],[1,'初階英雄'],[10,'進階英雄'],[30,'資深英雄'],[80,'領域專家']]`——**未匯出**（`SciApp` 只 return `{ boot }`），故 Task 3 鏡射同門檻 `STAGES` 並用測試釘死 `[0,1,10,30,80]` 防漂移 |
| `masteredCardCount()` | `js/app.js`（私有） | `cards` 中 `box >= BOX_INTERVAL_DAYS.length - 1` 的張數——未匯出，Task 3 用同判準自寫 `countMastered(state)` |
| `SciBattle` | `js/battle.js` | 匯出 `RANKS/rankInfo/rankWin/rankLose/companionFor/...`；`RANKS` 六階 `{name,ico,at}`（銅牌探索者 0 → 傳奇科學家 1000）；`mount` 內 PvE 結算 `finish(win)` 有 `SciStore.save(state)`——對戰勝掉落鉤子插這裡；`state.rank = { pts, peak, shieldWk }` |
| `subjectTerms` | `js/app.js` `boot()` | `Map`，key = `nature/biology/chemphys/earth`，value = 詞條陣列（含 `id/term/def/unit/...`）；Task 8 用 `Object.fromEntries(subjectTerms)` 傳給 UI |
| vm harness | `test/logic.test.mjs` | `loadScripts(context, files)` 串檔＋檔尾 `globalThis.__exports = {...}`；`makeSandbox()` 建 `{ localStorage(stub), console, Date, Math, JSON }` sandbox |
| 煙霧測試 | `test/smoke.mjs` | 自建 http server + playwright-core；`page.evaluate` 直讀 localStorage 驗證持久化；失敗收 `fails`、最後 exit 1 |
| `<script>` 載入序 | `index.html` | 現況 `store → flashcard → quiz → weak → battle → app`；插入後 `store → flashcard → quiz → economy → weak → battle → base-store → base-ui → app` |

## 資料形狀總表（新增的兩把鑰匙）

- `sci_econ`（唯一寫入者 `SciEconomy`）：`{ v: 1, balance, daily: { date, earned }, combo, bestCombo }`——`daily` 為當日已入帳量（跨日歸零，一次性成就不計）、`combo`/`bestCombo` 由 SciEconomy 自管（不依賴對戰 combo）。
- `sci_base`（唯一寫入者 `SciBaseStore`）：`{ v: 1, placements: { decorId: { x, y } }, styles: { subjectKey: { owned: [0], active: 0 } }, plaques: { main|nature|biology|chemphys|earth: [wordId,...], motto: [mottoId] }, celebrated: ['stage-2', 'pav-nature-t1', 'gold-bio_001', '_seeded', ...] }`——座標為場景百分比（夾 2–98）、0 號樣式免費預設。

衍生資料（主樓階段、展館繁茂度、裝飾清單、成就牆數字）一律每次從 `science-hero:v1` state 與 `sci_econ` 現算，**不落盤**——學習進度永遠是唯一事實來源，基地不可能與戰功脫鉤。

---

## Task 1：SciEconomy 晶能底座（`js/economy.js`，key `sci_econ`）

**Files:**
- 新增 `js/economy.js`
- 修改 `js/app.js`（`recordAnswer` 掛鉤）
- 修改 `js/battle.js`（`finish` 掛鉤）
- 修改 `index.html`（加 `<script>`）
- 修改 `test/logic.test.mjs`（harness 加檔＋新測試）

**Interfaces:**
- Consumes：`SciFlashcard.BOX_INTERVAL_DAYS`（判精通盒序，呼叫時才讀全域）、`localStorage`、`Date`
- Produces（`SciEconomy` 全域物件）：
  - `earnCrystals(n, reason)` → `{ ok: true, earned, balance, capped }`——`earned` 為實際入帳量（撞每日上限截斷）；`reason` 在 `UNCAPPED`（只有 `'achievement'`）不吃上限
  - `spendCrystals(n, reason)` → `{ ok: true, balance }` 或 `{ ok: false, msg: '晶能不足', balance }`；`getBalance()` → number
  - `onAnswer(correct, prevBox, newBox)` → `{ earned, combo }`——**唯一作答掛鉤**：答對 +1、自第 3 連對起每題再 +1、本題推到精通（`prevBox < maxBox && newBox === maxBox`）再 +3；答錯連對歸零不入帳。內部自管 `combo`/`bestCombo`
  - `EARN_TABLE = { answer: 1, combo: 1, battleWin: 5, master: 3 }`、`DAILY_CAP = 100`（匯出供測試釘死**規格收入表**：答對 +1、連擊第 3 題起每題 +1、對戰勝 +5、精通一張 +3；每日上限 100、成就不計）

**Steps:**

- [ ] 修改 `test/logic.test.mjs` harness：`loadScripts` 的 `__exports` 行改為

```js
  const code = `${combined}\nglobalThis.__exports = { SciStore, SciFlashcard, SciQuiz, SciWeak, SciBattle, SciEconomy };`;
```

`makeSandbox` 加可選 seed 參數（預先塞 localStorage，測跨日歸零／壞資料用）——簽名改 `function makeSandbox(seed = {})`、首行改 `const store = { ...seed };`，其餘不動；並把 `'js/economy.js'` 排進 files 清單（放 `'js/quiz.js'` 之後、`'js/weak.js'` 之前，對齊 index.html 載入序）。

- [ ] 追加失敗測試：

```js
test('SciEconomy 收入表與每日上限 100（achievement 不吃上限）', () => {
  const lib = makeSandbox();
  assert.deepEqual(lib.SciEconomy.EARN_TABLE, { answer: 1, combo: 1, battleWin: 5, master: 3 });
  assert.equal(lib.SciEconomy.DAILY_CAP, 100);
  assert.equal(lib.SciEconomy.getBalance(), 0);

  const r1 = lib.SciEconomy.earnCrystals(60, 'battleWin');
  assert.deepEqual([r1.earned, r1.balance, r1.capped], [60, 60, false]);
  const r2 = lib.SciEconomy.earnCrystals(60, 'battleWin');
  assert.deepEqual([r2.earned, r2.balance, r2.capped], [40, 100, true], '撞上限只入 40');
  const r3 = lib.SciEconomy.earnCrystals(1, 'answer');
  assert.deepEqual([r3.earned, r3.capped], [0, true], '上限滿了之後一般收入歸零');
  const r4 = lib.SciEconomy.earnCrystals(50, 'achievement');
  assert.deepEqual([r4.earned, r4.balance, r4.capped], [50, 150, false], '成就不吃上限');
});

test('SciEconomy.spendCrystals 足額扣款、不足擋下', () => {
  const lib = makeSandbox();
  lib.SciEconomy.earnCrystals(30, 'battleWin');
  assert.deepEqual(lib.SciEconomy.spendCrystals(20, 'style:nature'), { ok: true, balance: 10 });
  const fail = lib.SciEconomy.spendCrystals(20, 'style:nature');
  assert.equal(fail.ok, false);
  assert.equal(fail.balance, 10, '扣款失敗不動餘額');
});

test('SciEconomy 跨日歸零每日入帳、壞資料退回預設', () => {
  const staleEcon = JSON.stringify({ v: 1, balance: 5, daily: { date: '2020-01-01', earned: 100 }, combo: 0, bestCombo: 0 });
  const lib = makeSandbox({ sci_econ: staleEcon });
  const r = lib.SciEconomy.earnCrystals(1, 'answer');
  assert.deepEqual([r.earned, r.balance], [1, 6], '換了一天，昨天的 earned=100 不該再擋今天');

  const bad = makeSandbox({ sci_econ: '{"balance"' });
  assert.equal(bad.SciEconomy.getBalance(), 0, '壞 JSON 退回預設不噴錯');
});

test('SciEconomy.onAnswer 答對+1、第3連對起每題再+1、精通+3、答錯歸零連對', () => {
  const lib = makeSandbox();
  const E = lib.SciEconomy;
  assert.deepEqual(E.onAnswer(true, 0, 1), { earned: 1, combo: 1 });
  assert.deepEqual(E.onAnswer(true, 1, 2), { earned: 1, combo: 2 });
  assert.deepEqual(E.onAnswer(true, 2, 3), { earned: 2, combo: 3 }, '第 3 連對起每題多 +1');
  assert.deepEqual(E.onAnswer(true, 3, 4), { earned: 5, combo: 4 }, '連擊 +2 疊加精通 +3');
  assert.deepEqual(E.onAnswer(false, 4, 0), { earned: 0, combo: 0 }, '答錯不入帳且連對歸零');
  assert.deepEqual(E.onAnswer(true, 4, 4), { earned: 1, combo: 1 }, '已精通的卡再答對不重複發精通獎勵');
  assert.equal(E.getBalance(), 10);
});
```

- [ ] 跑測試確認失敗（`SciEconomy` 未定義）：`node --test test/logic.test.mjs`
- [ ] 實作 `js/economy.js`（完整檔案；下面省略的四支底層小函式行為——`todayStr()` 回 `new Date().toISOString().slice(0,10)`；`load()` 讀 `KEY` 解析失敗或非物件退 `defaultEcon()`、成功則與預設深合併（`daily` 也要合併）且 `v` 定為 1；`save()` 包 try/catch；`state()` 惰性載入快取 `econ`；`rollDaily(e)` 見日期不同就重設 `e.daily = { date: 今天, earned: 0 }`——由 Task 1 測試釘死）：

```js
// 晶能經濟：全站唯一收支入口。key sci_econ。收入掛真實學習量，每日上限 100（'achievement' 不計）。
const SciEconomy = (() => {
  const KEY = 'sci_econ';
  const DAILY_CAP = 100;
  const UNCAPPED = new Set(['achievement']);
  const EARN_TABLE = { answer: 1, combo: 1, battleWin: 5, master: 3 };

  function defaultEcon() {
    return { v: 1, balance: 0, daily: { date: null, earned: 0 }, combo: 0, bestCombo: 0 };
  }

  let econ = null;
  // …todayStr / load / save / state / rollDaily（規格見上）…

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
    save(); // earnCrystals 內已各自 save；這裡再存一次確保 combo/bestCombo 落盤
    return { earned: total, combo: e.combo };
  }

  return { earnCrystals, spendCrystals, getBalance, onAnswer, EARN_TABLE, DAILY_CAP };
})();
```

- [ ] `index.html` `<script>` 插入（`quiz.js` 後、`weak.js` 前）：

```html
<script src="js/economy.js"></script>
```

- [ ] `js/app.js` 掛鉤：`recordAnswer(target, correct, elapsedMs)` 內，把 `SciFlashcard.bumpBox(state, target.id, correct);` 這一行（函式第二行，唯一一處）換成下面三行；後續 `totalReviews += 1` 起全部不動：

```js
    const prevBox = SciStore.getCard(state, target.id).box;
    const updated = SciFlashcard.bumpBox(state, target.id, correct);
    SciEconomy.onAnswer(correct, prevBox, updated.box); // 晶能唯一作答掛鉤（答對/連擊/精通掉落）
```

- [ ] `js/battle.js` 掛鉤：`mount` 內 `finish(win)`，在 `SciStore.save(state);`（該函式內僅此一處）之後插入一行：

```js
      if (win) SciEconomy.earnCrystals(SciEconomy.EARN_TABLE.battleWin, 'battleWin'); // 對戰勝 +5（僅 PvE；PvP 不發，防同機自刷）
```

（`pvpFinish` **不加**任何晶能程式碼——同裝置 PvP 不發晶能，白帽公平原則。）

- [ ] 跑測試通過：`node --test test/logic.test.mjs`（13 舊＋4 新全綠）
- [ ] 跑 `node scripts/validate-all.mjs` 確認資料驗證無影響
- [ ] Commit：`git add -A && git commit -m "feat(基地): SciEconomy 晶能底座——收入表/每日上限/兩掛鉤"`

---

## Task 2：sci_base 基座 store（`js/base-store.js`，load/save/壞資料防護）

**Files:**
- 新增 `js/base-store.js`
- 修改 `index.html`（加 `<script>`）
- 修改 `test/logic.test.mjs`（harness 加檔＋新測試）

**Interfaces:**
- Consumes：`localStorage`、`JSON`（本 task 只有自有狀態）
- Produces（`SciBaseStore` 全域物件，本 task 先出基座三件）：
  - `defaultBase()` → `{ v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [] }`
  - `loadBase()` → state（壞 JSON／非物件退回預設；舊版缺欄位補齊；`v` 一律定為 1）
  - `saveBase(state)` → boolean（try/catch，隱私模式寫入失敗回 false 不噴錯）
  - `BASE_KEY = 'sci_base'`（匯出常數供測試釘死鑰匙名）

**Steps:**

- [ ] 修改 `test/logic.test.mjs` harness：files 清單在 `js/battle.js` 之後加 `'js/base-store.js'`，`__exports` 物件補 `SciBaseStore`。
- [ ] 追加失敗測試：

```js
test('SciBaseStore 基座：預設形狀、save/load 讀回、key、壞資料退預設、缺欄位補齊', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  assert.equal(B.BASE_KEY, 'sci_base');
  const s = B.defaultBase();
  assert.deepEqual(s, { v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [] });
  s.placements['d-bio_001'] = { x: 30, y: 60 };
  assert.equal(B.saveBase(s), true);
  assert.deepEqual(B.loadBase().placements, { 'd-bio_001': { x: 30, y: 60 } });

  const bad = makeSandbox({ sci_base: '{"placements"' });
  assert.deepEqual(bad.SciBaseStore.loadBase(), bad.SciBaseStore.defaultBase(), '壞 JSON 退回預設');
  const partial = makeSandbox({ sci_base: '{"styles":{"nature":{"owned":[0,1],"active":1}}}' }).SciBaseStore.loadBase();
  assert.deepEqual(partial.styles.nature, { owned: [0, 1], active: 1 });
  assert.deepEqual([partial.celebrated, partial.v], [[], 1], '缺欄位補齊');
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作 `js/base-store.js`（後續 Task 3–7 都往檔尾追加）：

```js
// 科學基地純邏輯層：擺設/樣式/門牌/慶典狀態（自有 key sci_base）。
// 主樓/展館/裝飾/成就牆一律由 science-hero:v1 與 sci_econ 唯讀 derive，本模組絕不寫回它們。零 DOM。
const SciBaseStore = (() => {
  const BASE_KEY = 'sci_base';

  function defaultBase() { // 欄位意義見「資料形狀總表」
    return { v: 1, placements: {}, styles: {}, plaques: {}, celebrated: [] };
  }

  function loadBase() {
    const def = defaultBase();
    try {
      const parsed = JSON.parse(localStorage.getItem(BASE_KEY));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return def;
      const merged = { ...def, ...parsed, v: 1 };
      if (!Array.isArray(merged.celebrated)) merged.celebrated = [];
      return merged;
    } catch { return def; }
  }

  function saveBase(state) {
    try { localStorage.setItem(BASE_KEY, JSON.stringify(state)); return true; } catch { return false; }
  }

  return { BASE_KEY, defaultBase, loadBase, saveBase };
})();
```

- [ ] `index.html` `<script>` 插入（`battle.js` 後、`app.js` 前）：

```html
<script src="js/base-store.js"></script>
```

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add js/base-store.js index.html test/logic.test.mjs && git commit -m "feat(基地): sci_base 基座 store（載入/儲存/壞資料防護）"`

---

## Task 3：主樓五階＋四科展館繁茂度（唯讀 derive）

**Files:**
- 修改 `js/base-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces:**
- Consumes：`state.cards`（每卡 `{box,due,seen,wrong}`）、`SciFlashcard.BOX_INTERVAL_DAYS`（精通判準 box >= 4）、`termsBySubject`＝`{ nature:[term,...], ... }`（UI 層從 `subjectTerms` Map 轉出傳入）
- Produces（追加到 `SciBaseStore` 匯出）：
  - `STAGES`（值見實作）——門檻**對齊 `app.js` `RANK_TIERS` 的 `[0,1,10,30,80]`**（該常數為 `SciApp` 私有無法引用，故鏡射並用測試釘死防漂移）
  - `countMastered(state)` → number；`mainStage(masteredCount)` → `{ stage: 0–4, name, at, next: { at, name } | null }`
  - `PAVILIONS` 四館 `{key,name,emoji}`（key 對齊 `SUBJECTS`，值見實作）
  - `FLOURISH_TIERS = ['荒蕪','初萌','漸盛','繁茂','鼎盛']`、`flourishTier(pct)` → 0–4（門檻 0/10/30/60/100；鼎盛要**全科精通**）
  - `getPavilions(state, termsBySubject)` → `[{ key, name, emoji, done, total, pct, tier, tierName }]`（純函式，不寫入）

**Steps:**

- [ ] 追加失敗測試：

```js
// 造一個指定卡片精通狀態的 state：ids 內的卡全推到 box 4（wrong 可指定）
function stateWithMastered(lib, ids, wrong = 0) {
  const state = lib.SciStore.load();
  for (const id of ids) lib.SciStore.setCard(state, id, { box: 4, due: 0, seen: 5, wrong });
  return state;
}

test('SciBaseStore.STAGES 門檻釘死 0/1/10/30/80，mainStage 正確分階', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual(B.STAGES.map((s) => s[0]), [0, 1, 10, 30, 80], '門檻必須對齊 app.js RANK_TIERS');
  assert.deepEqual(B.STAGES.map((s) => s[1]), ['見習營帳', '初階研究站', '進階實驗樓', '資深研究院', '領域總部']);
  assert.equal(B.mainStage(0).name, '見習營帳');
  assert.equal(B.mainStage(0).next.at, 1);
  assert.equal(B.mainStage(9).name, '初階研究站');
  assert.equal(B.mainStage(10).stage, 2);
  assert.equal(B.mainStage(80).name, '領域總部');
  assert.equal(B.mainStage(999).next, null, '最高階沒有下一階');
});

test('SciBaseStore.countMastered 與 box>=4 判準一致', () => {
  const lib = makeSandbox();
  const state = stateWithMastered(lib, ['a']);
  lib.SciStore.setCard(state, 'b', { box: 3, due: 0, seen: 5, wrong: 0 });
  assert.equal(lib.SciBaseStore.countMastered(state), 1);
});

test('SciBaseStore.getPavilions 各科精通%換繁茂度五級（門檻 0/10/30/60/100）', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  assert.deepEqual([0, 9, 10, 30, 60, 99, 100].map(B.flourishTier), [0, 0, 1, 2, 3, 3, 4], '99% 還不到鼎盛');

  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0', ...termsBySubject.biology.map((t) => t.id)]);

  const ps = B.getPavilions(state, termsBySubject);
  assert.deepEqual(ps.map((p) => p.name), ['自然園圃', '生物標本館', '理化實驗室', '地科天文台']);
  assert.deepEqual([ps[0].pct, ps[0].tierName], [10, '初萌']);
  assert.deepEqual([ps[1].pct, ps[1].tierName], [100, '鼎盛']);
  assert.equal(ps[2].tierName, '荒蕪');
  assert.equal(ps[3].done, 0);
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作（追加到 `js/base-store.js` IIFE 內；`return` 同步補新名稱）：

```js
  // ── 主樓五階：門檻鏡射 app.js RANK_TIERS（SciApp 私有無法引用）；測試已釘死，改 RANK_TIERS 必同步 ──
  const STAGES = [
    [0, '見習營帳'], [1, '初階研究站'], [10, '進階實驗樓'], [30, '資深研究院'], [80, '領域總部'],
  ];

  function maxBox() { return SciFlashcard.BOX_INTERVAL_DAYS.length - 1; } // 呼叫時才讀全域，載入序無硬相依

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

  // ── 四科展館：讀該科精通% 換繁茂度五級（門檻 0/10/30/60/100，鼎盛=全科精通） ──
  const PAVILIONS = [
    { key: 'nature', name: '自然園圃', emoji: '🌱' },
    { key: 'biology', name: '生物標本館', emoji: '🔬' },
    { key: 'chemphys', name: '理化實驗室', emoji: '⚗️' },
    { key: 'earth', name: '地科天文台', emoji: '🔭' },
  ];
  const FLOURISH_TIERS = ['荒蕪', '初萌', '漸盛', '繁茂', '鼎盛'];
  const FLOURISH_AT = [0, 10, 30, 60, 100];

  function flourishTier(pct) { // 取 pct 已達門檻的最高一級
    let tier = 0;
    for (let i = 1; i < FLOURISH_AT.length; i++) if (pct >= FLOURISH_AT[i]) tier = i;
    return tier;
  }

```

`getPavilions(state, termsBySubject)`：對 `PAVILIONS` 逐館算 `done`（該科詞條中 `box >= maxBox()` 張數）與 `total`，`pct = total ? Math.floor(done / total * 100) : 0`（**floor 而非 round**：99.6% 不能被湊成 100% 提前「鼎盛」，鼎盛必須全科精通），回 `[{ ...p, done, total, pct, tier: flourishTier(pct), tierName }]`。

`return` 改為：

```js
  return {
    BASE_KEY, defaultBase, loadBase, saveBase,
    STAGES, countMastered, mainStage,
    PAVILIONS, FLOURISH_TIERS, flourishTier, getPavilions,
  };
```

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add -u && git commit -m "feat(基地): 主樓五階＋四科展館繁茂度唯讀 derive"`

---

## Task 4：詞卡實體化——精通卡 → 展館裝飾（品階＋各科主題）

**Files:**
- 修改 `js/base-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces:**
- Consumes：`state.cards[id].wrong`（品階）與 `.box`（精通）、Task 3 的 `maxBox`、`termsBySubject`
- Produces（追加到 `SciBaseStore` 匯出）：
  - `DECOR_THEMES` 各科主題 `{name,emoji}`（值見實作）；`GRADES` 金／銀／銅三級、`gradeOf(card)`（**零錯=金、錯 1 次=銀、其餘=銅**，讀 `card.wrong`）
  - `DECOR_CAP = 12`（每館最多陳列 12 件防撐爆畫面，超出以 `hidden` 統計呈現）
  - `getDecorations(state, termsBySubject, base)` → `[{ id:'d-'+termId, termId, term, subject, theme, themeEmoji, grade, gradeName, styleIdx, x, y, custom }]`——每館取前 12 件（金→銀→銅、同級依 termId 字典序，確定性）；`x/y/custom` 本 task 先以 `{x:50,y:50,custom:false}` 佔位、`styleIdx` 先 0，Task 5／6 換掉
  - `decorSummary(state, termsBySubject)` → `{ nature: {gold,silver,bronze,total,shown,hidden}, ... }`

**Steps:**

- [ ] 追加失敗測試：

```js
test('SciBaseStore.gradeOf 零錯=金、錯1次=銀、其餘=銅', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual([0, 1, 2, 9].map((wrong) => B.gradeOf({ box: 4, wrong })), ['gold', 'silver', 'bronze', 'bronze']);
});

test('SciBaseStore.getDecorations 只收精通卡、掛各科主題、金銀銅排序、每館上限 12', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${String(i).padStart(2, '0')}`, term: `詞${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 20), biology: mk('b', 5), chemphys: mk('c', 5), earth: mk('e', 5) };
  const state = lib.SciStore.load();
  termsBySubject.nature.slice(0, 15).forEach((t, i) => {
    lib.SciStore.setCard(state, t.id, { box: 4, due: 0, seen: 5, wrong: i < 3 ? 0 : (i < 5 ? 1 : 2) });
  });
  lib.SciStore.setCard(state, 'b00', { box: 4, due: 0, seen: 5, wrong: 0 });
  lib.SciStore.setCard(state, 'c00', { box: 3, due: 0, seen: 5, wrong: 0 });

  const ds = B.getDecorations(state, termsBySubject, B.defaultBase());
  const nature = ds.filter((d) => d.subject === 'nature');
  assert.equal(nature.length, 12, '每館上限 12 件');
  assert.deepEqual(nature.slice(0, 5).map((d) => d.grade), ['gold', 'gold', 'gold', 'silver', 'silver'], '金→銀→銅排序');
  assert.equal(nature[0].theme, '植栽昆蟲箱');
  assert.equal(nature[0].id, `d-${nature[0].termId}`);
  assert.equal(ds.filter((d) => d.subject === 'biology')[0].theme, '標本罐顯微鏡');
  assert.equal(ds.filter((d) => d.subject === 'chemphys').length, 0, '未精通的卡不實體化');

  const sum = B.decorSummary(state, termsBySubject);
  assert.deepEqual(sum.nature, { gold: 3, silver: 2, bronze: 10, total: 15, shown: 12, hidden: 3 });
  assert.deepEqual(sum.earth, { gold: 0, silver: 0, bronze: 0, total: 0, shown: 0, hidden: 0 });
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作（IIFE 內；`return` 補 `DECOR_THEMES, GRADES, gradeOf, DECOR_CAP, getDecorations, decorSummary`）：

```js
  // ── 詞卡實體化：精通卡 → 展館裝飾。品階看煉成過程（card.wrong），主題看科別 ──
  const DECOR_THEMES = {
    nature: { name: '植栽昆蟲箱', emoji: '🪴' },
    biology: { name: '標本罐顯微鏡', emoji: '🧫' },
    chemphys: { name: '燒杯儀器', emoji: '🧪' },
    earth: { name: '礦石星象儀', emoji: '🪨' },
  };
  const GRADES = [{ id: 'gold', name: '金級' }, { id: 'silver', name: '銀級' }, { id: 'bronze', name: '銅級' }];
  const GRADE_ORDER = { gold: 0, silver: 1, bronze: 2 };
  const DECOR_CAP = 12; // 每館最多陳列件數，其餘用數字統計呈現

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

  function getDecorations(state, termsBySubject, base) {
    const out = [];
    for (const p of PAVILIONS) {
      const mastered = masteredOf(state, (termsBySubject && termsBySubject[p.key]) || [])
        .sort((a, b) => (GRADE_ORDER[gradeOf(a.card)] - GRADE_ORDER[gradeOf(b.card)]) || (a.term.id < b.term.id ? -1 : 1))
        .slice(0, DECOR_CAP);
      mastered.forEach(({ term, card }) => {
        const grade = gradeOf(card);
        const id = `d-${term.id}`;
        const pos = { x: 50, y: 50 }; // Task 5 換成 placements 自訂座標或 defaultPos
        out.push({
          id, termId: term.id, term: term.term, subject: p.key,
          theme: DECOR_THEMES[p.key].name, themeEmoji: DECOR_THEMES[p.key].emoji,
          grade, gradeName: GRADES.find((g) => g.id === grade).name,
          styleIdx: 0, // Task 6 換成 styleOf(base, p.key)
          x: pos.x, y: pos.y, custom: false,
        });
      });
    }
    return out;
  }

```

`decorSummary(state, termsBySubject)`：對每館拿 `masteredOf` 全量（不裁 12），統計 `{ gold, silver, bronze, total, shown: Math.min(DECOR_CAP, total), hidden: total - shown }`，回 `{ [subjectKey]: 統計 }`。

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add -u && git commit -m "feat(基地): 精通詞卡實體化為展館裝飾（金銀銅品階＋各科主題）"`

---

## Task 5：自由擺放（依 id hash 的確定性散佈＋拖曳座標存檔＋還原）

**Files:**
- 修改 `js/base-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces:**
- Consumes：Task 4 的裝飾 id（`d-<termId>`）、`base.placements`
- Produces（追加到 `SciBaseStore` 匯出）：
  - `idHash(str)` → 非負整數（FNV-1a 32-bit，同輸入必同輸出）
  - `defaultPos(subjectKey, decorId)` → `{ x, y }`——依 id hash 散佈在該科展館分帶內（主樓佔中央；分帶座標見實作 `DECOR_BANDS`，單位＝場景百分比）
  - `placeDecor(base, decorId, x, y)` → `{ ok, msg? }`——座標夾 2–98 寫入 `base.placements`；非有限數值擋下；id 必須 `d-` 開頭
  - `resetPlacements(base)` → `{ ok: true }`（白帽：只還原位置，裝飾本體不會消失）
  - `getDecorations` 改用 `defaultPos` 當未擺放座標；`base.placements` 有值時用自訂座標並標 `custom: true`

**Steps:**

- [ ] 追加失敗測試：

```js
test('SciBaseStore.defaultPos 確定性、依科別分帶、座標在 2–98', () => {
  const B = makeSandbox().SciBaseStore;
  assert.deepEqual(B.defaultPos('nature', 'd-n01'), B.defaultPos('nature', 'd-n01'), '同輸入必同輸出');
  assert.notDeepEqual(B.defaultPos('nature', 'd-n01'), B.defaultPos('nature', 'd-n02'), '不同 id 要錯落');
  const bands = { nature: [6, 40, 8, 38], biology: [60, 94, 8, 38], chemphys: [6, 40, 62, 92], earth: [60, 94, 62, 92] };
  for (const [key, [x0, x1, y0, y1]] of Object.entries(bands)) {
    for (let i = 0; i < 20; i++) {
      const p = B.defaultPos(key, `d-${key}${i}`);
      assert.ok(p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1, `${key} 落點超出分帶 ${JSON.stringify(p)}`);
    }
  }
});

test('SciBaseStore.placeDecor 寫入並夾界；無效值擋下；reset 清空', () => {
  const B = makeSandbox().SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.placeDecor(base, 'd-n01', 120, -5).ok, true);
  assert.deepEqual(base.placements['d-n01'], { x: 98, y: 2 }, '座標夾到 2–98');
  assert.equal(B.placeDecor(base, 'ghost', 10, 10).ok, false, '非 d- 開頭擋下');
  assert.equal(B.placeDecor(base, 'd-n02', NaN, 10).ok, false, 'NaN 擋下');
  B.resetPlacements(base);
  assert.deepEqual(base.placements, {});
});

test('SciBaseStore.getDecorations 未擺放用 defaultPos、擺過用自訂座標', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const termsBySubject = { nature: [{ id: 'n01', term: '光合作用', def: 'x', unit: 'u' }], biology: [], chemphys: [], earth: [] };
  const state = stateWithMastered(lib, ['n01']);
  const base = B.defaultBase();

  let d = B.getDecorations(state, termsBySubject, base)[0];
  assert.deepEqual({ x: d.x, y: d.y }, B.defaultPos('nature', 'd-n01'));
  assert.equal(d.custom, false);

  B.placeDecor(base, 'd-n01', 33, 44);
  d = B.getDecorations(state, termsBySubject, base)[0];
  assert.deepEqual({ x: d.x, y: d.y, custom: d.custom }, { x: 33, y: 44, custom: true });
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作（IIFE 內；並把 Task 4 `getDecorations` 裡的 `const pos = { x: 50, y: 50 };` 與 `custom: false` 換掉）：

```js
  // ── 自由擺放：依 id hash 的確定性散佈（FNV-1a）＋自訂座標（百分比 2–98） ──
  const clampPct = (v) => Math.max(2, Math.min(98, v));

  function idHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  // 各科展館分帶（主樓佔中央，四帶避開）：nature 左上、biology 右上、chemphys 左下、earth 右下
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

```

`placeDecor(base, decorId, x, y)`：id 非 `d-` 開頭或座標非有限數值回 `{ ok:false, msg }`；合法則 `base.placements[decorId] = { x: clampPct(x), y: clampPct(y) }` 回 `{ ok:true }`。`resetPlacements(base)`：`base.placements = {}` 回 `{ ok:true }`。

`getDecorations` 內對應兩行改為：

```js
        const saved = base && base.placements ? base.placements[id] : null;
        const pos = saved || defaultPos(p.key, id);
        // ...（push 物件內）
        x: pos.x, y: pos.y, custom: !!saved,
```

`return` 補 `idHash, defaultPos, placeDecor, resetPlacements`。
- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add -u && git commit -m "feat(基地): 自由擺放——id hash 確定性散佈＋拖曳座標存檔＋還原"`

---

## Task 6：門牌／銘言詞庫命名＋裝飾樣式晶能換購

**Files:**
- 修改 `js/base-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces:**
- Consumes：`base.plaques`／`base.styles`、`SciEconomy.spendCrystals`（樣式換購唯一扣款通道）
- Produces（追加到 `SciBaseStore` 匯出）：
  - `PLAQUE_TARGETS = ['main', 'nature', 'biology', 'chemphys', 'earth']`；`PLAQUE_BANK` 24 個 `{ id, w }` 科學風雙字詞（**不開放自由輸入**）；`PLAQUE_MIN = 1`、`PLAQUE_MAX = 2`（選 1–2 詞組門牌，如「星辰」＋「學堂」）
  - `setPlaque(base, targetId, wordIds)` → `{ ok, msg? }`（長度／詞庫／對象驗證）；`getPlaqueText(base, targetId)`——未題字回預設名（main→科學研究基地、其餘→展館名）
  - `MOTTO_BANK` 6 句 `{ id, text }`；`setMotto(base, mottoId | null)`／`getMotto(base)`（存於 `base.plaques.motto = [mottoId]`）
  - `STYLE_SHOP`：每科 3 樣式 `{ name, cost }`（0 號免費預設、1 號 30、2 號 60 晶能）；`styleOf(base, subjectKey)`（無效值退 0）
  - `buyStyle(base, subjectKey, styleIdx)` → `{ ok, msg?, balance? }`——已擁有→直接切換；未擁有→`spendCrystals(cost, 'style:'+subjectKey)` 成功才入手＋切換；失敗原樣回 msg 不動狀態
  - `getDecorations` 的 `styleIdx: 0` 改為 `styleIdx: styleOf(base, p.key)`

**Steps:**

- [ ] 追加失敗測試：

```js
test('SciBaseStore 門牌詞庫命名：1–2 詞、只能選詞庫、非法對象擋下、預設名', () => {
  const B = makeSandbox().SciBaseStore;
  assert.ok(B.PLAQUE_BANK.length >= 24);
  assert.equal(new Set(B.PLAQUE_BANK.map((w) => w.id)).size, B.PLAQUE_BANK.length, '詞庫 id 不重複');
  const base = B.defaultBase();
  const [a, b] = B.PLAQUE_BANK;
  assert.equal(B.setPlaque(base, 'main', [a.id, b.id]).ok, true);
  assert.equal(B.getPlaqueText(base, 'main'), `${a.w}${b.w}`);
  assert.equal(B.setPlaque(base, 'nature', [a.id]).ok, true, '單一詞也可');
  assert.equal(B.setPlaque(base, 'main', []).ok, false, '空選擋下');
  assert.equal(B.setPlaque(base, 'main', [a.id, b.id, a.id]).ok, false, '超過 2 詞擋下');
  assert.equal(B.setPlaque(base, 'main', ['自由輸入']).ok, false, '不在詞庫擋下');
  assert.equal(B.setPlaque(base, 'roof', [a.id]).ok, false, '非法對象擋下');
  assert.equal(B.getPlaqueText(base, 'biology'), '生物標本館', '未題字回預設名');
  assert.equal(B.getPlaqueText(B.defaultBase(), 'main'), '科學研究基地');
});

test('SciBaseStore 銘言：詞庫掛上／取下、非法 id 擋下', () => {
  const B = makeSandbox().SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.getMotto(base), null);
  assert.equal(B.setMotto(base, B.MOTTO_BANK[2].id).ok, true);
  assert.equal(B.getMotto(base).text, B.MOTTO_BANK[2].text);
  assert.equal(B.setMotto(base, 'nope').ok, false);
  assert.equal(B.setMotto(base, null).ok, true);
  assert.equal(B.getMotto(base), null);
});

test('SciBaseStore.buyStyle 晶能換購：夠錢入手＋生效、不夠擋下、已擁有免費切換', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const base = B.defaultBase();
  assert.equal(B.styleOf(base, 'nature'), 0, '預設 0 號樣式');
  assert.equal(B.buyStyle(base, 'nature', 1).ok, false, '餘額 0 買不起 30 晶能樣式');
  assert.equal(B.styleOf(base, 'nature'), 0, '失敗不動狀態');

  lib.SciEconomy.earnCrystals(50, 'battleWin');
  const buy = B.buyStyle(base, 'nature', 1);
  assert.deepEqual([buy.ok, buy.balance], [true, 20], '扣掉 30');
  assert.equal(B.styleOf(base, 'nature'), 1);
  assert.deepEqual(base.styles.nature.owned.sort(), [0, 1]);

  assert.equal(B.buyStyle(base, 'nature', 0).ok, true, '切回已擁有樣式不扣款');
  assert.equal(lib.SciEconomy.getBalance(), 20);
  assert.equal(B.buyStyle(base, 'nature', 9).ok, false, '沒有這個樣式');
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作（IIFE 內；`return` 補 `PLAQUE_TARGETS, PLAQUE_BANK, PLAQUE_MIN, PLAQUE_MAX, setPlaque, getPlaqueText, MOTTO_BANK, setMotto, getMotto, STYLE_SHOP, styleOf, buyStyle`）：

```js
  // ── 門牌／銘言：預設詞庫選用，不開放自由輸入（國中小使用情境，杜絕不當字詞） ──
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

  // ── 裝飾樣式換購：唯一扣款通道 = SciEconomy.spendCrystals（0 號免費預設） ──
  const STYLE_SHOP = {
    nature: [{ name: '素陶盆栽', cost: 0 }, { name: '螢光溫室', cost: 30 }, { name: '雨林生態缸', cost: 60 }],
    biology: [{ name: '玻璃標本罐', cost: 0 }, { name: '黃銅顯微鏡', cost: 30 }, { name: '全息細胞儀', cost: 60 }],
    chemphys: [{ name: '基礎燒杯組', cost: 0 }, { name: '螺旋蒸餾塔', cost: 30 }, { name: '電漿反應爐', cost: 60 }],
    earth: [{ name: '礦石標本座', cost: 0 }, { name: '青銅渾天儀', cost: 30 }, { name: '星空投影儀', cost: 60 }],
  };
```

六支函式行為由 Interfaces 與測試完全釘死，逐條實作即可（皆為十行內小函式）。補充實作細節：`setPlaque` 依序驗對象／長度／詞庫，全過才 `base.plaques[targetId] = wordIds.slice()`；`getPlaqueText` 無值回 `DEFAULT_PLAQUES[targetId]`、有值把詞連寫；`setMotto(null)` → `delete base.plaques.motto`；`buyStyle` 首購成功 push 進 `owned`＋設 `active`、回 `{ ok:true, balance }`（首購用扣款回傳額、切換用 `getBalance()`）；`styles[subjectKey]` 首次觸碰補 `{ owned:[0], active:0 }`。並把 `getDecorations` 內 `styleIdx: 0,` 改為 `styleIdx: styleOf(base, p.key),`。

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add -u && git commit -m "feat(基地): 門牌銘言詞庫命名＋裝飾樣式晶能換購"`

---

## Task 7：慶典佇列＋成就牆資料＋整包視圖 getter

**Files:**
- 修改 `js/base-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces:**
- Consumes：Task 3/4 的 derive、`base.celebrated`、`state.rank.peak`＋`SciBattle.RANKS`（分數→段位名）、`state.stats.streakDays`、`SciEconomy`（本 task 幫它補唯讀 `getBestCombo()`）
- Produces：
  - `SciEconomy` 追加 `getBestCombo()` → number（`return` 物件補上）
  - `SciBaseStore` 追加：
    - `pendingCelebrations(state, termsBySubject, base)` → `[{ id, type: 'stage'|'pav'|'gold', title, text }]`——未慶祝過的主樓升階（`stage-1..4`）／展館升級（`pav-<key>-t1..4`）／新金級裝飾（`gold-<termId>`，只列有陳列的）
    - `markCelebrated(base, celebId)`（去重）；`seedCelebrated(state, termsBySubject, base)`——首次開基地把既有進度全部靜默標記＋push `'_seeded'`（防慶典洪水）；`isSeeded(base)`
    - `getWall(state)` → `[{ icon, label, value }]` 三面榮譽（值格式見實作規格）；`getBaseView(state, termsBySubject, base)` → 整包視圖，UI 一次拿齊

**Steps:**

- [ ] 追加失敗測試：

```js
test('SciEconomy.getBestCombo 唯讀回報歷史最高連對', () => {
  const E = makeSandbox().SciEconomy;
  E.onAnswer(true, 0, 1);
  E.onAnswer(true, 1, 2);
  E.onAnswer(false, 2, 0);
  E.onAnswer(true, 0, 1);
  assert.equal(E.getBestCombo(), 2);
});

test('SciBaseStore.pendingCelebrations 列升階/升級/金級；mark 去重；seed 防洪水', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0']);
  lib.SciStore.setCard(state, 'n1', { box: 4, due: 0, seen: 5, wrong: 1 });

  const base = B.defaultBase();
  let pend = B.pendingCelebrations(state, termsBySubject, base);
  assert.deepEqual(pend.map((p) => p.id).sort(), ['gold-n0', 'pav-nature-t1', 'stage-1']);
  assert.ok(pend.find((p) => p.id === 'stage-1').title.includes('初階研究站'));

  B.markCelebrated(base, 'stage-1');
  B.markCelebrated(base, 'stage-1');
  assert.equal(base.celebrated.filter((x) => x === 'stage-1').length, 1, '重複標記不重複塞');
  assert.ok(!B.pendingCelebrations(state, termsBySubject, base).some((p) => p.id === 'stage-1'));

  const fresh = B.defaultBase();
  assert.equal(B.isSeeded(fresh), false);
  B.seedCelebrated(state, termsBySubject, fresh);
  assert.equal(B.isSeeded(fresh), true);
  assert.deepEqual(B.pendingCelebrations(state, termsBySubject, fresh), []);
  lib.SciStore.setCard(state, 'n2', { box: 4, due: 0, seen: 5, wrong: 0 }); // 事後再精通一張金級（30% → tier 2）
  assert.deepEqual(B.pendingCelebrations(state, termsBySubject, fresh).map((p) => p.id).sort(), ['gold-n2', 'pav-nature-t2']);
});

test('SciBaseStore.getWall 三面榮譽，無紀錄不催促', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const state = lib.SciStore.load();
  let wall = B.getWall(state);
  assert.equal(wall.length, 3);
  assert.equal(wall[0].value, '尚未出戰');

  state.rank = { pts: 80, peak: 260, shieldWk: null };
  state.stats.streakDays = 7;
  lib.SciEconomy.onAnswer(true, 0, 1);
  wall = B.getWall(state);
  assert.ok(wall[0].value.includes('金牌學者') && wall[0].value.includes('260'), 'peak 260 依 SciBattle.RANKS 應為金牌學者');
  assert.equal(wall[1].value, '1 題');
  assert.equal(wall[2].value, '7 天');
});

test('SciBaseStore.getBaseView 一次拿齊整包視圖', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const v = B.getBaseView(lib.SciStore.load(), { nature: [], biology: [], chemphys: [], earth: [] }, B.defaultBase());
  assert.deepEqual([v.main.name, v.main.masteredCount], ['見習營帳', 0]);
  assert.equal(v.pavilions.length, 4);
  assert.ok(Array.isArray(v.decorations));
  assert.equal(v.plaques.main, '科學研究基地');
  assert.deepEqual([v.motto, v.balance, v.wall.length], [null, 0, 3]);
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] `js/economy.js` 追加（IIFE 內、`return` 補 `getBestCombo`）：

```js
  function getBestCombo() { return state().bestCombo; }
```

- [ ] `js/base-store.js` 追加（IIFE 內；`return` 補 `pendingCelebrations, markCelebrated, seedCelebrated, isSeeded, getWall, getBaseView`）：

```js
  // ── 慶典佇列：主樓升階/展館升級/新金級裝飾各慶祝一次（只加不扣，白帽） ──
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

  // 首次開基地：既有進度全部靜默入帳，之後的新進度才放慶典（防慶典洪水）
  function seedCelebrated(state, termsBySubject, base) {
    for (const p of pendingCelebrations(state, termsBySubject, base)) markCelebrated(base, p.id);
    markCelebrated(base, '_seeded');
    return base;
  }

```

再補兩支小函式（行為由測試釘死）：

- `getWall(state)`：回固定三筆 `[{icon,label,value}]`——🏆「段位巔峰」：`state.rank.pts > 0 || peak > 0` 才算出戰過，值為 `` `${ico} ${name}（${peak} 分）` ``（段位名用 `SciBattle.RANKS` 依 `peak` 分數查最高達標階，含 `ico`），否則 `'尚未出戰'`；🔥「最高連對」＝`` `${SciEconomy.getBestCombo()} 題` ``；📅「守繼天數」＝`` `${state.stats.streakDays || 0} 天` ``。只陳列、不出現「還差 X」催促字眼（白帽）。
- `getBaseView(state, termsBySubject, base)`：組 `{ main: { ...mainStage(countMastered(state)), masteredCount }, pavilions: getPavilions(...), decorations: getDecorations(...), summary: decorSummary(...), plaques:（`PLAQUE_TARGETS` 逐一 `getPlaqueText`）, motto: getMotto(base), balance: SciEconomy.getBalance(), wall: getWall(state) }`。

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] Commit：`git add -u && git commit -m "feat(基地): 慶典佇列（seed 防洪水）＋成就牆＋整包視圖 getter"`

---

## Task 8：UI 骨架——入口按鈕、全螢幕 overlay、場景渲染、app.js 接線

**Files:**
- 新增 `js/base-ui.js`
- 修改 `index.html`（入口按鈕＋overlay＋`<script>`）
- 修改 `css/style.css`（檔尾追加基地區塊）
- 修改 `js/app.js`（接線一處）
- 修改 `test/logic.test.mjs`（`sceneHtml`/`wallHtml` 純函式測試）

**Interfaces:**
- Consumes：`SciBaseStore.getBaseView/loadBase/saveBase/seedCelebrated/isSeeded`、`SciEconomy.getBalance`
- Produces（`SciBaseUI` 全域物件）：
  - `sceneHtml(view)`／`wallHtml(entries)` → string——**純函式**（不碰 DOM，vm harness 可直測）
  - `init(opts)`——DOM 接線；`opts = { getState, getTermsBySubject }`（皆為函式，惰性取值避免 boot 時序問題）
- 圖片掛載點（生圖到位即生效，缺圖 `onerror` 換 emoji）：`assets/base/` 下 `bg-base.jpg`、主樓 `main-s{1..5}.png`（stage+1）、展館 `pav-{key}-t{1..5}.png`（tier+1）、裝飾 `decor-{subjectKey}-{styleIdx}.png`；品階用 CSS 外框色：金 `#e0b64e`／銀 `#b8c0c8`／銅 `#b07a4e`
- **注意**：`js/base-ui.js` 頂層**不得**觸碰 `document`/`window`（只在函式內用），否則 vm harness 載入會爆——這是 `logic.test.mjs` 能直測 `sceneHtml` 的前提。

**Steps:**

- [ ] 修改 `test/logic.test.mjs` harness：files 清單在 `js/base-store.js` 之後加 `'js/base-ui.js'`，`__exports` 物件補 `SciBaseUI`（至此 harness 為最終版：8 檔、8 名稱）。
- [ ] 追加失敗測試：

```js
test('SciBaseUI.sceneHtml 含主樓（階段圖＋門牌）＋四展館（繁茂度圖）＋onerror 佔位', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const mk = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, term: `詞${p}${i}`, def: 'x', unit: 'u' }));
  const termsBySubject = { nature: mk('n', 10), biology: mk('b', 10), chemphys: mk('c', 10), earth: mk('e', 10) };
  const state = stateWithMastered(lib, ['n0']); // 1 金級裝飾、主樓 stage1、園圃 tier1
  const html = lib.SciBaseUI.sceneHtml(B.getBaseView(state, termsBySubject, B.defaultBase()));

  for (const [needle, why] of [
    ['main-s2.png', 'stage 1 → 第 2 階主樓圖'], ['初階研究站', ''], ['科學研究基地', '主樓預設門牌'],
    ['pav-nature-t2.png', '園圃 tier 1 → 第 2 級圖'], ['pav-earth-t1.png', '地科 0% → 荒蕪第 1 級圖'],
    ['data-target="main"', '門牌點擊掛鉤'], ['data-decor="d-n0"', '裝飾元素'], ['grade-gold', ''],
    ['onerror', '缺圖佔位防線'], ['💠', '晶能餘額顯示'],
  ]) assert.ok(html.includes(needle), `${needle} ${why}`);
});

test('SciBaseUI.sceneHtml 裝飾用百分比座標定位、自訂座標優先', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const termsBySubject = { nature: [{ id: 'n0', term: '光合作用', def: 'x', unit: 'u' }], biology: [], chemphys: [], earth: [] };
  const state = stateWithMastered(lib, ['n0']);
  const base = B.defaultBase();
  B.placeDecor(base, 'd-n0', 25, 75);
  const html = lib.SciBaseUI.sceneHtml(B.getBaseView(state, termsBySubject, base));
  assert.ok(html.includes('left:25%') && html.includes('top:75%'));
});

test('SciBaseUI.wallHtml 陳列三面榮譽；不含催促字眼', () => {
  const html = makeSandbox().SciBaseUI.wallHtml([
    { icon: '🏆', label: '段位巔峰', value: '🥇 金牌學者（260 分）' },
    { icon: '🔥', label: '最高連對', value: '9 題' },
    { icon: '📅', label: '守繼天數', value: '7 天' },
  ]);
  assert.ok(html.includes('金牌學者') && html.includes('9 題') && html.includes('成就牆'));
  assert.ok(!html.includes('還差'), '成就牆只陳列不催促（白帽）');
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] 實作 `js/base-ui.js`（本 task 先做渲染與開關；拖曳／換樣式／門牌／慶典在 Task 9）：

```js
// 科學基地 UI：場景渲染與互動。資料規則全在 js/base-store.js；本檔只管 DOM。
// sceneHtml/wallHtml 為純函式（node vm 可單測），頂層不碰 document，缺圖一律 onerror 換 emoji 佔位。
const SciBaseUI = (() => {
  const IMG_DIR = 'assets/base';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  // 缺圖佔位：換成 emoji span，保住版面尺寸（vocab-duel／字字珠璣已驗證手法）
  const fallback = (emoji) =>
    `onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${emoji}',className:'sb-emoji'}))"`;

  const MAIN_EMOJI = ['⛺', '🏠', '🏢', '🏛️', '🏰']; // 主樓五階佔位
  const PAV_EMOJI = { nature: '🌱', biology: '🔬', chemphys: '⚗️', earth: '🔭' };

  // ── 純函式：場景 HTML ──
  function sceneHtml(view) {
    const m = view.main;
    const main =
      `<button class="sb-main" type="button" data-target="main" data-stage="${m.stage}"` +
      ` aria-label="基地主樓・${esc(m.name)}（點擊掛門牌）">` +
      `<img src="${IMG_DIR}/main-s${m.stage + 1}.png" alt="" loading="lazy" ${fallback(MAIN_EMOJI[m.stage])}>` +
      `<span class="sb-plaque">${esc(view.plaques.main)}</span>` +
      `<span class="sb-main-rank">${esc(m.name)}・精通 ${m.masteredCount} 張${m.next ? `（再 ${m.next.at - m.masteredCount} 張升「${esc(m.next.name)}」）` : '（已達最高階）'}</span>` +
      `</button>`;
    // 其餘四段同一套路串接（規格如下），回傳 `sb-bg 底圖 + balance + motto + main + pavs + decors`：
    // - balance：`<span class="sb-balance">💠 ${view.balance}</span>`；motto：有 view.motto 才出
    //   `<span class="sb-motto">「${esc(view.motto.text)}」</span>`
    // - pavs：每館 `<button class="sb-pav sb-pav--${p.key}" data-target="${p.key}" data-tier="${p.tier}">`，內含
    //   `pav-${p.key}-t${p.tier + 1}.png`（fallback PAV_EMOJI）＋`sb-plaque--small` 門牌＋`sb-pav-meta`「${tierName}・${pct}%」
    // - decors：每件 `<div class="sb-decor grade-${d.grade}" data-decor="${d.id}" data-subject="${d.subject}"
    //   style="left:${d.x}%;top:${d.y}%" role="button" tabindex="0" aria-label="詞・主題・品階（可拖曳，點擊換樣式）">`，
    //   內含 `decor-${d.subject}-${d.styleIdx}.png`（`draggable="false"`、fallback themeEmoji）
    // - 底圖：`<div class="sb-bg">` 內 `bg-base.jpg`（fallback 🌌）
  }

  // ── 純函式：成就牆 HTML（只陳列不催促） ──
  function wallHtml(entries) {
    return `<h3 class="sb-sub">基地成就牆</h3><div class="sb-wall-grid">` +
      entries.map((e) =>
        `<div class="sb-wall-item"><span class="sb-wall-icon">${e.icon}</span>` +
        `<b>${esc(e.label)}</b><span>${esc(e.value)}</span></div>`,
      ).join('') + `</div>`;
  }

  // ── DOM 接線 ──
  const $ = (id) => document.getElementById(id);
  let getState = () => null;
  let getTermsBySubject = () => null;
  let base = null;

  function view() { return SciBaseStore.getBaseView(getState(), getTermsBySubject(), base); }
  function renderScene() { $('base-scene').innerHTML = sceneHtml(view()); }

  function open() {
    const state = getState();
    if (!state || !getTermsBySubject()) return; // 資料未就緒就不開
    base = SciBaseStore.loadBase();
    if (!SciBaseStore.isSeeded(base)) {
      SciBaseStore.seedCelebrated(state, getTermsBySubject(), base); // 首次開基地：既有進度靜默入帳
      SciBaseStore.saveBase(base);
    }
    renderScene();
    $('base-overlay').hidden = false;
    document.body.classList.add('base-open'); // 鎖背景捲動
  }

  function close() {
    $('base-overlay').hidden = true;
    document.body.classList.remove('base-open');
  }

  function init(opts) {
    getState = opts.getState;
    getTermsBySubject = opts.getTermsBySubject;
    $('btn-base').addEventListener('click', open);
    $('base-close').addEventListener('click', close);
  }

  return { sceneHtml, wallHtml, init };
})();
```

- [ ] `index.html` 三處修改。(1) 入口按鈕：`<div class="io-row">` 內 `#share-card-btn` 之前插入：

```html
    <button id="btn-base" class="io-btn io-btn--base">🏕️ 我的科學基地</button>
```

(2) overlay：在 `</main>` 之前插入：

```html
  <!-- 科學基地 -->
  <div id="base-overlay" class="base-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="base-title">
    <div class="base-panel">
      <div class="base-topbar">
        <h2 id="base-title">🏕️ 科學基地</h2>
        <button id="base-wall-btn" class="base-tool-btn" type="button">成就牆</button>
        <button id="base-reset" class="base-tool-btn" type="button">還原擺設</button>
        <button id="base-close" class="base-tool-btn" type="button">關閉</button>
      </div>
      <div id="base-scene" class="base-scene" aria-label="科學基地場景"></div>
      <p class="base-hint">拖曳裝飾自由擺放；點裝飾換樣式；點主樓或展館掛門牌、選銘言。晶能來自答對／連擊／精通／對戰勝，每日上限 100。</p>
    </div>
  </div>
```

(3) `<script>` 區在 `base-store.js` 後、`app.js` 前插入：

```html
<script src="js/base-ui.js"></script>
```

- [ ] `css/style.css` 檔尾追加。下面是**有行為意義的必要規則**（缺一不可：鎖背景捲動、場景 4:3、主樓置中 26% 寬、四展館四角 20% 寬、裝飾 8% 寬＋`touch-action:none` 供拖曳、品階三色外框、拖曳中視覺）：

```css
/* ───────── 科學基地 ───────── */
body.base-open { overflow: hidden; }
.base-overlay { position: fixed; inset: 0; z-index: 900; background: rgba(10,18,14,.72); display: flex; align-items: center; justify-content: center; padding: 12px; }
.base-panel { background: #f4faf5; border-radius: 14px; width: min(96vw, 760px); max-height: 94vh; overflow-y: auto; padding: 12px; }
.base-scene { position: relative; width: 100%; aspect-ratio: 4 / 3; margin-top: 10px; border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, #dff3ff, #eafbf0 55%, #d9eede); /* 缺底圖時的天光綠地 */ }
.sb-bg, .sb-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sb-main, .sb-pav { position: absolute; aspect-ratio: 1 / 1; border: 0; padding: 0; background: none; cursor: pointer; }
.sb-main { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 26%; z-index: 3; }
.sb-pav { width: 20%; z-index: 2; }
.sb-pav--nature { left: 6%; top: 10%; }  .sb-pav--biology { right: 6%; top: 10%; }
.sb-pav--chemphys { left: 6%; bottom: 6%; }  .sb-pav--earth { right: 6%; bottom: 6%; }
.sb-main img, .sb-pav img, .sb-decor img { width: 100%; height: 100%; object-fit: contain; }
.sb-decor { position: absolute; width: 8%; aspect-ratio: 1 / 1; transform: translate(-50%, -50%); cursor: grab; z-index: 4; touch-action: none; border-radius: 50%; }
.sb-decor img { pointer-events: none; }
.sb-decor.grade-gold { box-shadow: 0 0 0 2px #e0b64e, 0 0 8px rgba(224,182,78,.7); }
.sb-decor.grade-silver { box-shadow: 0 0 0 2px #b8c0c8; }
.sb-decor.grade-bronze { box-shadow: 0 0 0 2px #b07a4e; }
.sb-decor.is-dragging { cursor: grabbing; z-index: 9; filter: drop-shadow(0 4px 8px rgba(0,0,0,.35)); }
```

其餘純視覺 class（`.base-topbar`、`.base-tool-btn`、`.sb-emoji`、`.sb-balance` 徽章、`.sb-motto` 橫幅、`.sb-plaque` 門牌、`.sb-main-rank`/`.sb-pav-meta` 小字、`.base-hint`、`.sb-wall-grid`/`.sb-wall-item` 卡格）依綠白色系補齊即可，無測試依賴。

- [ ] `js/app.js` 接線：`boot()` 內 `wireIoButtons();` 之後插入（唯一接線點；`subjectTerms` 此時已載滿四科）：

```js
    SciBaseUI.init({
      getState: () => state,
      getTermsBySubject: () => Object.fromEntries(subjectTerms),
    });
```

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] 手動冒煙：`python3 -m http.server 8000` 開站確認（a）io-row 有「我的科學基地」入口（b）點開 overlay 見主樓＋四展館 emoji 佔位＋晶能餘額（c）console 無錯（d）390px 無橫向捲動。
- [ ] Commit：`git add -A && git commit -m "feat(基地): UI 骨架——入口/overlay/場景渲染＋佔位圖掛載點"`

---

## Task 9：互動（拖曳／換樣式／掛門牌）＋慶典動畫＋smoke 檢查

**Files:**
- 修改 `js/base-ui.js`
- 修改 `css/style.css`
- 修改 `test/logic.test.mjs`（新增純函式測試）
- 修改 `test/smoke.mjs`（基地開啟／拖曳／持久化步驟）

**Interfaces:**
- Consumes：Task 5/6/7 的 `placeDecor/resetPlacements/buyStyle/setPlaque/setMotto/pendingCelebrations/markCelebrated/getWall`、`saveBase`
- Produces（追加到 `SciBaseUI` 匯出，皆純函式）：
  - `stylePanelHtml(subjectKey, base, balance)`——該科 3 樣式卡（名稱＋價格＋已擁有／生效標記＋餘額）
  - `plaquePanelHtml(targetId, currentText)`——24 詞選詞鈕＋預覽＋（僅 `main`）6 句銘言選項
  - `celebrationHtml(celeb)`——慶典卡（title/text＋「繼續建設」鈕）
- 互動行為總則：拖曳放開才存檔、原地點擊開樣式面板；還原擺設過 `confirm`；慶典一次一件；成就牆鈕切換（細節見下方各實作步驟）

**Steps:**

- [ ] 追加失敗測試：

```js
test('SciBaseUI.stylePanelHtml 列 3 樣式、標記生效與價格', () => {
  const lib = makeSandbox();
  const html = lib.SciBaseUI.stylePanelHtml('nature', lib.SciBaseStore.defaultBase(), 45);
  for (const s of lib.SciBaseStore.STYLE_SHOP.nature) assert.ok(html.includes(s.name));
  assert.equal((html.match(/data-style=/g) || []).length, 3);
  assert.ok(html.includes('is-active'), '生效樣式有標記');
  assert.ok(html.includes('30'), '未擁有樣式顯示價格');
  assert.ok(html.includes('45'), '顯示目前餘額');
});

test('SciBaseUI.plaquePanelHtml 有 24 顆選詞鈕；main 才有銘言區', () => {
  const lib = makeSandbox();
  const B = lib.SciBaseStore;
  const html = lib.SciBaseUI.plaquePanelHtml('main', '科學研究基地');
  assert.equal((html.match(/data-word=/g) || []).length, B.PLAQUE_BANK.length);
  assert.ok(html.includes(B.MOTTO_BANK[0].text));
  assert.ok(!lib.SciBaseUI.plaquePanelHtml('nature', '自然園圃').includes(B.MOTTO_BANK[0].text), '展館門牌面板不含銘言區');
});

test('SciBaseUI.celebrationHtml 慶典卡含標題/內文/繼續鈕', () => {
  const html = makeSandbox().SciBaseUI.celebrationHtml({ id: 'stage-2', type: 'stage', title: '基地升階・進階實驗樓', text: '精通突破 10 張！' });
  assert.ok(html.includes('進階實驗樓') && html.includes('sb-epic-close'));
});
```

- [ ] 跑測試確認失敗：`node --test test/logic.test.mjs`
- [ ] `js/base-ui.js` 追加純函式（IIFE 內；`return` 補 `stylePanelHtml, plaquePanelHtml, celebrationHtml`）：

```js
  // ── 純函式：樣式面板／門牌面板／慶典卡 ──
  // stylePanelHtml(subjectKey, baseState, balance)：開頭 `sb-style-balance`「目前晶能：💠 ${balance}」，
  // 接 `.sb-style-list` 內每樣式一顆 `<button class="sb-style-opt${生效加 ' is-active'}" data-style="${i}">`——
  // 內含 `decor-${subjectKey}-${i}.png`（fallback 🎁）＋名稱＋狀態字（active→「使用中」、已擁有→「已擁有」、
  // 未擁有→「💠 ${cost}」；owned 讀 baseState.styles，缺值視為 [0]）。

  function celebrationHtml(celeb) {
    const icon = celeb.type === 'stage' ? '🏗️' : celeb.type === 'pav' ? '🏛️' : '🥇';
    return `<div class="sb-epic-card" role="dialog" aria-modal="true" aria-label="基地慶典" tabindex="-1">` +
      `<div class="sb-epic-icon">${icon}</div>` +
      `<h3>${esc(celeb.title)}</h3><p>${esc(celeb.text)}</p>` +
      `<button class="base-tool-btn" id="sb-epic-close" type="button">繼續建設</button></div>`;
  }
```

`plaquePanelHtml(targetId, currentText)` 依規格串 HTML 回傳（測試釘死 `data-word` 數量與銘言僅 main 出現）：(1) 預覽列 `<b id="sb-plaque-preview">esc(currentText)</b>`＋`#sb-plaque-clear`「清空重選」鈕；(2) `base-hint`「從詞庫選 1–2 個詞組成門牌（不開放自由輸入）。」；(3) `.sb-word-bank`——`PLAQUE_BANK` 每詞一顆 `<button class="sb-word" data-word="${w.id}">`；(4) 僅 `targetId === 'main'` 加「研究銘言」小標＋`.sb-motto-list`——「不掛銘言」鈕（`data-motto=""`）＋`MOTTO_BANK` 每句一顆 `data-motto="${m.id}"`；(5) 尾端 `.sb-panel-actions` 放 `#sb-plaque-save`「掛上門牌」與 `#sb-panel-close`「關閉」。

- [ ] `js/base-ui.js` 追加互動接線（IIFE 內）：

```js
  // ── 拖曳擺放：pointer 三事件，放開才存檔（局部更新不整場重繪）；原地點擊＝開樣式面板 ──
  function pctOf(scene, ev) { // 事件座標 → 場景百分比
    const r = scene.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * 100, y: ((ev.clientY - r.top) / r.height) * 100 };
  }

  function bindDrag(scene) {
    let drag = null; // { el, id, subject, moved }
    scene.addEventListener('pointerdown', (ev) => {
      const el = ev.target.closest('.sb-decor');
      if (!el) return;
      drag = { el, id: el.dataset.decor, subject: el.dataset.subject, moved: false };
      el.classList.add('is-dragging');
      el.setPointerCapture(ev.pointerId);
    });
    scene.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      drag.moved = true;
      const p = pctOf(scene, ev); // 即時跟手：left/top 各夾 2–98%
      drag.el.style.left = `${Math.max(2, Math.min(98, p.x))}%`;
      drag.el.style.top = `${Math.max(2, Math.min(98, p.y))}%`;
    });
    scene.addEventListener('pointerup', (ev) => {
      if (!drag) return;
      const { el, id, subject, moved } = drag;
      el.classList.remove('is-dragging');
      drag = null;
      if (moved) {
        const p = pctOf(scene, ev);
        if (SciBaseStore.placeDecor(base, id, p.x, p.y).ok) SciBaseStore.saveBase(base);
      } else { // 原地點擊＝開該科樣式面板
        openPanel(stylePanelHtml(subject, base, SciEconomy.getBalance()), (panel) => bindStylePanel(panel, subject));
      }
    });
  }
```

面板容器與兩個面板的接線寫成三支小函式（行為規格如下，實作自由但事件流不可變）：

- `openPanel(innerHtml, bind)`：先 `closePanel()`（一次只開一個）→ 建 `div.sb-panel#sb-panel` 塞進 `#base-scene`，`innerHtml` 沒帶 `sb-panel-close` 鈕就補一顆並綁 click＝`closePanel`，最後 `bind(panelEl)`。`closePanel()`＝`document.getElementById('sb-panel')?.remove()`。
- `bindStylePanel(panel, subjectKey)`：委派 click 到 `[data-style]` → `buyStyle(base, subjectKey, Number(btn.dataset.style))`；`!r.ok` 時 `alert(r.msg)`（不倒數不催促）；成功 `saveBase → renderScene()`（重繪清掉面板）→ 以最新狀態重開同面板。
- `bindPlaquePanel(panel, targetId)`：模組層 `plaquePick = []`，進面板先清空。委派 click：`[data-word]` 且未達 `PLAQUE_MAX` → push 詞 id、`#sb-plaque-preview` 更新為選詞連寫；`#sb-plaque-clear` → 清空並顯示「（重新選詞）」；`#sb-plaque-save` → 滿 `PLAQUE_MIN` 且 `setPlaque(...).ok` 才 `saveBase → renderScene()`；`[data-motto]` → `setMotto(base, id 或 null).ok` 後同前存檔重繪。

```js
  // ── 慶典播放：一次一件，關掉才放下一件（只加不扣，白帽；Esc 可關、焦點還原） ──
  function playCelebrations() {
    const pend = SciBaseStore.pendingCelebrations(getState(), getTermsBySubject(), base);
    if (!pend.length) return;
    const celeb = pend[0];
    const prevFocus = document.activeElement;
    const d = document.createElement('div');
    d.className = 'sb-epic';
    d.innerHTML = celebrationHtml(celeb);
    document.body.appendChild(d);
    const onKey = (e) => { if (e.key === 'Escape') done(); };
    const done = () => {
      document.removeEventListener('keydown', onKey);
      d.remove();
      SciBaseStore.markCelebrated(base, celeb.id);
      SciBaseStore.saveBase(base);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      playCelebrations(); // 佇列裡還有就接著放
    };
    document.addEventListener('keydown', onKey);
    d.querySelector('.sb-epic-card').focus();
    d.querySelector('#sb-epic-close').onclick = done;
  }
```

成就牆切換 `toggleWall()`：模組層旗標 `showingWall` 取反——開牆時 `$('base-scene').innerHTML = wallHtml(SciBaseStore.getWall(getState()))`、`#base-wall-btn` 文字改「回場景」；關牆時 `renderScene()`、按鈕文字改回「成就牆」。

並改兩處既有程式：(1) `init(opts)` 補接線：

```js
    bindDrag($('base-scene'));
    $('base-scene').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-target]');
      if (t && SciBaseStore.PLAQUE_TARGETS.includes(t.dataset.target)) {
        const targetId = t.dataset.target;
        openPanel(plaquePanelHtml(targetId, view().plaques[targetId]), (p) => bindPlaquePanel(p, targetId));
      }
    });
    $('base-wall-btn').addEventListener('click', toggleWall);
    $('base-reset').addEventListener('click', () => {
      // 白帽：二次確認＋明講不會失去任何東西
      if (confirm('把所有裝飾放回預設位置嗎？裝飾不會消失，只是回到原位。')) {
        SciBaseStore.resetPlacements(base);
        SciBaseStore.saveBase(base);
        renderScene();
      }
    });
```

(2) `open()` 尾端（`classList.add` 之後）加：

```js
    showingWall = false;
    $('base-wall-btn').textContent = '成就牆';
    playCelebrations();
```

- [ ] `css/style.css` 檔尾追加（下列為有行為意義的必要規則）：

```css
.sb-panel { position: absolute; inset: 8%; z-index: 8; background: rgba(255, 255, 255, .96); border: 1px solid #2e9e5b; border-radius: 12px; padding: .8em; overflow-y: auto; }
.sb-word-bank { display: grid; grid-template-columns: repeat(4, 1fr); gap: .35em; margin: .5em 0; }
.sb-epic { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(10, 18, 14, .6); animation: sbFade .3s ease; }
.sb-epic-card { background: #f4faf5; border: 2px solid #2e9e5b; border-radius: 14px; padding: 1.4em 1.8em; text-align: center; max-width: 22em; animation: sbPop .45s cubic-bezier(.2, 1.4, .4, 1); }
.sb-epic-icon { font-size: 3rem; animation: sbGlow 1.6s ease infinite alternate; }
@keyframes sbFade { from { opacity: 0; } }
@keyframes sbPop { from { transform: scale(.6); opacity: 0; } }
@keyframes sbGlow { from { filter: drop-shadow(0 0 2px #7fd8a4); } to { filter: drop-shadow(0 0 14px #7fd8a4); } }
```

其餘純視覺 class（`.sb-style-list`/`.sb-style-opt`（`is-active` 綠框）、`.sb-style-balance`、`.sb-word` 詞鈕、`.sb-preview`、`.sb-motto-list`/`.sb-motto-opt`、`.sb-panel-actions`）依既有綠白色系補齊即可，無測試依賴。

- [ ] `test/smoke.mjs` 在步驟 6（390px 檢查）之後追加基地步驟（沿用 `fails` 收集手法）：

```js
  // 7. 科學基地：種一張精通卡 → 開基地（首開 seed 不噴慶典）→ 拖曳裝飾 → 重整座標保留
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('science-hero:v1'));
    const id = Object.keys(s.cards)[0]; // 前面流程已有作答紀錄，必有卡
    s.cards[id] = { box: 4, due: 0, seen: 5, wrong: 0 }; // 直接推到精通（金級）
    localStorage.setItem('science-hero:v1', JSON.stringify(s));
    localStorage.removeItem('sci_base'); // 驗證首開 seed 行為
  });
  await page.reload();
  await page.click('#btn-base');
  await page.waitForSelector('#base-scene .sb-main');
  if (await page.locator('.sb-epic').count()) fails.push('首次開基地不該噴既有進度的慶典（seed 防洪水失效）');
  if (await page.locator('#base-scene .sb-pav').count() !== 4) fails.push('基地場景沒有四座展館');
  await page.waitForSelector('#base-scene .sb-decor');
  console.log('✅ 基地可開啟：主樓/四展館/裝飾都在、首開無慶典洪水');

  // 拖曳第一個裝飾到場景另一角，放開即存檔
  const decorId = await page.locator('#base-scene .sb-decor').first().getAttribute('data-decor');
  const sceneBox = await page.locator('#base-scene').boundingBox();
  const from = await page.locator('#base-scene .sb-decor').first().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(sceneBox.x + sceneBox.width * 0.7, sceneBox.y + sceneBox.height * 0.55, { steps: 8 });
  await page.mouse.up();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sci_base') || '{}').placements || {});
  if (!saved[decorId]) fails.push(`拖曳後 sci_base.placements 沒有 ${decorId}`);
  console.log('✅ 拖曳裝飾即時存檔（sci_base.placements）');

  // 重新整理 → 再開基地 → 自訂座標還原
  await page.reload();
  await page.click('#btn-base');
  await page.waitForSelector('#base-scene .sb-decor');
  const styleLeft = await page.locator(`#base-scene .sb-decor[data-decor="${decorId}"]`).evaluate((el) => el.style.left);
  const expected = await page.evaluate((id) => `${JSON.parse(localStorage.getItem('sci_base')).placements[id].x}%`, decorId);
  if (styleLeft !== expected) fails.push(`重整後裝飾座標未還原：style=${styleLeft} 存檔=${expected}`);
  console.log('✅ 重整後基地擺設持久化還原');
```

- [ ] 跑測試通過：`node --test test/logic.test.mjs`
- [ ] 收尾總驗證三支全綠：`node --test test/logic.test.mjs && node scripts/validate-all.mjs && node test/smoke.mjs`
- [ ] 手動冒煙補查（自動測不到的體感）：餘額不足買樣式跳「晶能不足」→ 賺滿 30 晶能買樣式成功且場景即時換裝；掛門牌「星辰學堂」／掛銘言＋取下正常；新精通一張後開基地跳一張慶典卡、關掉不重複。
- [ ] Commit：`git add -A && git commit -m "feat(基地): 拖曳/換樣式/掛門牌互動＋慶典動畫＋smoke 基地三檢"`

---

## 自我檢查（完成所有 Task 後逐項打勾）

- [ ] **Spec 覆蓋**：`SciEconomy`（`sci_econ`、earn/spend 單一入口、每日上限 100、收入表、`getBalance`、`recordAnswer`/`finish` 確切插入點）✓ `sci_base` 基座＋壞資料防護 ✓ 主樓五階綁 RANK_TIERS ✓ 四展館繁茂度 0/10/30/60/100 ✓ 詞卡實體化（金/銀/銅讀 `cards[id].wrong`）✓ id hash 散佈＋拖曳存檔＋還原 ✓ 門牌/銘言詞庫＋樣式換購 ✓ 慶典佇列＋成就牆＋整包視圖 ✓ UI 骨架＋app.js 接線 ✓ 互動＋慶典動畫＋smoke 基地三檢 ✓
- [ ] **慣例合規**：全部 `<script>` IIFE（無 `import`/`export`）；載入序 `store → flashcard → quiz → economy → weak → battle → base-store → base-ui → app`；單測全在 `logic.test.mjs`；`base-ui.js` 頂層不碰 `document`
- [ ] **無占位語**：全文無 TBD/TODO；每個改碼步驟都有完整程式碼區塊，或由測試釘死的逐條行為規格
- [ ] **跨 Task 簽名一致**：`earnCrystals(n, reason)`／`onAnswer(correct, prevBox, newBox)`／`getDecorations(state, termsBySubject, base)`／`buyStyle(base, subjectKey, styleIdx)` 等定義與呼叫端完全一致
- [ ] **唯讀鐵律**：`SciBaseStore`/`SciBaseUI` 從未對 `science-hero:v1` 呼叫 `SciStore.save`/`setCard`；`sci_econ` 只被 `SciEconomy` 寫入
- [ ] **白帽檢查**：無懲罰／扣除／倒數壓力；還原擺設二次確認且明講不失去東西；成就牆只陳列不催促；PvP 不發晶能；晶能全掛真實學習量
- [ ] **收尾驗證**：`node --test test/logic.test.mjs`（13 舊＋新測試全綠）、`node scripts/validate-all.mjs`、`node test/smoke.mjs`（11 舊檢查＋基地三檢全綠）；部署聽候另令

---

## 附錄：美術資產生圖清單（另批進行、開發不阻塞）

風格：走「明亮卡通科幻研究基地」統一風，先出關鍵張看效果再定案。透明背景圖走 magenta chroma-key 四角取色去背；批次生圖每張包 200s timeout、≥2 張雙 lane 並行（各 lane 乾淨 CODEX_HOME＋最新 auth.json）、`-c 'features.code_mode_host=false'`、prompt 尾端加落盤驗證。

| 檔名（放 `assets/base/`） | 內容（prompt 要點） | 規格 | 張數 |
|---|---|---|---|
| `bg-base.jpg` | 基地全景底圖：草原台地＋遠山天空，中央留空給主樓、四角留空給展館，卡通明亮、無文字 | 1600×1200 (4:3) | 1 |
| `main-s1.png` … `main-s5.png` | 主樓五階：見習營帳（帆布帳篷＋營火）→初階研究站（貨櫃小屋＋天線）→進階實驗樓（兩層玻璃實驗樓）→資深研究院（多棟連廊＋圓頂）→領域總部（高塔＋能量光環），逐階加高加華麗、同一視角同一色系 | 800×800 透明 | 5 |
| `pav-{key}-t1..t5.png` | 四展館各五級（荒蕪→鼎盛）。nature：枯土圍籬→冒芽→花圃蜂箱→溫室→發光生態穹頂；biology：空棚架→單櫃標本→顯微鏡工作台→雙層標本館→DNA 螺旋光雕館；chemphys：空桌→燒杯架→蒸餾管線→機械臂實驗艙→電漿能量塔；earth：石堆→岩石標本區→氣象站→小圓頂望遠鏡→星空觀測巨蛋 | 640×640 透明 | 20 |
| `decor-{key}-0..2.png` | 四科裝飾各三樣式，名稱＝`STYLE_SHOP` 十二項（素陶盆栽…星空投影儀），照品名畫 | 512×512 透明 | 12 |

合計 38 張。優先序：`bg-base` → `main-s1/s3/s5`（先出三階看效果再補中間）→ 裝飾 12 張 → 展館 20 張 → 主樓其餘 2 張。品階不另出圖：金／銀／銅一律由 CSS 外框光暈呈現，張數不隨品階翻倍。



