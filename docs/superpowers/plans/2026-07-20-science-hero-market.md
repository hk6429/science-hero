# 科學英雄科學市集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在科學英雄加入「科學市集」玩家間掛單交易市場：只交易**實驗道具**（放大鏡／護目鏡／能量飲，PvE 戰前可帶 1 件的消耗品）與**基地裝飾樣式券**（銅／銀／金三級）；**精靈／稚靈不可交易**。伺服器端驗貨（白名單＋價格帶）＋HMAC 簽章（`MKT_SECRET`，Web Crypto API）＋限流；買家**每日限購 3 件**（伺服器記帳）；**每週五 00:00–23:59 台灣時間限時開市**（瀏覽全週開放）；claimKey 事後領貨款（扣 10% 稅防通膨）；晶能走**伺服器端託管子帳 `mkt:wallet:`**（杜絕本機餘額改檔作弊）；感謝小卡 8 句預設選項（無自由文字）＋集市達人 `stars`（只露前五）＋「曾經持有」收藏冊；掛單**預設班級限定**（`sci_class`，即時對戰計畫建立），全站公開為每筆 opt-in；價格帶公開透明、無隱藏折扣。

**Architecture:** 後端一支 CF Pages Function 路由（`functions/api/mkt.js`，op-based POST）＋一支可單元測試的純邏輯核心（`functions/lib/market-core.js`），透過即時對戰計畫建好的 `functions/lib/_kv.js` D1 shim 讀寫，key 一律 `mkt:` 前綴；**後端只集中 Cloudflare Pages 一個平台**，鏡像站經 `SHAPI.call()` 打絕對網址共用。前端兩層分離：`js/market-store.js`（IIFE `SciMarketStore`，純邏輯與 `sci_market` 持久化）＋`js/market-ui.js`（IIFE `SciMarketUI`，overlay 渲染與流程）。晶能收支只走科學基地計畫的 `SciEconomy.earnCrystals/spendCrystals` 單一入口。

**Tech Stack:** 純前端 vanilla JS（**`<script>` IIFE 全域掛載，不是 ES module**）、Cloudflare Pages Functions + D1、`node:test` 單元測試（前端沿用 `test/logic.test.mjs` 的 vm 串接 harness、後端搭 `test/fake-d1.mjs` 假 D1）、`wrangler pages dev` 後端煙霧測試、`test/smoke.mjs` playwright-core UI 煙霧測試。

## 風險五項逐一對應（設計規格風險章節 → 本計畫防護點）

國小／國中生使用情境，五項風險每一項都有明確的 Task 落點，實作時不得省略：

| # | 風險 | 防護設計 | 落點 Task |
|---|---|---|---|
| 1 | **金錢化聯想** | 規則區**明寫「晶能不可兌換現實金錢或禮物」**；無任何真錢管道；道具原始取得＝晶能直購（價格公開）、市集只是轉售；10% 稅防「囤幣」 | Task 4（稅）、6（直購）、7（規則區） |
| 2 | **社交壓力／霸凌管道** | **無自由文字輸入**：小卡 8 句預設選、上架全下拉；達人榜**只露前五**＋不列金額、不公開倒數名單 | Task 3（小卡）、8（全下拉）、9（榜） |
| 3 | **跨班／陌生人交易** | 掛單**預設班級限定**（`sci_class`）；全站公開每筆 opt-in 預設關；班級名單驗證 fail-closed；暱稱髒話過濾 | Task 1（okNick）、2/3（隔離）、5（roster） |
| 4 | **公平性** | 價格帶依品階**公開設定**（原價 ×0.5–×1.5，規則頁全文照列）；成交價＝掛單價，**無殺價、無隱藏折扣**；限購人人相同 | Task 1（價格帶）、3（無折扣）、7（規則頁） |
| 5 | **共用後端資安** | D1 key 一律 `mkt:` namespace 絕不碰 `rt:`；獨立 `MKT_SECRET`（與 `RT_SECRET` 分離，單點外洩不波及）；secret 不入版控 | Global Constraints、Task 1（簽章）、9（secret） |

## Global Constraints

- **依賴兩份前置計畫先完成的基礎設施，只消費不重建**（Task 1／5／6／7 有前置檢查，缺件即停工回報，不得自行重建）：
  - `js/shapi.js` 全域 `SHAPI.call(path, body)`（IIFE；自動補絕對網址 `https://science-hero.pages.dev/api/`，離線／失敗回 `{ok:0, error}` soft error）——**Consumes：即時對戰計畫產出**。市集前端**一律走它，禁止直接 fetch 相對路徑**（鏡像站後端降級地雷）。
  - `functions/lib/_kv.js`（`kvFor(db)` Redis 風格 D1 shim）＋shim 資料表 schema＋`test/fake-d1.mjs` 假 D1——**Consumes：即時對戰計畫產出**。後端 handler 一律 CF Pages 原生 `export async function onRequestPost({ request, env })` 寫法。
  - `sci_class` localStorage 鑰匙（`{ classCode, nick }`）——**Consumes：即時對戰計畫〈全班戰況牆〉產出**。**降級策略：無班級碼只能瀏覽全站公開掛單、不能上架／購買／入金**；後端 roster fail-closed 同步擋住。
  - `js/economy.js` 的 `SciEconomy.earnCrystals/spendCrystals`＋基地樣式兌換入口——**Consumes：科學基地計畫產出**。晶能收支唯一入口；兌換入口未就緒時樣式券留背包、鈕顯示「基地開放後可兌換」（不阻塞本計畫）。
- **模組慣例**：新前端檔一律 `const SciXxx = (() => { ... return {...}; })();` IIFE 放 `js/` 平層，`index.html` 依相依序加 `<script>` 標籤；**不是 ES module、不開 `js/meta/`**。
- D1 key 一律 `mkt:` 前綴，絕不碰 `rt:`。HMAC secret 用獨立 `MKT_SECRET`（與 `RT_SECRET` 分開），**不入版控**（正式站 `wrangler pages secret put`、本機 `.dev.vars` 進 `.gitignore`）；簽章走 **Web Crypto API**（`crypto.subtle`，`sigOf` 是 async）。
- **精靈／稚靈不可交易**——伺服器白名單只認 `ITEM_CATALOG` 6 個 itemId，其他一律拒收（fail-closed）。
- **不開放任何自由文字輸入**：感謝小卡 8 句預設清單選；上架表單全下拉；暱稱來自 `sci_class`，後端仍再驗 `okNick`。
- **班級限定預設開**：掛單預設只在同 `sci_class.classCode` 可見可交易；全站公開為每筆 opt-in（預設不勾）。
- **定價透明**：價格帶由原價推導（×0.5–×1.5）、規則頁明列；**不做殺價／隨機折扣**；成交價＝掛單價。規則區明寫「**晶能不可兌換現實金錢或禮物**」。
- **伺服器端晶能託管**：市集交易一律動 `mkt:wallet:{classCode}:{nick}` 子帳，不信任本機餘額——入金（本機 `spendCrystals` 成功後打 `deposit`，失敗原路退回）、出金（`withdraw` 成功後本機 `earnCrystals`）、扣款與領款全在伺服器端；每日入金上限 100（改檔者灌不進超額）。
- **道具只進 PvE**：戰前帶 1 件、開戰即消耗；同裝置 PvP 與即時對戰**禁用**（公平）。道具本機數量無帳號可驗——防作弊焦點放晶能面（託管錢包）與市場面（白名單／簽章／限購），如實記載的務實取捨。
- 市集自有 localStorage 鑰匙一把 `sci_market`，讀寫全包 try/catch（比照 `js/store.js`）。邏輯層與 UI 層嚴格分離；UI 不直接動 localStorage、不算價格帶、不裸 fetch。
- **前後端常數防漂移**：`ITEM_CATALOG`／價格帶／時窗判定在 `functions/lib/market-core.js`（ESM）與 `js/market-store.js`（IIFE）各一份複本，`test/market-store.test.mjs` 用 vm harness 載入前端版、import 後端版，**逐項交叉比對鎖死**（Task 6）。
- 測試：後端 `node --test test/market-api.test.mjs`（`node:test` + `assert/strict` + 假 D1）；前端 `node --test test/market-store.test.mjs`（沿用 `test/logic.test.mjs` 的 vm 串接 harness）；UI 煙霧沿用 `test/smoke.mjs` playwright-core 模式。**每個 Task 先寫失敗測試**。
- 既有引擎不動：`SciQuiz`／`SciFlashcard`／`SciWeak` 簽名不改；答題記錄唯一出口仍是 `app.js` 的 `recordAnswer`；`js/battle.js` 只在 Task 8 加「戰前攜帶＋道具效果」薄掛鉤，必須 `typeof SciMarketStore !== 'undefined'` 防衛（`test/logic.test.mjs` harness 不載市集檔也要照常全綠）。
- 白帽原則：損失規避只用時間成本（週五限時開市、每日限購），不做懲罰性設計；買失敗不燒限購配額；下架無手續費。
- 開發副本 `~/projects/science-hero`（branch `master`），每個 Task 完成即 commit（`feat(mkt): <摘要>`），commit 前該 Task 測試必須全綠。繁中台灣用語。

## 共用契約（所有 Task 以此為準，不得漂移）

**消費的既有介面（既有檔已核實；前置計畫產出者為假設簽名，對應 Task 前置檢查逐一驗證）：**

```js
// js/shapi.js（即時對戰計畫產出；假設簽名，Task 7 前置檢查驗證）
window.SHAPI.call(path /* 'mkt' */, body /* object */)  // → Promise<json>；離線/HTTP失敗回 {ok:0, error}，前端一律優雅降級

// functions/lib/_kv.js（即時對戰計畫產出的 D1 shim；假設簽名，Task 1 前置檢查驗證）
kvFor(db).get(k)→Promise<string|null> / .set(k, v, {ex:sec}) / .incr(k, ttlSec)→Promise<number>（首建即帶 TTL）/ .del(...keys)
kvFor(db).zadd(k,{score,member}) / .zrange(k,start,stop,{rev?,withScores?}) / .zrem(k,...members) / .zincrby(k,delta,member)

// test/fake-d1.mjs（即時對戰計畫產出；假設匯出 fakeKv() 回傳同介面記憶體假件，Task 1 前置檢查以實檔為準）

// js/economy.js（科學基地計畫產出；假設簽名，Task 6 前置檢查驗證）
SciEconomy.getBalance() → number
SciEconomy.earnCrystals(amount, reason) → { ok, earned }   // 內部自管 sci_econ 與每日上限 100
SciEconomy.spendCrystals(amount, reason) → { ok }

// localStorage sci_class（即時對戰計畫產出）：{ classCode, nick }

// 既有檔（寫計畫前已核實）：
// js/store.js  SciStore.load/save/getCard/setCard/touchDailyStreak/todayStr/bumpDailyCount，key 'science-hero:v1'
// js/app.js    recordAnswer(target, correct, elapsedMs)＝答題唯一記錄出口（市集不碰）；masteredCardCount()
// js/battle.js SciBattle 匯出 OPPONENTS/TIER_UNLOCK/isUnlocked/calcDamage/mount/RANKS/rankInfo/rankWin/rankLose/
//              weekStr/COMPANION_TIERS/companionFor；mount 內 start(o) 建 battleState、onAnswer 答題、renderPicker 對手選單
// test/logic.test.mjs vm 串接 harness；test/smoke.mjs playwright-core 逐步點擊斷言（fails 陣列收錯）
```

**物品目錄（唯一交易白名單；6 個 itemId，前後端各一份複本、測試鎖同步）：**

```js
// kind: 'tool'＝實驗道具（消耗品，PvE 戰前可帶 1 件）；'deco'＝基地裝飾樣式券
export const ITEM_CATALOG = {
  energy:      { name: '能量飲',     emoji: '⚡', kind: 'tool', base: 30 },   // 開局 +10 HP
  magnifier:   { name: '放大鏡',     emoji: '🔍', kind: 'tool', base: 40 },   // 本場一次排除一個錯誤選項
  goggles:     { name: '護目鏡',     emoji: '🥽', kind: 'tool', base: 60 },   // 本場一次答錯不斷連擊
  deco_bronze: { name: '銅級樣式券', emoji: '🎫', kind: 'deco', base: 80 },
  deco_silver: { name: '銀級樣式券', emoji: '🎟️', kind: 'deco', base: 150 },
  deco_gold:   { name: '金級樣式券', emoji: '🏵️', kind: 'deco', base: 300 },  // 珍品：每班每週限量上架
};
```

三種道具原始取得＝晶能直購（原價 `base`，Task 6/7 直購攤位）；樣式券原始取得＝科學基地晶能換購；市集是玩家間轉售，金級樣式券為珍品。

**價格帶（透明規則，規則頁原文照列）：** 品階由原價推導——`base < 80` → `bronze`（銅品）、`80–200` → `silver`（銀品）、`> 200` → `gold`（金品）；掛單價必須為整數且落在 **原價 ×0.5 ～ ×1.5**：

| itemId | 品階 | 原價（直購） | 市集掛單價格帶 |
|---|---|---|---|
| energy 能量飲 | 銅品 | 30 | 15–45 |
| magnifier 放大鏡 | 銅品 | 40 | 20–60 |
| goggles 護目鏡 | 銀品* | 60 | 30–90 |
| deco_bronze 銅級樣式券 | 銀品 | 80 | 40–120 |
| deco_silver 銀級樣式券 | 銀品 | 150 | 75–225 |
| deco_gold 金級樣式券 | 金品（珍品） | 300 | 150–450 |

\* goggles 原價 60 仍屬 `bronze`（<80），以程式 `tierOf` 為準——品階只影響顯示與珍品限量。

**開市時窗（台灣時區 UTC+8，前後端同一支純函式）：** **每週五 00:00:00–23:59:59** 才可上架（`post`）與購買（`buy`）；`list`／`cancel`／`claim`／`stars`／`deposit`／`withdraw`／`wallet` 全週可用（平日只能瀏覽與善後）。

**市集後端 API（`POST /api/mkt`，全部 op 走同一支 function）：**

```js
{ op:'list',     classCode?, scope:'class'|'pub' }                    → { ok:1, list:[{ id, itemId, seller, price, ts, pub:0|1 }] }
{ op:'post',     itemId, price, seller, classCode, pub? }             → { ok:1, id, claimKey } | { ok:0, error }
{ op:'buy',      id, nick, classCode, cardId? }                       → { ok:1, itemId, price, wallet } | { ok:0, error }
{ op:'cancel',   id, claimKey }                                       → { ok:1, itemId } | { ok:0, error }
{ op:'claim',    id, claimKey, classCode }                            → { ok:1, crystals, buyer, card, wallet } | { ok:0, sold:0 } | { ok:0, error }
{ op:'deposit',  nick, classCode, amount }                            → { ok:1, wallet } | { ok:0, error }
{ op:'withdraw', nick, classCode, amount }                            → { ok:1, wallet } | { ok:0, error }
{ op:'wallet',   nick, classCode }                                    → { ok:1, wallet }
{ op:'stars',    classCode }                                          → { ok:1, top:[{ name, deals }] }   // 只回前五
```

**D1 key 一覽（全 `mkt:` 前綴）：**

| key | 型別 | 內容 | TTL |
|---|---|---|---|
| `mkt:item:{id}` | string | 掛單完整紀錄 JSON（含 claimKey、sig、sold、claimed、buyer、card） | 7 天 |
| `mkt:z:c:{classCode}` | zset | 班級掛單索引，score=price，member=公開欄位 JSON | 惰性清 |
| `mkt:z:pub` | zset | 全站公開掛單索引（opt-in 的掛單同時進班級與此） | 惰性清 |
| `mkt:wallet:{classCode}:{nick}` | string | 託管子帳晶能餘額（整數字串） | 無 |
| `mkt:dep:{classCode}:{nick}:{YYYY-MM-DD}` | string | 每日入金累計（上限 100） | 86400s |
| `mkt:buys:{classCode}:{nick}:{YYYY-MM-DD}` | counter | 買家每日限購 3 件伺服器硬擋 | 86400s |
| `mkt:posts:{classCode}:{nick}:{YYYY-MM-DD}` | counter | 賣家每日上架上限 3 筆 | 86400s |
| `mkt:lock:{id}` | counter | 購買搶單鎖（incr 首達者得） | 30s |
| `mkt:rl:{ip}` | counter | IP 限流（60 秒 30 次寫入） | 60s |
| `mkt:deals:{classCode}` | zset | 集市達人成交量（member=暱稱，score=成交數） | 無 |
| `mkt:rare:{classCode}:{weekKey}` | counter | 金品券每週每班限量上架張數（上限 5） | 8 天 |

**感謝小卡（前後端同一張表，僅存 cardId 1–8，0＝不送）：**

```js
export const THANKS_CARDS = [
  { id: 1, text: '謝謝你！這件寶物我會好好用在實驗裡！' },
  { id: 2, text: '市集有你真好，交易愉快！' },
  { id: 3, text: '價格真公道，讚！' },
  { id: 4, text: '正好缺這件，救了我這一場！' },
  { id: 5, text: '祝你下次對戰旗開得勝！' },
  { id: 6, text: '同班的科學夥伴，就是可靠！' },
  { id: 7, text: '你的基地一定蓋得很棒！' },
  { id: 8, text: '一起成為科學英雄吧！' },
];
```

**晶能流向（託管子帳設計，防本機改檔）：**

```
本機 SciEconomy ──spendCrystals＋deposit（每日上限100）──▶ mkt:wallet ──buy 原子扣款──▶（買家）
（賣家）claim：wallet += floor(price*0.9)（10% 稅蒸發＝回收）──withdraw──▶ 本機 earnCrystals（豁免上限）
```

---

## Task 1：後端純邏輯核心（驗貨・價格帶・開市時窗・HMAC 簽章）

**Files:**
- 新增 `functions/lib/market-core.js`（純函式與常數，零 I/O、零 D1，全部可單元測試）
- 新增 `test/market-api.test.mjs`

**Interfaces:**
- Consumes：`functions/lib/_kv.js`／`test/fake-d1.mjs`／D1 shim schema（即時對戰計畫產出）——本 Task 只做**存在性前置檢查**，缺件即停工回報。
- Produces（named exports，供 Task 2–5 handler 與測試使用）：
  ```js
  export const ITEM_CATALOG;                   // 同共用契約（6 個 itemId）
  export const TIER_LABEL;                     // { bronze:'銅品', silver:'銀品', gold:'金品' }
  export function tierOf(itemId)               // 非白名單一律 null＝精靈/稚靈與雜項全拒
  export function bandOf(itemId)               // → [lo, hi] | null（原價 ×0.5 上取整 ～ ×1.5 下取整）
  export function validPrice(itemId, price)    // 整數且落在 bandOf 區間
  export function isMarketOpen(nowMs)          // UTC+8 週五 00:00–23:59
  export function nextOpenText(nowMs)          // 下次開市提示字串
  export function weekKey(nowMs) / dayStr(nowMs)  // 金品券限量週桶／UTC+8 日界線分桶
  export function okNick(n) / okClass(c)       // 暱稱（1–12 字、無危險字元、過 BAD_WORDS）／班碼格式
  export async function sigOf(payload, secret) // HMAC-SHA256 hex 前 24 碼（Web Crypto API，async！）
  ```

**Steps:**

- [ ] 前置檢查（依賴即時對戰計畫，缺件即停工回報，不得自建）：
  ```bash
  cd ~/projects/science-hero
  test -f functions/lib/_kv.js && echo KV_OK || echo MISSING_KV
  test -f test/fake-d1.mjs && echo FAKED1_OK || echo MISSING_FAKED1
  test -f js/shapi.js && echo SHAPI_OK || echo MISSING_SHAPI
  ```
  任一 MISSING → 本計畫暫停，回報「即時對戰基礎設施未就緒」。同時核實 `test/fake-d1.mjs` 實際匯出名（假設 `fakeKv()`，不同則以實檔為準）。
- [ ] 寫失敗測試 `test/market-api.test.mjs`（`node:test` + `assert/strict`）：
  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import { ITEM_CATALOG, tierOf, bandOf, validPrice, isMarketOpen, weekKey, dayStr, okNick, okClass, sigOf } from '../functions/lib/market-core.js';

  test('ITEM_CATALOG：恰好 6 件、tool/deco 各 3；tierOf 白名單 fail-closed', () => {
    const ids = Object.keys(ITEM_CATALOG);
    assert.equal(ids.length, 6);
    assert.equal(ids.filter((i) => ITEM_CATALOG[i].kind === 'tool').length, 3);
    assert.equal(tierOf('energy'), 'bronze');
    assert.equal(tierOf('goggles'), 'bronze');       // 60 < 80 仍是銅品（程式為準）
    assert.equal(tierOf('deco_gold'), 'gold');
    assert.equal(tierOf('senlingdeer'), null);        // 稚靈 id 不在白名單
  });
  test('bandOf/validPrice：帶＝原價×0.5～×1.5，整數且含邊界', () => {
    assert.deepEqual(bandOf('energy'), [15, 45]);
    assert.deepEqual(bandOf('deco_gold'), [150, 450]);
    assert.equal(bandOf('nope'), null);
    assert.equal(validPrice('energy', 15), true);     // 下界
    assert.equal(validPrice('energy', 45), true);     // 上界
    assert.equal(validPrice('energy', 46), false);
    assert.equal(validPrice('energy', 20.5), false);  // 非整數
    assert.equal(validPrice('nope', 30), false);
  });
  test('isMarketOpen：UTC+8 週五 00:00 起、23:59 止', () => {
    // 2026-07-24 是週五。UTC+8 週五 00:00 = UTC 週四 16:00
    assert.equal(isMarketOpen(Date.UTC(2026, 6, 23, 15, 59)), false); // 週四 23:59
    assert.equal(isMarketOpen(Date.UTC(2026, 6, 23, 16, 0)), true);   // 週五 00:00
    assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 15, 59)), true);  // 週五 23:59
    assert.equal(isMarketOpen(Date.UTC(2026, 6, 24, 16, 0)), false);  // 週六 00:00
  });
  test('weekKey：週五起算的一週落同桶、跨週不同桶', () => {
    assert.equal(weekKey(Date.UTC(2026, 6, 24, 4, 0)), '2026-07-24');   // 7/24 週五
    assert.equal(weekKey(Date.UTC(2026, 6, 30, 4, 0)), '2026-07-24');   // 週四＝本週期最後一天
    assert.equal(weekKey(Date.UTC(2026, 6, 31, 4, 0)), '2026-07-31');   // 下個週五換桶
  });
  test('dayStr（UTC+8 日界線）／okNick／okClass', () => {
    assert.equal(dayStr(Date.UTC(2026, 6, 23, 16, 0)), '2026-07-24'); // UTC 週四 16:00＝台灣週五 00:00
    assert.equal(okNick('小明'), true);
    assert.equal(okNick('a'.repeat(13)), false);
    assert.equal(okNick('<img>'), false);
    assert.equal(okNick('笨蛋'), false);
    assert.equal(okClass('七年3班'), true);
    assert.equal(okClass('a;DROP'), false);
  });
  test('sigOf（async, Web Crypto）：同 payload 同 secret 穩定；欄位/secret 變動即不同', async () => {
    const p = { itemId: 'energy', price: 30, seller: '小明', id: 'abc123' };
    assert.equal(await sigOf(p, 's1'), await sigOf({ ...p }, 's1'));
    assert.equal((await sigOf(p, 's1')).length, 24);
    assert.notEqual(await sigOf(p, 's1'), await sigOf({ ...p, price: 31 }, 's1'));
    assert.notEqual(await sigOf(p, 's1'), await sigOf(p, 's2'));
  });
  ```
- [ ] 確認失敗：`cd ~/projects/science-hero && node --test test/market-api.test.mjs` → 全部 fail（module not found）。
- [ ] 最小實作 `functions/lib/market-core.js`：
  ```js
  // 科學市集純邏輯核心 — 驗貨白名單/價格帶/開市時窗/HMAC 簽章。
  // 只放純函式與常數（零 I/O），Node 與 CF Workers 都能跑；簽章走 Web Crypto（globalThis.crypto.subtle）。
  // 注意：js/market-store.js 有一份前端複本，改這裡必改那裡（test/market-store.test.mjs 交叉鎖同步）。

  export const ITEM_CATALOG = {
    energy:      { name: '能量飲',     emoji: '⚡', kind: 'tool', base: 30 },
    magnifier:   { name: '放大鏡',     emoji: '🔍', kind: 'tool', base: 40 },
    goggles:     { name: '護目鏡',     emoji: '🥽', kind: 'tool', base: 60 },
    deco_bronze: { name: '銅級樣式券', emoji: '🎫', kind: 'deco', base: 80 },
    deco_silver: { name: '銀級樣式券', emoji: '🎟️', kind: 'deco', base: 150 },
    deco_gold:   { name: '金級樣式券', emoji: '🏵️', kind: 'deco', base: 300 },
  };
  export const TIER_LABEL = { bronze: '銅品', silver: '銀品', gold: '金品' };

  export function tierOf(itemId) {
    const it = ITEM_CATALOG[itemId];
    if (!it) return null;
    return it.base < 80 ? 'bronze' : it.base <= 200 ? 'silver' : 'gold';
  }
  export function bandOf(itemId) {
    const it = ITEM_CATALOG[itemId];
    return it ? [Math.ceil(it.base * 0.5), Math.floor(it.base * 1.5)] : null;
  }
  export function validPrice(itemId, price) {
    const band = bandOf(itemId);
    if (!band || !Number.isInteger(price)) return false;
    return price >= band[0] && price <= band[1];
  }
  // 台灣時區固定 UTC+8（無日光節約）：每週五 00:00–23:59 開市
  export function isMarketOpen(nowMs = Date.now()) {
    return new Date(nowMs + 8 * 3600 * 1000).getUTCDay() === 5;
  }
  export function nextOpenText(nowMs = Date.now()) {
    const t = new Date(nowMs + 8 * 3600 * 1000);
    const fri = new Date(t.getTime() + (((5 - t.getUTCDay() + 7) % 7 || 7) * 86400000));
    return `每週五全天開市，下次開市：${fri.getUTCMonth() + 1}/${fri.getUTCDate()}（週五）`;
  }
  // 金品券限量週桶：以本週期（週五起算）的週五日期為桶名
  export function weekKey(nowMs = Date.now()) {
    const t = new Date(nowMs + 8 * 3600 * 1000);
    const back = (t.getUTCDay() - 5 + 7) % 7;                // 週五=0、週六=1、…、週四=6
    return new Date(t.getTime() - back * 86400000).toISOString().slice(0, 10);
  }
  export function dayStr(nowMs = Date.now()) {
    return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
  const BAD_WORDS = /笨蛋|白癡|白痴|智障|廢物|去死|王八蛋|三小|幹你|靠北|媽的|滾蛋|垃圾|腦殘|fuck|shit|bitch|asshole|idiot|stupid/i;
  export function okNick(n) {
    return typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 12 && !/[<>&"']/.test(n) && !BAD_WORDS.test(n);
  }
  export function okClass(c) {
    return typeof c === 'string' && /^[\w一-鿿]{1,20}$/.test(c);
  }
  // HMAC-SHA256 前 24 碼（Web Crypto：CF Workers 原生、Node 20+ 有 globalThis.crypto）
  export async function sigOf(p, secret) {
    const canon = JSON.stringify({ itemId: p.itemId, price: p.price, seller: p.seller, id: p.id }); // 欄序固定
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const buf = await crypto.subtle.sign('HMAC', key, enc.encode(canon));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  }
  ```
- [ ] 測試通過：`node --test test/market-api.test.mjs` → 全綠。並跑 `node --test test/logic.test.mjs` 確認既有 13 綠無回歸。
- [ ] Commit：`git add functions/lib/market-core.js test/market-api.test.mjs && git commit -m "feat(mkt): 後端純邏輯核心（物品白名單/價格帶/週五時窗/WebCrypto簽章）"`

## Task 2：後端 `post`（上架）與 `list`（瀏覽）＋每日上架上限＋wrangler 煙霧測試

**Files:**
- 新增 `functions/api/mkt.js`（handler、CORS、IP 限流、post/list 兩個 op；業務邏輯抽成可注入的 `mktOp`）
- 修改 `test/market-api.test.mjs`
- 修改 `.dev.vars`（新增 `MKT_SECRET=dev-secret` 與 `MKT_FORCE_OPEN=1`；檔案不入版控，先 `grep -q '^\.dev\.vars' .gitignore || echo '.dev.vars' >> .gitignore`）

**Interfaces:**
- Consumes：`functions/lib/_kv.js` 的 `kvFor(env.<D1 binding>)`（即時對戰計畫產出；**binding 名以 rtbattle 實作為準**，前置檢查 grep 取得）；`test/fake-d1.mjs` 的 `fakeKv()`；Task 1 全部 exports。
- Produces：
  - `export async function mktOp(redis, body, ctx, nowMs)`——業務邏輯單一入口（Task 3/4/5 持續擴充），`ctx = { secret, forceOpen, roster?, db? }`；`onRequestPost` 只做 wiring。
  - `post` → `{ok:1, id, claimKey}`；錯誤一律 `{ok:0, error:'<繁中訊息>'}`（HTTP 200）。`list` → `{ok:1, list:[...]}`（scope='pub' 不需 classCode——無班碼者的瀏覽降級通道）。
  - 每日上架上限：`mkt:posts:{classCode}:{nick}:{date}` incr > 3 拒收；IP 限流：非 list 的 op 每 IP 60 秒 30 次，超過 429。
  - 開市時窗：`post` 非週五拒收；`env.MKT_FORCE_OPEN === '1'` 跳過（僅本機 `.dev.vars`，正式站不設）。
  - zset member 標準序列化 `memberOf(rec)`：固定欄序 `{ id, itemId, seller, price, ts, pub }`（post/buy/cancel 三處共用，zrem 才對得起來）。

**Steps:**

- [ ] 前置檢查（取得 D1 binding 名，之後全計畫沿用）：
  ```bash
  cd ~/projects/science-hero
  grep -o 'env\.[A-Za-z_][A-Za-z0-9_]*' functions/api/*.js | sort -u
  # 記下 rtbattle 的 D1 binding（本計畫以下均寫 env.DB，實作時以此為準全案取代）
  ```
- [ ] 在 `test/market-api.test.mjs` 追加 handler 級失敗測試（用 `fakeKv()` 直接測 `mktOp`，不開 wrangler）：
  ```js
  import { mktOp } from '../functions/api/mkt.js';
  import { fakeKv } from './fake-d1.mjs';   // 即時對戰計畫產出；實際匯出名以該檔為準

  const ENV = { secret: 'test-secret', forceOpen: true };
  const OPEN_TS = Date.UTC(2026, 6, 24, 4, 0);   // 台灣週五中午，開市中

  test('post：合法上架回 id+claimKey，list 查得到', async () => {
    const r = fakeKv();
    const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal(a.ok, 1);
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.claimKey, 'string');
    const l = await mktOp(r, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS);
    assert.equal(l.list.length, 1);
    assert.equal(l.list[0].itemId, 'energy');
    assert.equal(l.list[0].price, 30);
    assert.equal(l.list[0].pub, 0);            // 預設班級限定
  });
  test('post：精靈/未知物品、價格出帶、髒話暱稱、壞班碼全拒', async () => {
    const r = fakeKv();
    assert.equal((await mktOp(r, { op: 'post', itemId: 'senlingdeer', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
    assert.equal((await mktOp(r, { op: 'post', itemId: 'energy', price: 999, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
    assert.equal((await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '笨蛋', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);
    assert.equal((await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'a;DROP' }, ENV, OPEN_TS)).ok, 0);
  });
  test('post：每人每日上架上限 3 筆', async () => {
    const r = fakeKv();
    for (let i = 0; i < 3; i++) assert.equal((await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
    const d = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal(d.ok, 0);
    assert.match(d.error, /3/);
  });
  test('post：非週五拒收（forceOpen=false）；pub opt-in 同步進全站索引', async () => {
    const r = fakeKv();
    const d = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
    assert.equal(d.ok, 0);
    assert.match(d.error, /週五/);
    await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo', pub: 1 }, ENV, OPEN_TS);
    const g = await mktOp(r, { op: 'list', scope: 'pub' }, ENV, OPEN_TS);   // 無班級碼也能看全站（降級通道）
    assert.equal(g.list.length, 1);
    assert.equal(g.list[0].pub, 1);
  });
  ```
- [ ] 確認失敗：`node --test test/market-api.test.mjs` → 新增測試 fail（mktOp 不存在）。
- [ ] 最小實作 `functions/api/mkt.js`：
  ```js
  // 科學市集後端路由 — 白名單驗貨＋HMAC 簽章＋IP 限流＋託管錢包；D1 key 一律 mkt: 前綴。
  import { kvFor } from '../lib/_kv.js';
  import { tierOf, bandOf, validPrice, isMarketOpen, weekKey, dayStr, okNick, okClass, sigOf, TIER_LABEL } from '../lib/market-core.js';

  const ITEM = (id) => `mkt:item:${id}`;
  const ZCLASS = (c) => `mkt:z:c:${c}`;
  const ZPUB = 'mkt:z:pub';
  const ITEM_TTL = 7 * 86400;
  const DAILY_POST_CAP = 3;
  const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  export const memberOf = (rec) => JSON.stringify({ id: rec.id, itemId: rec.itemId, seller: rec.seller, price: rec.price, ts: rec.ts, pub: rec.pub });
  const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };

  export async function mktOp(redis, body, ctx, nowMs = Date.now()) {
    const { op } = body || {};
    const open = ctx.forceOpen || isMarketOpen(nowMs);

    if (op === 'list') {
      const scope = body.scope === 'pub' ? 'pub' : 'class';
      if (scope === 'class' && !okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
      const raw = await redis.zrange(scope === 'pub' ? ZPUB : ZCLASS(body.classCode), 0, 49);
      return { ok: 1, list: raw.map(parse).filter(Boolean) };
    }

    if (op === 'post') {
      if (!open) return { ok: 0, error: '市集只在每週五開市，今天先逛逛吧' };
      const { itemId, seller, classCode } = body;
      const price = Math.round(Number(body.price) || 0);
      if (!tierOf(itemId)) return { ok: 0, error: '這件不在市集可交易清單（精靈與稚靈是夥伴，不是商品）' };
      if (!validPrice(itemId, price)) { const [lo, hi] = bandOf(itemId); return { ok: 0, error: `${TIER_LABEL[tierOf(itemId)]}定價要在 ${lo}–${hi} 晶能` }; }
      if (!okNick(seller)) return { ok: 0, error: '暱稱不合法' };
      if (!okClass(classCode)) return { ok: 0, error: '請先在即時對戰設定班級代碼' };
      const posts = await redis.incr(`mkt:posts:${classCode}:${seller.trim()}:${dayStr(nowMs)}`, 86400);
      if (posts > DAILY_POST_CAP) return { ok: 0, error: `每天最多上架 ${DAILY_POST_CAP} 筆，明天再來` };
      const id = randHex(6);
      const claimKey = randHex(12);
      const rec = { id, itemId, seller: seller.trim(), price, ts: nowMs, classCode, pub: body.pub ? 1 : 0 };
      const sig = await sigOf({ itemId, price, seller: rec.seller, id }, ctx.secret);
      await redis.set(ITEM(id), JSON.stringify({ ...rec, claimKey, sig, sold: 0, claimed: 0, card: 0 }), { ex: ITEM_TTL });
      await redis.zadd(ZCLASS(classCode), { score: price, member: memberOf(rec) });
      if (rec.pub) await redis.zadd(ZPUB, { score: price, member: memberOf(rec) });
      return { ok: 1, id, claimKey };
    }
    return { ok: 0, error: 'bad op' };
  }

  async function rateLimited(request, redis) {
    const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    return (await redis.incr(`mkt:rl:${ip}`, 60)) > 30;
  }
  const ORIGINS = ['https://science-hero-hk6429.vercel.app', 'https://science-hero.pages.dev', 'https://science-hero.netlify.app', 'http://localhost:8788', 'http://localhost:8765'];
  // corsHeaders(origin)／onRequestOptions：比照 rtbattle 計畫的 functions/api/rt.js 同款寫法（白名單 ORIGINS、POST/OPTIONS、no-store）
  export async function onRequestPost({ request, env }) {
    const headers = corsHeaders(request.headers.get('origin'));
    const redis = kvFor(env.DB);   // ← binding 名以前置檢查輸出為準
    let body;
    try { body = await request.json(); } catch { body = {}; }
    try {
      if ((body || {}).op !== 'list' && (await rateLimited(request, redis))) {
        return new Response(JSON.stringify({ ok: 0, error: '操作太頻繁，請稍候再試' }), { status: 429, headers });
      }
      const ctx = { secret: env.MKT_SECRET || 'mkt-dev', forceOpen: env.MKT_FORCE_OPEN === '1', db: env.DB };
      return new Response(JSON.stringify(await mktOp(redis, body, ctx)), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: 0, error: String((e && e.message) || e) }), { status: 500, headers });
    }
  }
  ```
- [ ] 測試通過：`node --test test/market-api.test.mjs` → 全綠。
- [ ] wrangler 煙霧測試（真 D1 local）：
  ```bash
  cd ~/projects/science-hero
  grep -q '^\.dev\.vars' .gitignore || echo '.dev.vars' >> .gitignore
  printf 'MKT_SECRET=dev-secret\nMKT_FORCE_OPEN=1\n' >> .dev.vars   # 不覆蓋 rtbattle 已寫的 RT_SECRET
  npx wrangler pages dev . --port 8788 &   # 背景啟動，等 5 秒
  sleep 5
  curl -s -X POST http://localhost:8788/api/mkt -H 'Content-Type: application/json' -d '{"op":"list","classCode":"demo","scope":"class"}'
  # 預期輸出：{"ok":1,"list":[]}
  curl -s -X POST http://localhost:8788/api/mkt -H 'Content-Type: application/json' -d '{"op":"post","itemId":"energy","price":30,"seller":"小明","classCode":"demo"}'
  # 預期輸出：{"ok":1,"id":"<12hex>","claimKey":"<24hex>"}；再打一次 list 應看到該筆掛單（pub:0）
  kill %1
  ```
  若 shim 資料表不存在報 SQL 錯 → 回頭跑即時對戰計畫的 migration（`wrangler d1 execute … --local`），不得自建新 schema。
- [ ] Commit：`git add -A && git commit -m "feat(mkt): 上架/瀏覽op＋每日上架上限＋IP限流＋週五時窗擋門＋wrangler煙霧通過"`

## Task 3：後端 `buy`（每日限購 3 件・簽章驗證・錢包原子扣款・感謝小卡）＋ `deposit`/`withdraw`/`wallet`

**Files:**
- 修改 `functions/api/mkt.js`
- 修改 `test/market-api.test.mjs`

**Interfaces:**
- Produces：
  - `buy` → `{ok:1, itemId, price, wallet}`。驗證順序（**限購最後才 incr，買失敗不燒配額**）：開市中 → 參數合法 → 搶單鎖（`mkt:lock:{id}` incr 首達者得）→ 掛單存在未售出 → 非自己掛的 → 班級隔離（同班或 `rec.pub`）→ HMAC 簽章相符（防 D1 被竄改）→ 錢包夠 → 每日限購 → **原子扣款**（扣款、zrem、標記 sold 同請求連續完成）。
  - `cardId`：整數 1–8 之外一律存 0（不回錯誤，小卡是加分項）。無殺價／折扣——成交價＝掛單價。
  - `deposit`（amount 整數、每日累計上限 100）／`withdraw`（餘額夠才放行）／`wallet`（查詢）→ 皆 `{ok:1, wallet}`，全週可用。
  - 錢包餘額整數字串 get/set（shim 無 incrby；低併發 read-modify-write 可接受，搶單鎖已擋唯一高風險競態＝同單雙買）。

**Steps:**

- [ ] 追加失敗測試：
  ```js
  async function seedWallet(r, classCode, nick, amount) {   // 測試 helper：走正式 deposit 路徑入金
    return mktOp(r, { op: 'deposit', nick, classCode, amount }, ENV, OPEN_TS);
  }

  test('deposit/wallet/withdraw：入金累計、查詢、出金；每日入金上限 100', async () => {
    const r = fakeKv();
    assert.equal((await seedWallet(r, 'demo', '小華', 60)).wallet, 60);
    assert.equal((await seedWallet(r, 'demo', '小華', 40)).wallet, 100);
    assert.match((await seedWallet(r, 'demo', '小華', 1)).error, /上限/);
    assert.equal((await mktOp(r, { op: 'wallet', nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).wallet, 100);
    assert.equal((await mktOp(r, { op: 'withdraw', nick: '小華', classCode: 'demo', amount: 30 }, ENV, OPEN_TS)).wallet, 70);
    assert.equal((await mktOp(r, { op: 'withdraw', nick: '小華', classCode: 'demo', amount: 999 }, ENV, OPEN_TS)).ok, 0);
  });
  test('buy：合法購買回 itemId+price+wallet；掛單從 list 消失；小卡存檔；錢包正確扣款', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '小華', 50);
    const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    const b = await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo', cardId: 3 }, ENV, OPEN_TS);
    assert.deepEqual([b.ok, b.itemId, b.price, b.wallet], [1, 'energy', 30, 20]);
    assert.equal((await mktOp(r, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS)).list.length, 0);
    const rec = JSON.parse(await r.get(`mkt:item:${a.id}`));
    assert.equal(rec.sold, 1); assert.equal(rec.buyer, '小華'); assert.equal(rec.card, 3);
  });
  test('buy：錢包不足、買自己的、別班掛單、簽章竄改全拒', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '小華', 100);
    const a = await mktOp(r, { op: 'post', itemId: 'goggles', price: 90, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    assert.match((await mktOp(r, { op: 'buy', id: a.id, nick: '沒錢仔', classCode: 'demo' }, ENV, OPEN_TS)).error, /晶能不足|入金/);
    assert.equal((await mktOp(r, { op: 'buy', id: a.id, nick: '小明', classCode: 'demo' }, ENV, OPEN_TS)).ok, 0);   // 買自己的
    assert.match((await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: '別班' }, ENV, OPEN_TS)).error, /別班/);
    const rec = JSON.parse(await r.get(`mkt:item:${a.id}`)); rec.price = 1;   // 竄改價格 → 簽章失效
    await r.set(`mkt:item:${a.id}`, JSON.stringify(rec));
    assert.match((await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).error, /簽章/);
  });
  test('buy：每日限購 3 件伺服器硬擋；失敗的購買不燒配額', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '小華', 100);   // 15×4=60 夠買四件
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await mktOp(r, { op: 'post', itemId: 'energy', price: 15, seller: `賣家${i}`, classCode: 'demo' }, ENV, OPEN_TS)).id);
    await mktOp(r, { op: 'buy', id: 'no-such-id', nick: '小華', classCode: 'demo' }, ENV, OPEN_TS);   // 失敗不計
    for (let i = 0; i < 3; i++) assert.equal((await mktOp(r, { op: 'buy', id: ids[i], nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
    const d = await mktOp(r, { op: 'buy', id: ids[3], nick: '小華', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal(d.ok, 0);
    assert.match(d.error, /限購/);
  });
  test('buy：搶單鎖擋同單雙買；非週五拒買但 deposit 平日照常', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '小華', 50);
    const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    await r.incr(`mkt:lock:${a.id}`, 30);   // 模擬另一位買家正持有鎖
    assert.match((await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo' }, ENV, OPEN_TS)).error, /結帳中|手慢/);
    const WED = Date.UTC(2026, 6, 22, 4, 0);
    assert.equal((await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo' }, { ...ENV, forceOpen: false }, WED)).ok, 0);
    assert.equal((await mktOp(r, { op: 'deposit', nick: '小華', classCode: 'demo', amount: 10 }, { ...ENV, forceOpen: false }, WED)).ok, 1);
  });
  ```
- [ ] 確認失敗：`node --test test/market-api.test.mjs`。
- [ ] 最小實作，在 `mktOp` 追加（錢包 helper 與四個 op）：
  ```js
  const DAILY_BUY_CAP = 3;
  const DAILY_DEP_CAP = 100;   // 對齊晶能每日獲取上限
  const WALLET = (c, n) => `mkt:wallet:${c}:${n}`;
  const getWallet = async (redis, c, n) => Math.max(0, Math.round(Number(await redis.get(WALLET(c, n))) || 0));
  const setWallet = (redis, c, n, v) => redis.set(WALLET(c, n), String(Math.max(0, Math.round(v))));

  if (op === 'wallet' || op === 'deposit' || op === 'withdraw') {
    const { nick, classCode } = body;
    if (!okNick(nick) || !okClass(classCode)) return { ok: 0, error: '參數不合法' };
    const cur = await getWallet(redis, classCode, nick.trim());
    if (op === 'wallet') return { ok: 1, wallet: cur };
    const amount = Math.round(Number(body.amount) || 0);
    if (!Number.isInteger(amount) || amount < 1) return { ok: 0, error: '金額不合法' };
    if (op === 'deposit') {
      const dkey = `mkt:dep:${classCode}:${nick.trim()}:${dayStr(nowMs)}`;
      const depped = Math.round(Number(await redis.get(dkey)) || 0);
      if (depped + amount > DAILY_DEP_CAP) return { ok: 0, error: `單日入金上限 ${DAILY_DEP_CAP} 晶能（今天已入 ${depped}）` };
      await redis.set(dkey, String(depped + amount), { ex: 86400 });
      await setWallet(redis, classCode, nick.trim(), cur + amount);
      return { ok: 1, wallet: cur + amount };
    }
    if (cur < amount) return { ok: 0, error: `錢包只有 ${cur} 晶能，不夠出金` };
    await setWallet(redis, classCode, nick.trim(), cur - amount);
    return { ok: 1, wallet: cur - amount };
  }

  if (op === 'buy') {
    if (!open) return { ok: 0, error: '市集只在每週五開市，今天先逛逛吧' };
    const { id, nick, classCode } = body;
    if (typeof id !== 'string' || !okNick(nick) || !okClass(classCode)) return { ok: 0, error: '參數不合法' };
    if ((await redis.incr(`mkt:lock:${id}`, 30)) > 1) return { ok: 0, error: '手慢一步，這件正被別人結帳中' };
    const rec = parse(await redis.get(ITEM(id)));
    if (!rec || rec.sold) return { ok: 0, error: '這件已被買走或下架了' };
    if (rec.seller === nick.trim()) return { ok: 0, error: '不能買自己的掛單' };
    if (rec.classCode !== classCode && !rec.pub) return { ok: 0, error: '這是別班市集的掛單' };
    if ((await sigOf({ itemId: rec.itemId, price: rec.price, seller: rec.seller, id: rec.id }, ctx.secret)) !== rec.sig) return { ok: 0, error: '簽章不符，掛單作廢' };
    const wallet = await getWallet(redis, classCode, nick.trim());
    if (wallet < rec.price) return { ok: 0, error: `市集錢包晶能不足（現有 ${wallet}，需要 ${rec.price}）——先入金再來` };
    const buys = await redis.incr(`mkt:buys:${classCode}:${nick.trim()}:${dayStr(nowMs)}`, 86400);
    if (buys > DAILY_BUY_CAP) return { ok: 0, error: '每日限購 3 件（把撿寶的樂趣留給明天）' };
    const cardId = Number.isInteger(body.cardId) && body.cardId >= 1 && body.cardId <= 8 ? body.cardId : 0;
    await setWallet(redis, classCode, nick.trim(), wallet - rec.price);   // 原子步驟 1：扣款
    await redis.zrem(ZCLASS(rec.classCode), memberOf(rec));               // 原子步驟 2：下索引（memberOf 欄位此刻未變動）
    if (rec.pub) await redis.zrem(ZPUB, memberOf(rec));
    rec.sold = 1; rec.soldTs = nowMs; rec.buyer = nick.trim(); rec.card = cardId;
    await redis.set(ITEM(id), JSON.stringify(rec), { ex: ITEM_TTL });     // 原子步驟 3：標記售出
    return { ok: 1, itemId: rec.itemId, price: rec.price, wallet: wallet - rec.price };
  }
  ```
  注意順序：**先 zrem 再改 rec**（`memberOf` 用未售出時的欄位值）；D1 shim 無交易——搶單鎖＋三步固定順序等效保證原子性，最壞情況損失上限一件道具價。
- [ ] 測試通過：`node --test test/market-api.test.mjs` → 全綠。
- [ ] Commit：`git commit -am "feat(mkt): 購買op（搶單鎖/簽章驗證/每日限購/託管錢包原子扣款/感謝小卡）＋入金出金"`

## Task 4：後端 `cancel`（下架）與 `claim`（claimKey 領貨款・10% 稅）

**Files:**
- 修改 `functions/api/mkt.js`
- 修改 `test/market-api.test.mjs`

**Interfaces:**
- Produces：
  - `cancel` → `{ok:1, itemId}`（未售出才可下架；zset 同步移除；item 刪除；**無下架手續費**）。
  - `claim` → 已售出：`{ok:1, crystals: floor(price*0.9), buyer, card, wallet}`（**貨款直接入賣家託管錢包**，10% 稅蒸發防通膨）；未售出：`{ok:0, sold:0}`；已領過拒。需帶 `classCode` 定位錢包，與 `rec.classCode` 不符即拒。
  - 兩者全週可用（善後不是交易，不受週五時窗限制）。

**Steps:**

- [ ] 追加失敗測試：
  ```js
  test('cancel：憑 claimKey 下架；錯 key 拒絕；售出後不可下架', async () => {
    const r = fakeKv();
    const a = await mktOp(r, { op: 'post', itemId: 'magnifier', price: 40, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal((await mktOp(r, { op: 'cancel', id: a.id, claimKey: 'wrong' }, ENV, OPEN_TS)).ok, 0);
    const c = await mktOp(r, { op: 'cancel', id: a.id, claimKey: a.claimKey }, ENV, OPEN_TS);
    assert.equal(c.ok, 1); assert.equal(c.itemId, 'magnifier');
    assert.equal((await mktOp(r, { op: 'list', classCode: 'demo', scope: 'class' }, ENV, OPEN_TS)).list.length, 0);
  });
  test('claim：售出後領款＝floor(price*0.9) 入託管錢包、附買家與小卡；重複領拒絕；未售出回 sold:0', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '小華', 100);
    const a = await mktOp(r, { op: 'post', itemId: 'goggles', price: 33, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal((await mktOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey, classCode: 'demo' }, ENV, OPEN_TS)).sold, 0);
    await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo', cardId: 5 }, ENV, OPEN_TS);
    const k = await mktOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey, classCode: 'demo' }, ENV, OPEN_TS);
    assert.deepEqual([k.ok, k.crystals, k.buyer, k.card, k.wallet], [1, 29, '小華', 5, 29]);   // floor(33*0.9)=29，賣家錢包 0→29
    assert.equal((await mktOp(r, { op: 'wallet', nick: '小明', classCode: 'demo' }, ENV, OPEN_TS)).wallet, 29);
    assert.match((await mktOp(r, { op: 'claim', id: a.id, claimKey: a.claimKey, classCode: 'demo' }, ENV, OPEN_TS)).error, /領過/);
  });
  test('claim/cancel：非週五也可用（善後不受時窗限制）', async () => {
    const r = fakeKv();
    const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ENV, OPEN_TS);
    const c = await mktOp(r, { op: 'cancel', id: a.id, claimKey: a.claimKey }, { ...ENV, forceOpen: false }, Date.UTC(2026, 6, 22, 4, 0));
    assert.equal(c.ok, 1);
  });
  ```
- [ ] 確認失敗：`node --test test/market-api.test.mjs`。
- [ ] 最小實作，在 `mktOp` 追加：
  ```js
  const TAX = 0.1;   // 10% 稅蒸發：回收晶能防通膨（規則頁明列）

  if (op === 'cancel') {
    const rec = parse(await redis.get(ITEM(body.id)));
    if (!rec || rec.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (rec.sold) return { ok: 0, error: '已售出，請領貨款' };
    await redis.zrem(ZCLASS(rec.classCode), memberOf(rec));
    if (rec.pub) await redis.zrem(ZPUB, memberOf(rec));
    await redis.del(ITEM(body.id));
    return { ok: 1, itemId: rec.itemId };
  }

  if (op === 'claim') {
    const rec = parse(await redis.get(ITEM(body.id)));
    if (!rec || rec.claimKey !== body.claimKey) return { ok: 0, error: '找不到掛單' };
    if (rec.classCode !== body.classCode) return { ok: 0, error: '班級代碼不符' };
    if (!rec.sold) return { ok: 0, sold: 0 };
    if (rec.claimed) return { ok: 0, error: '貨款已領過' };
    rec.claimed = 1;
    await redis.set(ITEM(body.id), JSON.stringify(rec), { ex: ITEM_TTL });
    const crystals = Math.floor(rec.price * (1 - TAX));
    const w = await getWallet(redis, rec.classCode, rec.seller);
    await setWallet(redis, rec.classCode, rec.seller, w + crystals);
    return { ok: 1, crystals, buyer: rec.buyer || '', card: rec.card || 0, wallet: w + crystals };
  }
  ```
- [ ] 測試通過：`node --test test/market-api.test.mjs` → 全綠。
- [ ] Commit：`git commit -am "feat(mkt): 下架與claimKey領款（10%稅回收/貨款入託管錢包/防重複領/全週可善後）"`

## Task 5：後端班級名單驗證（fail-closed）＋珍品每週限量＋集市達人 `stars`

**Files:**
- 修改 `functions/api/mkt.js`
- 修改 `test/market-api.test.mjs`

**Interfaces:**
- Consumes：rtbattle〈全班戰況牆〉寫入的班級名單（**假設**為 zset `rt:roster:{classCode}`；**實際鍵名以其實作為準**，前置檢查後只改 `rosterKey()` 一個 helper）。單元測試一律走 `ctx.roster`（`Set<string>` 注入），不碰真 D1。
- Produces：
  - `inRoster(redis, ctx, classCode, nick)`：`ctx.roster` 有值走注入；否則查 rtbattle 名單 zset；**查無一律 false（fail-closed）**。`post`／`buy`／`deposit` 三個交易入口全加名單驗證，不在名單 → `{ok:0, error:'請先在即時對戰的全班戰況牆報到，才能進市集交易'}`。
  - **降級策略（rtbattle 未執行時）**：名單查無＝全拒交易，但 `list`（含 `scope:'pub'`）不驗名單——**未報到者只能瀏覽、不能交易**，與 Task 7 前端降級文案互相呼應。
  - `post` 珍品限量：`tierOf === 'gold'` 時 `incr(mkt:rare:{classCode}:{weekKey}, 8*86400)` > 5 即拒（**放所有驗證最後一關才 incr**）。
  - 新 op `{op:'stars', classCode}` → `{ok:1, top:[{name, deals}]}`（**只回前五**，高→低）；`buy` 成功時買賣雙方 `zincrby(mkt:deals:{classCode}, 1, …)` 各 +1（**只計次數不計金額**，避免財富攀比）。

**Steps:**

- [ ] 前置檢查（確認 rtbattle 名單鍵名）：
  ```bash
  cd ~/projects/science-hero
  grep -n 'rt:' functions/api/rt*.js | grep -i 'roster\|wall\|member' || echo CHECK_RTBATTLE_PLAN
  # 以輸出的實際鍵名改寫 rosterKey()；grep 不到就打開 rtbattle 計畫文件核對其 D1 key 表
  ```
- [ ] 追加失敗測試：
  ```js
  const ROSTER_ENV = { ...ENV, roster: new Set(['小明', '小華', '小美']) };

  test('roster fail-closed：名單外 post/buy/deposit 全拒、名單內放行；list 不驗名單（降級可瀏覽）', async () => {
    const r = fakeKv();
    assert.match((await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '路人甲', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).error, /報到/);
    assert.match((await mktOp(r, { op: 'deposit', nick: '路人甲', classCode: 'demo', amount: 10 }, ROSTER_ENV, OPEN_TS)).error, /報到/);
    const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '小明', classCode: 'demo' }, ROSTER_ENV, OPEN_TS);
    assert.equal(a.ok, 1);
    assert.match((await mktOp(r, { op: 'buy', id: a.id, nick: '路人甲', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).error, /報到/);
    await mktOp(r, { op: 'deposit', nick: '小華', classCode: 'demo', amount: 50 }, ROSTER_ENV, OPEN_TS);
    assert.equal((await mktOp(r, { op: 'buy', id: a.id, nick: '小華', classCode: 'demo' }, ROSTER_ENV, OPEN_TS)).ok, 1);
    assert.equal((await mktOp(r, { op: 'list', classCode: 'demo', scope: 'class' }, ROSTER_ENV, OPEN_TS)).ok, 1);
    assert.equal((await mktOp(r, { op: 'list', scope: 'pub' }, ROSTER_ENV, OPEN_TS)).ok, 1);
  });
  test('珍品每週限量：金級樣式券第 6 件拒收，銅品不受限；下週換桶重算', async () => {
    const r = fakeKv();
    for (let i = 0; i < 5; i++) assert.equal((await mktOp(r, { op: 'post', itemId: 'deco_gold', price: 300, seller: `賣家${i}`, classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
    assert.match((await mktOp(r, { op: 'post', itemId: 'deco_gold', price: 300, seller: '新賣家', classCode: 'demo' }, ENV, OPEN_TS)).error, /限量/);
    assert.equal((await mktOp(r, { op: 'post', itemId: 'energy', price: 30, seller: '新賣家', classCode: 'demo' }, ENV, OPEN_TS)).ok, 1);
    const NEXT_FRI = Date.UTC(2026, 6, 31, 4, 0);   // 下個週五＝新 weekKey 桶
    assert.equal((await mktOp(r, { op: 'post', itemId: 'deco_gold', price: 300, seller: '新賣家', classCode: 'demo' }, ENV, NEXT_FRI)).ok, 1);
  });
  test('stars：成交後買賣雙方各 +1；只回前五、由高到低', async () => {
    const r = fakeKv();
    await seedWallet(r, 'demo', '大買家', 100);
    for (let i = 0; i < 3; i++) {
      const a = await mktOp(r, { op: 'post', itemId: 'energy', price: 15, seller: `賣家${i}`, classCode: 'demo' }, ENV, OPEN_TS);
      await mktOp(r, { op: 'buy', id: a.id, nick: '大買家', classCode: 'demo' }, ENV, OPEN_TS);
    }
    const s = await mktOp(r, { op: 'stars', classCode: 'demo' }, ENV, OPEN_TS);
    assert.equal(s.ok, 1);
    assert.ok(s.top.length <= 5, '只露前五');
    assert.equal(s.top[0].name, '大買家');
    assert.equal(s.top[0].deals, 3);
    assert.ok(s.top.every((x) => !('crystals' in x)), '只計次數不計金額');
  });
  ```
  （既有 Task 2/3/4 測試用 `ENV`——落在 `inRoster` 三態的「單元測試免驗」分支，不必逐一補名單。）
- [ ] 確認失敗：`node --test test/market-api.test.mjs`。
- [ ] 最小實作：
  ```js
  // 班級名單驗證三態：roster 注入（測試嚴格）／db 有值（正式，查 rtbattle 名單，fail-closed）／兩者皆無（單元測試免驗）
  const rosterKey = (c) => `rt:roster:${c}`;   // ← 以前置檢查輸出的 rtbattle 實際鍵名為準
  async function inRoster(redis, ctx, classCode, nick) {
    if (ctx.roster) return ctx.roster.has(nick);
    if (!ctx.db) return true;                  // 免驗模式僅存在於單元測試；正式 handler 必帶 db
    return (await redis.zrange(rosterKey(classCode), 0, 199)).includes(nick);
  }
  ```
  - `post`（暱稱／班碼驗證後、每日上架計數前）與 `buy`／`deposit`（參數驗證後）各插一行 `if (!(await inRoster(...))) return { ok: 0, error: '請先在即時對戰的全班戰況牆報到，才能進市集交易' };`。
  - `post` 珍品限量（所有驗證最後一關、建 rec 之前）：
    ```js
    if (tierOf(itemId) === 'gold') {
      const n = await redis.incr(`mkt:rare:${classCode}:${weekKey(nowMs)}`, 8 * 86400);
      if (n > 5) return { ok: 0, error: '本班金級樣式券本週限量 5 件已滿，下週五再來' };
    }
    ```
  - `buy` 成功路徑（回傳前）追加買賣雙方 `zincrby('mkt:deals:'+rec.classCode, 1, …)` 各一行；新 op：
    ```js
    if (op === 'stars') {
      if (!okClass(body.classCode)) return { ok: 0, error: '班級代碼不合法' };
      const raw = await redis.zrange(`mkt:deals:${body.classCode}`, 0, 4, { rev: true, withScores: true });   // 只取前五（白帽）
      const top = [];
      for (let i = 0; i < raw.length; i += 2) top.push({ name: raw[i], deals: Math.round(Number(raw[i + 1]) || 0) });
      return { ok: 1, top };
    }
    ```
- [ ] 測試通過：`node --test test/market-api.test.mjs` → 全綠（含回頭確認 Task 2–4 測試沒被名單驗證弄壞）。
- [ ] wrangler 煙霧補測 roster fail-closed（真 D1）：
  ```bash
  npx wrangler pages dev . --port 8788 & sleep 5
  curl -s -X POST http://localhost:8788/api/mkt -H 'Content-Type: application/json' -d '{"op":"post","itemId":"energy","price":30,"seller":"沒報到的人","classCode":"demo"}'
  # 預期：{"ok":0,"error":"請先在即時對戰的全班戰況牆報到，才能進市集交易"}
  kill %1
  ```
- [ ] Commit：`git commit -am "feat(mkt): 班級名單fail-closed驗證＋金級樣式券週限量＋集市達人stars（只露前五）"`

## Task 6：前端邏輯層 `js/market-store.js`（IIFE `SciMarketStore`・常數複本防漂移・背包／直購／攜帶・claims／限購／留痕）

**Files:**
- 新增 `js/market-store.js`（IIFE，**不是 ES module**）
- 新增 `test/market-store.test.mjs`
- 修改 `js/economy.js`（豁免清單加 `'mkt-withdraw'`／`'mkt-refund'`——出金與退款非新產出，不吃每日 100 上限；**以科學基地計畫實作的豁免機制為準**，前置檢查核實）

**Interfaces:**
- Consumes：`SciEconomy.getBalance/earnCrystals/spendCrystals`（科學基地計畫產出，假設簽名，前置檢查後只改薄封裝點）；localStorage `sci_class`（rtbattle 產出，唯讀）；`sci_market`（本檔自管，讀寫全包 try/catch）。
- Produces（IIFE 回傳物件；**純邏輯零 DOM**）：
  ```js
  const SciMarketStore = (() => {
    // 常數複本區（與 market-core.js 同步，交叉測試鎖漂移）：
    // ITEM_CATALOG / TIER_LABEL / tierOf / bandOf / isMarketOpen / nextOpenText / dayStr / THANKS_CARDS / DAILY_BUY_CAP=3
    return {
      ITEM_CATALOG, TIER_LABEL, THANKS_CARDS, DAILY_BUY_CAP, tierOf, bandOf, isMarketOpen, nextOpenText,
      classInfo(),                    // → { classCode, nick } | null（讀 sci_class，壞檔回 null）
      getInv(),                       // → { [itemId]: count }
      grantItem(itemId),              // 買到/下架拿回 → { ok }（非白名單拒收）
      removeItem(itemId),             // 上架/使用消耗 → { ok }（數量 0 拒）
      buyDirect(itemId),              // 直購：spendCrystals(base,'mkt-direct') 成功才 grantItem
      setCarry(toolId|null) / getCarry(),   // PvE 戰前攜帶（只認 kind==='tool' 且背包有貨）
      takeCarry(),                    // 開戰取用並消耗 → { toolId, effect } | null
      toolEffect(toolId),             // → { hp:10 } | { excludeOnce:true } | { shieldOnce:true } | null
      getClaims() / addClaim({id, claimKey, itemId, price}) / removeClaim(id),
      buysToday(nowMs) / bumpBuys(nowMs),   // 本機限購快取（先擋省 API；伺服器仍硬擋）
      recordEver({itemId, dir:'sold'|'bought', peer, ts}) / getEver(),   // 曾經持有留痕，100 筆 FIFO
      settleToLocal(amount) / refundLocal(amount) / payLocal(amount),    // SciEconomy 薄封裝（'mkt-withdraw'/'mkt-refund'/'mkt-deposit'）
      redeemDeco(tier),               // window.SciBase 兌換入口存在則轉呼叫並 removeItem；否則 { ok:0, pending:1 }
    };
  })();
  ```

**Steps:**

- [ ] 前置檢查（核實科學基地計畫的 SciEconomy 實際簽名與豁免機制）：
  ```bash
  cd ~/projects/science-hero
  test -f js/economy.js && grep -n 'earnCrystals\|spendCrystals\|EXEMPT\|exempt' js/economy.js || echo MISSING_ECONOMY
  ```
  MISSING → 停工回報「科學基地計畫（晶能經濟）未就緒」。簽名與本計畫假設不同 → 只調整 `settleToLocal/refundLocal/payLocal/buyDirect` 四個薄封裝點，其餘照舊。
- [ ] 寫失敗測試 `test/market-store.test.mjs`（**vm 串接 harness，照抄 `test/logic.test.mjs` 手法**；同檔同時 import 後端 ESM 做交叉比對）：
  ```js
  // import 樣板同 test/logic.test.mjs（test/assert/fs/path/url/vm），另加 import * as core from '../functions/lib/market-core.js'
  function makeSandbox() {   // 照抄 test/logic.test.mjs 的 vm 串接手法，只換載入檔與匯出名
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const context = vm.createContext({ localStorage, console, Date, Math, JSON, window: {} });
    const files = ['js/store.js', 'js/economy.js', 'js/market-store.js'];   // economy.js＝科學基地計畫產出
    const combined = files.map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
    vm.runInContext(`${combined}\nglobalThis.__exports = { SciStore, SciEconomy, SciMarketStore };`, context, { filename: 'combined.js' });
    return { lib: context.__exports, raw: store };
  }

  test('前後端常數同步：ITEM_CATALOG/tierOf/bandOf/isMarketOpen 交叉一致（防漂移鎖）', () => {
    const { lib } = makeSandbox();
    const M = lib.SciMarketStore;
    assert.deepEqual(M.ITEM_CATALOG, core.ITEM_CATALOG);
    for (const id of [...Object.keys(core.ITEM_CATALOG), 'senlingdeer', '']) {
      assert.equal(M.tierOf(id), core.tierOf(id), `tierOf(${id}) 前後端不一致`);
      assert.deepEqual(M.bandOf(id), core.bandOf(id), `bandOf(${id}) 前後端不一致`);
    }
    for (const ts of [Date.UTC(2026, 6, 23, 15, 59), Date.UTC(2026, 6, 23, 16, 0), Date.UTC(2026, 6, 24, 15, 59), Date.UTC(2026, 6, 24, 16, 0)]) {
      assert.equal(M.isMarketOpen(ts), core.isMarketOpen(ts), `isMarketOpen(${ts}) 前後端不一致`);
    }
    assert.equal(M.THANKS_CARDS.length, 8);
  });
  test('背包與直購：非白名單拒收、歸零不能再扣；buyDirect 走 spendCrystals 單一入口', () => {
    const { lib } = makeSandbox();
    const M = lib.SciMarketStore;
    assert.equal(M.grantItem('senlingdeer').ok, false);   // 稚靈不是道具
    assert.equal(M.grantItem('energy').ok, true);
    assert.equal(M.removeItem('energy').ok, true);
    assert.equal(M.removeItem('energy').ok, false);
    assert.equal(M.buyDirect('energy').ok, false);        // 餘額 0
    lib.SciEconomy.earnCrystals(50, 'test-seed');
    assert.equal(M.buyDirect('energy').ok, true);         // base 30
    assert.equal(M.getInv().energy, 1);
    assert.equal(lib.SciEconomy.getBalance(), 20);
  });
  test('戰前攜帶與道具效果：setCarry 只認背包有貨的 tool；takeCarry 一次性消耗', () => {
    const { lib } = makeSandbox();
    const M = lib.SciMarketStore;
    assert.deepEqual(M.toolEffect('energy'), { hp: 10 });
    assert.deepEqual(M.toolEffect('goggles'), { shieldOnce: true });
    assert.equal(M.toolEffect('deco_gold'), null);
    assert.equal(M.setCarry('magnifier').ok, false);      // 背包沒貨
    M.grantItem('magnifier');
    assert.equal(M.setCarry('deco_gold').ok, false);      // 樣式券不是道具
    assert.equal(M.setCarry('magnifier').ok, true);
    const t = M.takeCarry();
    assert.equal(t.toolId, 'magnifier');
    assert.deepEqual(t.effect, { excludeOnce: true });
    assert.equal(M.takeCarry(), null);                    // 已消耗
    assert.equal(M.getInv().magnifier || 0, 0);
  });
  test('claims/buysToday/ever 持久化與跨日歸零', () => {
    const { lib } = makeSandbox();
    const M = lib.SciMarketStore;
    assert.deepEqual(M.getClaims(), []);
    M.addClaim({ id: 'x1', claimKey: 'k', itemId: 'energy', price: 30 });
    assert.equal(M.getClaims().length, 1);
    M.removeClaim('x1');
    assert.deepEqual(M.getClaims(), []);
    const t = Date.UTC(2026, 6, 24, 4, 0);
    assert.equal(M.buysToday(t), 0);
    M.bumpBuys(t); M.bumpBuys(t);
    assert.equal(M.buysToday(t), 2);
    assert.equal(M.buysToday(t + 86400 * 1000), 0);       // 跨日歸零
    M.recordEver({ itemId: 'energy', dir: 'sold', peer: '小華', ts: t });
    assert.equal(M.getEver()[0].dir, 'sold');
  });
  test('classInfo 壞檔回 null 不炸；redeemDeco 基地未就緒回 pending 不吞券', () => {
    const { lib, raw } = makeSandbox();
    const M = lib.SciMarketStore;
    assert.equal(M.classInfo(), null);
    raw['sci_class'] = JSON.stringify({ classCode: '七年3班', nick: '小明' });
    assert.deepEqual(M.classInfo(), { classCode: '七年3班', nick: '小明' });
    raw['sci_class'] = '{{{壞檔';
    assert.equal(M.classInfo(), null);
    M.grantItem('deco_gold');
    const r = M.redeemDeco('deco_gold');   // 沙盒 window 無 SciBase
    assert.deepEqual([r.ok, r.pending], [0, 1]);
    assert.equal(M.getInv().deco_gold, 1); // 券還在
  });
  ```
- [ ] 確認失敗：`node --test test/market-store.test.mjs`（SciMarketStore 未定義）。
- [ ] 最小實作 `js/market-store.js`：IIFE 依上方介面實作。要點：檔頭註明「常數複本與 market-core.js 同步，交叉測試會擋漂移」；`sci_market` 結構 `{ inv:{}, claims:[], buys:{date,n}, ever:[], carry:null }`，`load/save` 全包 try/catch 壞檔回預設（照抄 `js/store.js`）；效果表 `TOOL_EFFECTS = { energy:{hp:10}, magnifier:{excludeOnce:true}, goggles:{shieldOnce:true} }`；`buysToday/bumpBuys` 用 UTC+8 `dayStr` 分桶（與後端同日界線）；`getEver` 上限 100 筆 FIFO；`js/economy.js` 豁免清單同步補上（附理由註解）。
- [ ] 測試通過：`node --test test/market-store.test.mjs test/market-api.test.mjs` → 全綠；`node --test test/logic.test.mjs` 既有 13 綠無回歸。
- [ ] Commit：`git add -A && git commit -m "feat(mkt): 前端邏輯層SciMarketStore（常數交叉鎖/背包直購攜帶/claims限購留痕/經濟薄封裝）"`

## Task 7：前端瀏覽 UI（`js/market-ui.js`・index.html 進場點・掛單卡・直購攤位・規則區）

**Files:**
- 新增 `js/market-ui.js`（IIFE `SciMarketUI`，自帶 DOMContentLoaded boot，不動 `SciApp.boot`）
- 修改 `index.html`（`.io-row` 上方新增「🛒 科學市集」按鈕＋`#mkt-overlay` 骨架；`<script>` 依相依序插入：`js/economy.js`（基地計畫已插則不動）→ `js/shapi.js`（rtbattle 已插則不動）→ `js/market-store.js` → `js/market-ui.js`，全部放在 `js/app.js` 之前）
- 修改 `css/style.css`（追加 `.mkt-*` 類）
- 修改 `test/smoke.mjs`（追加開市集 overlay 檢查段）

**Interfaces:**
- Consumes：`SHAPI.call('mkt', body)`（rtbattle 產出，唯一網路出口）；`SciMarketStore` 全部介面；`SciEconomy.getBalance`。
- 前置檢查：`grep -n 'SHAPI' js/shapi.js` 核實 `call` 實際簽名（本計畫假設 `SHAPI.call(path, body)`；若 rtbattle 實作為 `(path, {method, body})` 則只改 `callMkt` 一個封裝點）。
- Produces（`SciMarketUI` 內部，本 Task 只做「瀏覽」）：
  - `#btn-market` 開關 `#mkt-overlay`（`role="dialog"` `aria-modal="true"`，Esc／背景點擊可關）。
  - 頂欄：本機晶能餘額（`SciEconomy.getBalance()`）＋市集錢包餘額（`{op:'wallet'}`，連不上顯示 `--`）＋開市徽章（週五 `🔥 開市中`／平日 `nextOpenText()`）。
  - **規則區**（`<details>`）：價格帶六件全表照列、10% 稅、每日限購 3 件、每日上架 3 筆、金級券每班每週限量 5、每週五開市、**「晶能不可兌換現實金錢或禮物」**、「精靈與稚靈是夥伴，不是商品」、「錢包晶能存在伺服器，換裝置也在」。
  - **直購攤位**：6 件目錄各一張卡（emoji＋名稱＋效果＋原價），tool 三件附「直購」鈕（`buyDirect`，成功 toast＋餘額刷新，失敗顯示缺額）；deco 三件依 `redeemDeco` pending 與否切換「至科學基地換購」／可直購文案。
  - **掛單列表**：班級／全站兩個 tab（`scope:'class'`／`'pub'`）。每筆掛單卡：道具 emoji＋品階徽章（`TIER_LABEL[tierOf]` 三色框）＋名稱＋價格＋賣家暱稱＋（本 Task 先 disabled 的）購買鈕。
  - **降級策略**：`classInfo()` 回 null（rtbattle 未執行／未報到）→ 班級 tab 換引導文案「先到即時對戰的全班戰況牆報到，才能進班級市集交易」，僅全站 tab 可瀏覽、交易鈕全隱藏。
  - 後端連不上（`SHAPI.call` 回 `{ok:0}`）→「📡 連不上市集伺服器，稍後再試」，**絕不擋主遊戲**；user 資料經 escape 再上 DOM。
  - `callMkt(body)` 統一封裝 `SHAPI.call('mkt', body)` 加 try/catch——**全檔唯一網路出口，嚴禁裸 fetch**。

**Steps:**

- [ ] `test/smoke.mjs` 追加失敗斷言（沿用其 fails 陣列模式，插在「6. 手機寬度」段之前）：
  ```js
  // 7. 科學市集 overlay：開得起來、規則區含關鍵句、直購攤位 6 卡、降級文案、關得掉
  await page.click('#btn-market');
  await page.waitForSelector('#mkt-overlay:not([hidden])');
  const rules = await page.locator('#mkt-rules').textContent();
  if (!rules?.includes('不可兌換現實金錢')) fails.push('規則區缺「晶能不可兌換現實金錢」聲明');
  if (!rules?.includes('不是商品')) fails.push('規則區缺「精靈不是商品」聲明');
  if ((await page.locator('.mkt-stall-card').count()) !== 6) fails.push('直購攤位應有 6 張卡');
  if (!(await page.locator('#mkt-class-pane').textContent())?.includes('報到')) fails.push('無班級碼時應顯示報到引導（降級策略）');
  await page.click('#mkt-close');
  console.log('✅ 市集 overlay 可開關、規則區與直購攤位齊備、無班碼降級文案正確');
  ```
- [ ] 確認失敗：`node test/smoke.mjs` → 新增斷言 fail（`#btn-market` 不存在）。
- [ ] 實作：
  - `index.html`：`.io-row` 前加 `<button id="btn-market" class="io-btn">🛒 科學市集（每週五開市）</button>`；`</main>` 前加 overlay 骨架（`#mkt-overlay[role=dialog][aria-modal=true][hidden]` 內含 `#mkt-close`／`#mkt-topbar`／`#mkt-rules`（`<details>`，summary「📜 市集規則（家長也請看這裡）」）／`#mkt-stall`／`#mkt-tabs`／`#mkt-class-pane`／`#mkt-pub-pane`／`#mkt-status[aria-live=polite]`）；`<script>` 序在 `js/battle.js` 之後、`js/app.js` 之前插入 `js/market-store.js` → `js/market-ui.js`。
  - `js/market-ui.js`：`const SciMarketUI = (() => { ... return { boot }; })(); document.addEventListener('DOMContentLoaded', SciMarketUI.boot);`。`boot()` 綁 `#btn-market`／`#mkt-close`；`open()` 依序渲染 topbar（wallet 非同步刷新）、rules（價格帶表用 `ITEM_CATALOG`＋`bandOf` 動態生成，**規則頁永不過期**）、stall、tabs、list。
  - `css/style.css`：`.mkt-overlay`（全螢幕遮罩）、`.mkt-panel`（max-width 640、max-height 90vh、overflow-y auto——390px 不橫向跑版）、`.mkt-card` 三品階框色、`.mkt-open`/`.mkt-closed` 徽章。
- [ ] 測試通過：`node test/smoke.mjs` 全綠（既有 11 檢查＋新段）；`node --test test/market-store.test.mjs test/market-api.test.mjs test/logic.test.mjs` 無回歸。
- [ ] 本機手動驗證（wrangler 起著）：無班碼時班級 tab 是引導文案、全站 tab 空列表、規則區六件價格帶與後端一致；手動種 `sci_class` 後重開 overlay，班級 tab 變成掛單列表。
- [ ] Commit：`git add -A && git commit -m "feat(mkt): 市集瀏覽UI（overlay/直購攤位/品階掛單卡/透明規則區/無班碼降級/fail-open）"`

## Task 8：前端上架與購買流程（全下拉表單・感謝小卡・入金出金・本機限購先擋・PvE 戰前攜帶接線）

**Files:**
- 修改 `js/market-ui.js`
- 修改 `js/battle.js`（PvE 戰前攜帶列＋三種道具效果；`typeof SciMarketStore !== 'undefined'` 防衛）
- 修改 `test/smoke.mjs`（上架表單與戰前攜帶列斷言）
- 修改 `test/logic.test.mjs`（追加護目鏡效果的 battleState 邏輯測試——battle.js 是 harness 已載檔，直接可測）

**Interfaces:**
- Consumes：Task 6 全部 store 介面；Task 3/4 的 `buy/deposit/withdraw/cancel/claim` op；`THANKS_CARDS`。
- Produces（market-ui.js 內三條流程＋battle.js 一條掛鉤）：
  - **上架**：「📤 我要上架」區，表單**全下拉無自由輸入**：物品下拉（選項＝`getInv()` 有貨的白名單品項）→ 價格下拉（價格帶內以 5 為級距列舉，預設原價）→「公開到全站」checkbox（預設不勾）→ 確認。成功 → `removeItem`＋`addClaim`＋toast「已上架！賣出後回來領貨款（收 10% 稅）」。
  - **購買**：掛單卡購買鈕 → 前置本機四擋（開市中？`buysToday() < DAILY_BUY_CAP`？非自己掛的？錢包夠？——不足直接彈入金面板）→ **感謝小卡選擇框**（8 張預設卡＋「不送」，無自由文字）→ `{op:'buy', ..., cardId}` → 成功：`grantItem`＋`bumpBuys()`＋`recordEver({dir:'bought', peer: seller})`＋toast；失敗：照顯後端繁中錯誤（伺服器是最終權威）。
  - **入金／出金面板**：入金＝下拉選金額（10/30/50/100）→ `payLocal(amount)` 成功 → `{op:'deposit'}` → 後端失敗立即 `refundLocal(amount)` 原路退回（**先扣本機再打 API、失敗必退**，順序寫死防雙花）；出金＝`{op:'withdraw'}` 成功 → `settleToLocal(amount)`。
  - **我的掛單**：`getClaims()` 每筆附「檢查」鈕 → `{op:'claim'}`：已售出 → 顯示「+N 晶能已入市集錢包」＋感謝小卡（card=0 不顯示）＋`removeClaim`＋`recordEver({dir:'sold', peer: r.buyer})`；未售出 →「下架拿回」鈕走 `{op:'cancel'}` → `grantItem`＋`removeClaim`；「找不到掛單」（TTL 過期）→ 清本機 claim 自癒。
  - 平日（`!isMarketOpen()`）：購買鈕與上架區整段換成「⏳ 今日僅供瀏覽——每週五全天開市」，但入金／出金／檢查／領款／下架照常可用。
  - **PvE 戰前攜帶（battle.js）**：`renderPicker()` 頂部插攜帶列（有 `SciMarketStore` 且背包有 tool 才顯示）：三格道具鈕（顯示存量）＋「不帶」；`start(o)` 開場 `SciMarketStore.takeCarry()`（typeof 防衛）→ energy：`pHp = MAX_HP + 10`（hpBar 寬度 `Math.min(100, hp)`）；magnifier：`excludeLeft=1`，答題畫面加 🔍 鈕，點擊隨機 disable 一個非正解選項後歸零；goggles：`shieldLeft=1`，答錯時歸零、`combo` 不清、扣血照常。**PvP（startPvp）與即時對戰完全不讀道具**（公平）。

**Steps:**

- [ ] `test/logic.test.mjs` 追加失敗測試（純邏輯層驗證護目鏡連擊保護的資料流；battle.js 需為此把「答錯處理」抽成可測純函式 `applyWrongAnswer(battleState)`——新增 export，不改既有簽名）：
  ```js
  test('SciBattle.applyWrongAnswer：護目鏡 shieldLeft 保連擊一次，之後恢復歸零', () => {
    const lib = makeSandbox();
    const bs = { pHp: 100, oHp: 100, combo: 3, shieldLeft: 1, log: '' };
    lib.SciBattle.applyWrongAnswer(bs);
    assert.equal(bs.combo, 3, '有護目鏡：連擊保留');
    assert.equal(bs.shieldLeft, 0);
    assert.equal(bs.pHp, 92, '扣血照常 -8');
    lib.SciBattle.applyWrongAnswer(bs);
    assert.equal(bs.combo, 0, '護目鏡用掉後：連擊歸零');
  });
  ```
- [ ] `test/smoke.mjs` 追加失敗斷言：
  ```js
  // 8. 市集上架表單與戰前攜帶：先種背包與班碼再 reload
  await page.evaluate(() => {
    localStorage.setItem('sci_class', JSON.stringify({ classCode: 'demo', nick: '小明' }));
    localStorage.setItem('sci_market', JSON.stringify({ inv: { magnifier: 1 }, claims: [], buys: { date: '', n: 0 }, ever: [], carry: null }));
  });
  await page.reload();
  await page.waitForSelector('#tabs button');
  await page.click('#btn-market');
  await page.waitForSelector('#mkt-sell');
  const sellOpts = await page.locator('#mkt-sell select option').allTextContents();
  if (!sellOpts.some((t) => t.includes('放大鏡'))) fails.push('上架下拉未列出背包內的放大鏡');
  if (!(await page.locator('#mkt-sell select.mkt-price').count())) fails.push('價格必須是下拉選單（無自由輸入）');
  await page.click('#mkt-close');
  await page.click('.mode-switch button[data-mode="battle"]');
  if (!(await page.locator('.bat-carry').count())) fails.push('PvE 對手選單缺戰前攜帶列');
  console.log('✅ 上架全下拉表單與 PvE 戰前攜帶列齊備');
  ```
- [ ] 確認失敗：`node --test test/logic.test.mjs`（applyWrongAnswer 不存在）＋ `node test/smoke.mjs`。
- [ ] 實作：
  - `js/battle.js`：把 `onAnswer` 答錯分支三行（combo 歸零／扣 8 血／log）抽成 `applyWrongAnswer(battleState)`（含 shieldLeft 判斷）並加進 exports；`renderPicker`/`render` 加攜帶列與 🔍 鈕（皆 typeof 防衛——**harness 不載市集檔，防衛缺失會讓既有 13 測全紅**）。
  - `js/market-ui.js`：三條流程照 Interfaces 實作；金流與資產**只透過 SciMarketStore／SciEconomy**；入金順序寫死 `payLocal → deposit → 失敗 refundLocal`；toast 走 `#mkt-status`。
- [ ] 測試通過：`node --test test/logic.test.mjs test/market-store.test.mjs test/market-api.test.mjs` ＋ `node test/smoke.mjs` 全綠。
- [ ] 端到端本機驗證（wrangler＋兩個瀏覽器 profile 模擬買賣雙方，`.dev.vars` 開 `MKT_FORCE_OPEN=1`）：A 直購放大鏡→上架 50→B 入金 100→買下（選第 4 張小卡）→B 背包 +1、限購 1/3→A 檢查領款見小卡與 45（floor(50×0.9)）入錢包→出金 45→本機晶能 +45→兩邊「曾經持有」各留一筆→A 帶放大鏡打 PvE、🔍 鈕排除一個錯誤選項。
- [ ] Commit：`git add -A && git commit -m "feat(mkt): 上架/購買/入金出金/領款全流程UI（全下拉無自由輸入/感謝小卡/本機先擋）＋PvE戰前攜帶三道具"`

## Task 9：集市達人排行＋「曾經持有」收藏冊＋部署與正式環境設定

**Files:**
- 修改 `js/market-ui.js`（overlay 追加兩個分頁：🏆 集市達人、📦 曾經持有）
- 修改 `test/smoke.mjs`（分頁存在性與留痕渲染斷言）
- 部署操作（無新檔）：CF Pages secret、D1 確認、三平台重推

**Interfaces:**
- Consumes：`{op:'stars', classCode}`（Task 5，只回前五）；`SciMarketStore.getEver()`／`THANKS_CARDS`。
- Produces：
  - **集市達人分頁**：前五名成交量排行（名次・暱稱・成交 N 筆），榜首加 🏆；空榜顯示「本週還沒有人成交——當第一個吧！」。**只列次數不列金額、只露前五**（白帽）。無班碼 → 報到引導。
  - **曾經持有分頁**：`getEver()` 時間倒序，每筆：道具 emoji＋名稱＋品階框色＋「售予 小華」／「購自 小明」＋日期——賣掉的道具留痕，**擁有感不清零**。空冊顯示「完成第一筆交易，這裡就會開始寫你的市集故事」。
  - 部署後端**只上 Cloudflare Pages**；鏡像站靠 `SHAPI` 絕對網址共用（線上冒煙驗證）。

**Steps:**

- [ ] `test/smoke.mjs` 追加失敗斷言：
  ```js
  // 9. 集市達人與曾經持有分頁：預先種一筆留痕
  await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('sci_market'));
    m.ever = [{ itemId: 'magnifier', dir: 'sold', peer: '小華', ts: Date.now() }];
    localStorage.setItem('sci_market', JSON.stringify(m));
  });
  await page.click('#btn-market');
  await page.waitForSelector('#mkt-tab-stars');
  await page.click('#mkt-tab-ever');
  if (!(await page.locator('#mkt-ever-pane').textContent())?.includes('售予')) fails.push('曾經持有分頁未渲染「售予」留痕');
  await page.click('#mkt-tab-stars');
  if (!(await page.locator('#mkt-stars-pane').textContent())) fails.push('集市達人分頁沒有內容（至少要有空榜文案或引導）');
  await page.click('#mkt-close');
  console.log('✅ 集市達人與曾經持有分頁齊備');
  ```
- [ ] 確認失敗：`node test/smoke.mjs` → 分頁鈕不存在。
- [ ] 實作兩個分頁（沿用 Task 7 tab 機制；stars 打 `callMkt({op:'stars'})`，連不上顯示「📡 排行暫時載不出來」）。
- [ ] 全部測試最終回歸：
  ```bash
  cd ~/projects/science-hero
  node scripts/validate-all.mjs                                        # 既有資料驗證
  node --test test/logic.test.mjs test/market-store.test.mjs test/market-api.test.mjs   # 既有13綠＋市集全綠
  node test/smoke.mjs                                                  # 既有11檢查＋市集三段全綠
  ```
- [ ] 正式環境設定與部署（**部署前依專案守則先口頭確認**）：
  ```bash
  # 1) HMAC secret 只設 CF Pages（正式站絕不設 MKT_FORCE_OPEN）
  openssl rand -hex 32 | npx wrangler pages secret put MKT_SECRET --project-name science-hero
  # 2) 遠端 D1 確認 shim 資料表已由 rtbattle migration 建立（缺 → 先跑該計畫 migration，不得自建）
  npx wrangler d1 execute <rtbattle計畫的DB名> --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
  # 3) 三平台部署走既有 SOP（前端檔三邊同步；functions/ 只有 CF Pages 會吃）
  ```
- [ ] 線上冒煙（逐條核對）：
  ```bash
  curl -s -X POST https://science-hero.pages.dev/api/mkt -H 'Content-Type: application/json' -d '{"op":"list","scope":"pub"}'
  # 預期：{"ok":1,"list":[]}
  curl -s -X POST https://science-hero.pages.dev/api/mkt -H 'Content-Type: application/json' -d '{"op":"post","itemId":"energy","price":30,"seller":"線上冒煙","classCode":"smoketest"}'
  # 非週五預期：週五時窗錯誤（正式站沒吃到 FORCE_OPEN）；週五預期：roster fail-closed 報到錯誤
  ```
  再從 vercel.app 鏡像站開市集 overlay，確認全站列表能載入（SHAPI 絕對網址跨平台不降級）。
- [ ] Commit：`git add -A && git commit -m "feat(mkt): 集市達人排行（只露前五）＋曾經持有收藏冊，科學市集全系統完工"`

---

## 自我檢查（完成後逐項核對）

**Spec 覆蓋：**
- 只交易實驗道具與樣式券、精靈/稚靈不可交易 → Task 1 `ITEM_CATALOG` 白名單 fail-closed（非白名單 `tierOf` 一律 null）
- 道具原始取得＝晶能直購（價格公開）、市集是轉售 → Task 6 `buyDirect`＋Task 7 直購攤位
- 道具 PvE 戰前帶 1 件（🔍排除選項/🥽保連擊/⚡+10 HP），PvP 禁用 → Task 6 `takeCarry/toolEffect`＋Task 8 battle.js 掛鉤（`applyWrongAnswer` 純函式可測）
- 週五 00:00–23:59 開市、瀏覽全週 → Task 1 `isMarketOpen`＋Task 2/3 擋門＋Task 8 平日唯讀 UI
- HMAC 簽章（`MKT_SECRET`，Web Crypto） → Task 1 `sigOf`＋Task 3 驗章＋Task 9 正式 secret
- `mkt:` 前綴＋每日上架上限 3 → Task 2；每日限購 3（伺服器記帳）＋小卡 8 句無自由文字 → Task 3＋Task 6/8
- claimKey 領款・10% 稅防通膨 → Task 4
- 班級名單驗證＋rtbattle 未執行降級（只能瀏覽） → Task 5 fail-closed＋Task 7 引導文案
- 珍品每週全班限量 → Task 5（`weekKey` 週桶、限量 5）；集市達人只露前五 → Task 5＋Task 9
- IIFE `SciMarketStore`、key `sci_market`＋常數雙份防漂移 → Task 6 交叉鎖（vm 載前端 vs import 後端逐項 assert）
- 掛單卡（圖示＋品階＋價格＋賣家）＋規則區明寫晶能不可兌現 → Task 7
- 上架全下拉、購買確認、小卡選擇、本機限購先擋、SHAPI 失敗降級 → Task 8
- 伺服器託管子帳 `mkt:wallet:`、入金/出金明確步驟防改檔 → 共用契約流向圖＋Task 3＋Task 8（payLocal→deposit→失敗 refundLocal 順序寫死）
- 「曾經持有」收藏冊＋部署（secret／D1／端到端） → Task 9

**風險五項防護對應：** 逐項回到開頭〈風險五項逐一對應〉表核對落點 Task 皆已實作；Task 7/8 smoke 已鎖「不可兌換現實金錢」「不是商品」與價格必為下拉。

**硬性慣例核對：**
- 前端全部 `<script>` IIFE，無 ES module → Task 6/7；後端 CF Pages 原生 `onRequestPost`、只集中一平台、前端一律 `SHAPI.call` 絕對網址 → Task 2/7/9
- 前端測試沿用 `test/logic.test.mjs` vm 串接 harness → Task 6/8；後端 node:test＋`test/fake-d1.mjs` → Task 1–5；每 Task 先寫失敗測試 → 全部 Steps 首兩格
- 晶能收支只走 `SciEconomy` → Task 6 薄封裝（`buyDirect/payLocal/refundLocal/settleToLocal`），UI 不直接動餘額
- Consumes 標註齊備（`SHAPI`/`_kv`/`fake-d1`/`sci_class`＝即時對戰產出；`SciEconomy`/樣式兌換＝科學基地產出）；假設簽名皆有前置檢查
- 驗證指令 `node --test`／`wrangler pages dev`＋curl＋預期 JSON → Task 1–5/9

**跨 Task 簽名一致性：** `mktOp(redis, body, ctx, nowMs)`（Task 2 定義，3/4/5 擴充）；`sigOf({itemId,price,seller,id}, secret)` async 固定欄序（Task 1）；`memberOf` 固定欄序（Task 2 定義，3/4 使用）；`getWallet/setWallet`（Task 3 定義，4 使用）；`inRoster` 三態（Task 5，正式環境必 fail-closed）；前後端常數由 Task 6 交叉測試鎖死；battle.js `applyWrongAnswer`（Task 8 新增 export）。

**既有引擎不動核對：** `SciQuiz`/`SciFlashcard`/`SciWeak`/`recordAnswer` 零觸碰；`SciBattle` 只加 export；既有 13 測全程綠（harness 不載市集檔，防衛缺失自動翻紅）。

