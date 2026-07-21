# 科學英雄即時對戰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為科學英雄加上「即時對戰」子系統：4 位數房號跨裝置同步對戰（1.5 秒輪詢、同 seed 各自出題、伺服器只當狀態郵筒）、6 碼非同步挑戰書（7 天 TTL 比同組題成績）、每 5 題檢查的種子化「科學奇遇」（全部正面白帽事件）、全班戰況牆（老師開房全班同題搶答、榜只露前五）、月賽季排位（D1 zset、每月重置、賽季稱號）。同時建好**跨子系統共用的後端基礎**（`js/shapi.js` 的 `SHAPI`、D1 四表 schema、`functions/lib/_kv.js`），供之後的科學市集（`mkt:`）直接沿用。

**Architecture:** 沿用 vocab-duel／字字珠璣已驗證的「同 seed 不同機、傷害權威在攻擊方」模式：雙方各自在本機用同一種子從同一 pool 出同一串題（呼叫既有 `SciQuiz.buildQuestion`，以「暫換 `Math.random` 為 seeded RNG」手法讓選項序也確定性），答對用既有 `SciBattle.calcDamage(combo, hp)` 算傷害，只把**累計 dmg 與累計 heal** 經 Cloudflare Pages Functions + D1 同步給對方；對方血量 = 最大血 − 我方 dmg + 對方 heal。後端只存房間 meta／進度／心跳，**零題目儲存**。並修正 vocab-duel 三平台地雷：所有前端 API 呼叫走 `SHAPI.call()`，非 pages.dev 同源時打絕對網址。

**Tech Stack:** 純前端 vanilla JS，**`<script>` IIFE 全域掛載（不是 ES module）**——新模組一律 `const SciXxx = (() => { ... return {...}; })();` 放 `js/` 平層。後端 Cloudflare Pages Functions（原生 `export async function onRequestPost`）+ D1（新建 `science-hero-db`）。測試：前端純邏輯沿用 `test/logic.test.mjs` 的 **vm 串接 harness**；後端 `node --test` 直呼 `onRequestPost({request, env})`＋`node:sqlite` 假 D1（Node 22.5+）；煙霧沿用 `test/smoke.mjs` 的 playwright-core 模式，另附 `npx wrangler pages dev .` 雙分頁真機驗證。

## Global Constraints

1. **後端只部署在 Cloudflare Pages 一個平台**（`science-hero.pages.dev`）。Vercel（`science-hero-hk6429.vercel.app`）／Netlify 鏡像站只是靜態前端，一律經 `SHAPI` 打絕對網址回 CF。
2. **前端絕對禁止任何模組直接 `fetch('api/...')` 相對路徑**（vocab-duel 三平台鏡像站地雷）。後端呼叫必經 `SHAPI.call(path, body)`；離線／失敗一律回 `{ok:0, error}` soft error 優雅降級，絕不 throw 到 UI。
3. **前端模組是 `<script>` IIFE 全域掛載，不是 ES module**：新檔一律 `const SciXxx = (() => { ... })();`，`index.html` 依相依序加 `<script>`。`functions/` 後端才是 ESM（CF Pages Functions 原生 `onRequestPost` 寫法）。
4. **D1 key 命名空間**：即時對戰一律 `rt:` 前綴；`mkt:` 保留給科學市集（本計畫只建共用 schema 與 shim，不實作市集）。
5. **HMAC secret 走環境變數、不入版控、各子系統分離**：即時對戰 `RT_SECRET`（用在戰況牆主持 token）、市集 `MKT_SECRET`（本計畫不設）；`wrangler pages secret put` 設定、程式讀 `env.RT_SECRET`、本機放 `.dev.vars`（不 commit）。同步對戰傷害上報**不簽章**（靠 clamp＋限流）。
6. **伺服器只當狀態郵筒**：不存題目、不出題、不算傷害；出題全在前端同 seed 生成，戰鬥運算沿用 `SciBattle.calcDamage(combo, hp)` 不重造。
7. **答題記錄唯一出口**：連線對戰作答一律走 `app.js` 的 `recordAnswer(target, correct, elapsedMs)`（經 mount ctx 傳入，比照 `SciBattle.mount`），**不得另闢記錄路徑**。
8. **不動既有函式簽名**：`SciQuiz.*`、`SciBattle.*`、`SciStore.*`、`SciFlashcard.*`、`SciWeak.*` 全部照舊；`state`（`science-hero:v1`）既有欄位不動，只允許**新增** `state.rtSeason`（Task 10，跟著既有匯出／匯入通道走）。
9. **localStorage 新 key 只有一把 `sci_class`**（`{code, nick}`，Task 9 建立、市集計畫共用），讀寫全包 try/catch；其餘進度存既有 `science-hero:v1`。
10. **教育白帽原則**：榜只露前五＋「你目前第 N 名」只給自己看；賽季敗場也加分不倒扣；奇遇全正面；暱稱從預設詞庫組合、**不開放自由輸入**；不做懲罰性損失設計。
11. **測試用專案現有 runner**：前端純邏輯 `node --test test/logic.test.mjs test/rtbattle.test.mjs`（vm harness）；後端 `node --test test/functions/`；資料 `node scripts/validate-all.mjs`；煙霧 `node test/smoke.mjs`；後端真機 `npx wrangler pages dev . --port 8788`。**每個 Task 先寫失敗測試再實作。**
12. **繁中台灣用語**：所有 UI 文案、註解、錯誤訊息一律繁體中文台灣用語。
13. 工作目錄 `~/projects/science-hero`（branch `master`），完工後同步回母版 `naicheng-claude-agent/科學英雄`。每個 Task 完成即 commit。
14. Karpathy 簡潔優先：不做 WebSocket、不做帳號系統、不做投機性抽象。

---

## Task 1：`SHAPI` 共用 API helper（跨子系統契約）

**Files:**
- 新增 `~/projects/science-hero/js/shapi.js`
- 新增 `~/projects/science-hero/test/shapi.test.mjs`
- 修改 `~/projects/science-hero/index.html`（`battle.js` 之後、`app.js` 之前加 `<script src="js/shapi.js"></script>`）

**Interfaces (Produces — 下游市集子系統也依賴，簽名寫死不可改):**

匯出 `SHAPI.{ API_ORIGIN, apiBase(hostname), createApi({fetchFn, hostname}), call(path, body), base() }`——完整行為見下方實作碼（實作即契約）。與字字珠璣 `ZZAPI` 的兩個刻意差異：soft error 回 `{ok:0, error:'offline'}` 而非 `null`（呼叫端統一 `if (!r.ok)` 一種判法）；IIFE 不是 ESM（vm harness 測試時跟其他 `Sci*` 模組串進 context 取出）。

**Steps:**

- [ ] 寫失敗測試 `test/shapi.test.mjs`。vm harness 手法照抄 `test/logic.test.mjs`（`readFileSync` 串檔＋`vm.createContext`＋`globalThis.__exports`），sandbox 只需 `{ console, Date, Math, JSON }`、載入檔案只有 `js/shapi.js`、exports 取 `{ SHAPI }`。測試本體：

```js
test('apiBase：同源/本機回空字串、鏡像站回絕對網址（vocab-duel 地雷修正）', () => {
  const { SHAPI } = makeSandbox();
  for (const h of ['science-hero.pages.dev', 'localhost', '127.0.0.1']) assert.equal(SHAPI.apiBase(h), '');
  for (const h of ['science-hero-hk6429.vercel.app', 'science-hero.netlify.app', 'example.com'])
    assert.equal(SHAPI.apiBase(h), SHAPI.API_ORIGIN);
});

test('call：鏡像站打絕對網址、localhost 打相對路徑、一律 POST JSON', async () => {
  const { SHAPI } = makeSandbox();
  let seen = null;
  const mk = (hostname) => SHAPI.createApi({
    hostname,
    fetchFn: async (url, opts) => { seen = { url, opts }; return { json: async () => ({ ok: 1 }) }; },
  });
  const r = await mk('science-hero-hk6429.vercel.app').call('/api/rt-room', { op: 'poll' });
  assert.equal(seen.url, `${SHAPI.API_ORIGIN}/api/rt-room`);
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.opts.body), { op: 'poll' });
  assert.deepEqual(r, { ok: 1 });
  await mk('localhost').call('/api/rt-room', { op: 'poll' });
  assert.equal(seen.url, '/api/rt-room');
});

test('call：網路失敗/非 JSON 回 {ok:0,error:"offline"}、body 省略送空物件、壞路徑 throw TypeError', async () => {
  const { SHAPI } = makeSandbox();
  const dead = SHAPI.createApi({ hostname: 'localhost', fetchFn: async () => { throw new Error('offline'); } });
  assert.deepEqual(await dead.call('/api/rt-room', { op: 'poll' }), { ok: 0, error: 'offline' });
  const badJson = SHAPI.createApi({ hostname: 'localhost', fetchFn: async () => ({ json: async () => { throw new Error('x'); } }) });
  assert.deepEqual(await badJson.call('/api/rt-room', { op: 'poll' }), { ok: 0, error: 'offline' });
  let seenBody = null;
  const api = SHAPI.createApi({ hostname: 'localhost', fetchFn: async (url, opts) => { seenBody = opts.body; return { json: async () => ({}) }; } });
  await api.call('/api/rt-room');
  assert.deepEqual(JSON.parse(seenBody), {});
  await assert.rejects(() => api.call('rt-room'), TypeError);
  await assert.rejects(() => api.call('api/rt-room'), TypeError);
});
```

- [ ] 跑 `node --test test/shapi.test.mjs`，確認全部失敗（`js/shapi.js` 不存在）
- [ ] 最小實作 `js/shapi.js`：

```js
// 跨子系統共用 API helper（即時對戰／科學市集一律經此呼叫後端；⛔ 禁止繞過本檔 fetch('api/...') 相對路徑）。
// 契約：call(path, body) 一律 POST JSON；離線/失敗回 {ok:0, error:'offline'} soft error，永不 throw
//（唯一例外：path 不以 /api/ 開頭 = 寫錯程式，直接 throw TypeError 開發期就炸出來）。
const SHAPI = (() => {
  const API_ORIGIN = 'https://science-hero.pages.dev';
  const SAME_ORIGIN_HOSTS = ['science-hero.pages.dev', 'localhost', '127.0.0.1'];

  function apiBase(hostname) {
    return SAME_ORIGIN_HOSTS.includes(hostname) ? '' : API_ORIGIN;
  }

  function createApi({ fetchFn, hostname } = {}) {
    const doFetch = fetchFn || ((...a) => fetch(...a));
    const host = () => hostname || (typeof location !== 'undefined' ? location.hostname : '');
    return {
      base() { return apiBase(host()); },
      async call(path, body) {
        if (typeof path !== 'string' || path.indexOf('/api/') !== 0) {
          throw new TypeError(`SHAPI.call path 必須以 /api/ 開頭：${path}`);
        }
        try {
          const r = await doFetch(apiBase(host()) + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
          });
          return await r.json();
        } catch {
          return { ok: 0, error: 'offline' }; // 離線/網路失敗：呼叫端顯示降級畫面
        }
      },
    };
  }

  const api = createApi();
  return { API_ORIGIN, apiBase, createApi, call: api.call, base: api.base };
})();
```

- [ ] 跑 `node --test test/shapi.test.mjs`，確認全綠
- [ ] `index.html` 的 `<script src="js/battle.js"></script>` 之後加一行 `<script src="js/shapi.js"></script>`（在 `app.js` 之前）
- [ ] 跑 `node --test test/logic.test.mjs`，確認既有 13 綠沒被弄壞；跑 `node test/smoke.mjs` 確認頁面載入無 console error
- [ ] `git add js/shapi.js test/shapi.test.mjs index.html && git commit -m "feat(rt): SHAPI 共用 API helper（鏡像站打絕對網址、soft error 降級）"`

---

## Task 2：D1 schema ＋ 假 D1 測試 helper

**Files:**
- 新增 `~/projects/science-hero/schema.sql`（kv/hash/list/zset 四表，全部 `IF NOT EXISTS`，可重複執行）
- 新增 `~/projects/science-hero/wrangler.toml`
- 新增 `~/projects/science-hero/test/fake-d1.mjs`
- 新增 `~/projects/science-hero/test/functions/fake-d1.test.mjs`
- 新增 `~/projects/science-hero/.dev.vars`（本機開發 secret，**不 commit**）

**Interfaces (Produces):**

```js
// test/fake-d1.mjs — 用 node:sqlite 造出 D1 相容介面（記憶體版），供後端單元測試
export function createFakeD1()  // → { prepare(sql) => { bind(...args) => { first(col?), all(), run() } }, batch(stmts) }
// schema 直接讀 repo 根的 schema.sql，保證測試環境與正式 D1 同構
```

**Steps:**

- [ ] 新增 `schema.sql`：**四表 SQL 逐字照抄字字珠璣 rtbattle 計畫 Task 2 的 `schema.sql`**（`100_Todo/projects/字字珠璣/docs/superpowers/plans/2026-07-20-zizizhuji-rtbattle.md`），僅檔頭註解改「科學英雄 Redis-over-D1 shim 四表（即時對戰 rt: / 科學市集 mkt: 共用）」。要件（下方測試會逐項驗）：`kv(k PK, v, exp)`／`hash(k, f, v, exp, PK(k,f))`／`list(id AUTOINCREMENT PK, k, v, exp)＋idx_list_k(k,id)`／`zset(k, member, score REAL, exp, PK(k,member))＋idx_zset_score(k,score)`；exp = 到期 epoch 毫秒（NULL=永不過期）、讀取惰性過期；全部 `IF NOT EXISTS` 可重複執行。

- [ ] 建 D1 資料庫（**新遠端資源，先向使用者口頭確認再跑**）：`cd ~/projects/science-hero && npx wrangler d1 create science-hero-db`，記下輸出的 database_id 填進 wrangler.toml
- [ ] 新增 `wrangler.toml`：

```toml
name = "science-hero"
pages_build_output_dir = "."
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "SCIENCE_HERO_DB"
database_name = "science-hero-db"
database_id = "<wrangler d1 create 輸出的 id>"
```

- [ ] 新增 `.dev.vars`（本機 `wrangler pages dev` 用）：內容一行 `RT_SECRET=dev-secret-not-for-prod`；確認 `.gitignore` 有排除，沒有就補一行 `.dev.vars`

- [ ] 寫失敗測試 `test/functions/fake-d1.test.mjs`（先 `mkdir -p test/functions`）：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';

test('fake-d1：prepare/bind/run/first/all 走 ?N 位置參數，四表 schema 齊備', async () => {
  const db = createFakeD1();
  await db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3)').bind('a', 'x', null).run();
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('a').first('v'), 'x');
  const { results } = await db.prepare('SELECT k,v FROM kv').bind().all();
  assert.deepEqual(results, [{ k: 'a', v: 'x' }]);
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('none').first('v'), null);
  const t = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kv','hash','list','zset') ORDER BY name").bind().all();
  assert.deepEqual(t.results.map(r => r.name), ['hash', 'kv', 'list', 'zset']);
});

test('fake-d1：batch 依序執行', async () => {
  const db = createFakeD1();
  await db.batch([
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('a', '1'),
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('b', '2'),
  ]);
  assert.equal(await db.prepare('SELECT COUNT(*) AS c FROM kv').bind().first('c'), 2);
});
```

- [ ] 跑 `node --test test/functions/fake-d1.test.mjs`，確認失敗
- [ ] 實作 `test/fake-d1.mjs`：**逐字照抄字字珠璣 rtbattle 計畫 Task 2 的 `test/helpers/fake-d1.mjs`**（`node:sqlite` `DatabaseSync(':memory:')`＋啟動 `db.exec` 讀 repo 根 `schema.sql`＋`mkStmt` 把 D1 的 `first(col?)/all()/run()` 映到 `get/all/run`＋`prepare(sql).bind(...args)` 工廠＋`batch` 逐一 `run`），唯一改動＝schema 路徑改 `'../schema.sql'`。（註：`node:sqlite` 的 `?1` 位置參數以引數順序繫結，與 D1 語意一致；若報 `RangeError` 改 named 形式 `{1: v1}`——先跑測試驗證再決定，不要兩種都寫。）

- [ ] 跑 `node --test test/functions/fake-d1.test.mjs`，確認全綠
- [ ] 本機 D1 套 schema 並驗證（煙霧）：

```bash
cd ~/projects/science-hero
npx wrangler d1 execute science-hero-db --local --file=schema.sql
npx wrangler d1 execute science-hero-db --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# 預期輸出包含：hash, kv, list, zset
```

- [ ] `git add schema.sql wrangler.toml test/fake-d1.mjs test/functions/ .gitignore && git commit -m "feat(rt): D1 kv/hash/list/zset 共用 schema ＋ node:sqlite 假 D1 測試 helper"`（確認 `.dev.vars` **沒有**進 commit）

---

## Task 3：`functions/lib/_kv.js` D1 shim（Redis 風格指令層）

**Files:**
- 新增 `~/projects/science-hero/functions/lib/_kv.js`
- 新增 `~/projects/science-hero/test/functions/kv-shim.test.mjs`

**Interfaces (Produces — 市集子系統直接 import，簽名寫死):**

ESM：`export function kvFor(db)`（db = `env.SCIENCE_HERO_DB`，wrangler.toml binding）。回傳物件方法（語意同 Upstash Redis；get 一律回原始字串或 null）：`get(k)` / `set(k, v, {ex}?)` / `incr(k, ttlSec?)` / `del(...keys)` / `exists(k)` / `expire(k, sec)`；`hget(k, f)` / `hgetall(k)` / `hset(k, obj)` / `hlen(k)`；`lpush(k, ...vals)` / `lrange(k, start, stop)` / `ltrim(k, start, stop)`；`zadd(k, {score, member})` / `zincrby(k, delta, member)` / `zrange(k, start, stop, {rev, withScores}?)` / `zrem(k, ...members)` / `zremrangebyrank(k, start, stop)`。

**Steps:**

- [ ] 寫失敗測試 `test/functions/kv-shim.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { kvFor } from '../../functions/lib/_kv.js';

test('kv：set/get/exists/del、物件自動 stringify、TTL 惰性過期、incr 限流桶', async () => {
  const kv = kvFor(createFakeD1());
  await kv.set('rt:a', { x: 1 });
  assert.equal(await kv.get('rt:a'), '{"x":1}');
  assert.equal(await kv.exists('rt:a'), 1);
  await kv.del('rt:a');
  assert.equal(await kv.get('rt:a'), null);
  await kv.set('rt:t', 'v', { ex: -1 }); // 已過期
  assert.equal(await kv.get('rt:t'), null);
  assert.equal(await kv.exists('rt:t'), 0);
  assert.equal(await kv.incr('rt:rl:x', 60), 1);
  assert.equal(await kv.incr('rt:rl:x', 60), 2);
});

test('hash：hset/hget/hgetall/hlen；list：lpush 新的在前、lrange 含端點、ltrim 保留區間', async () => {
  const kv = kvFor(createFakeD1());
  await kv.hset('rt:h', { a: '1', b: { c: 2 } });
  assert.equal(await kv.hget('rt:h', 'a'), '1');
  assert.deepEqual(await kv.hgetall('rt:h'), { a: '1', b: '{"c":2}' });
  assert.equal(await kv.hlen('rt:h'), 2);
  assert.equal(await kv.hgetall('rt:none'), null);
  await kv.lpush('rt:l', 'a'); await kv.lpush('rt:l', 'b'); await kv.lpush('rt:l', 'c');
  assert.deepEqual(await kv.lrange('rt:l', 0, 1), ['c', 'b']);
  await kv.ltrim('rt:l', 0, 0);
  assert.deepEqual(await kv.lrange('rt:l', 0, -1), ['c']);
});

test('zset：zadd/zincrby/zrange（rev、withScores）/zrem', async () => {
  const kv = kvFor(createFakeD1());
  await kv.zadd('rt:z', { score: 10, member: '甲' });
  await kv.zadd('rt:z', { score: 30, member: '乙' });
  assert.equal(await kv.zincrby('rt:z', 5, '甲'), 15);
  assert.deepEqual(await kv.zrange('rt:z', 0, -1, { rev: true }), ['乙', '甲']);
  assert.deepEqual(await kv.zrange('rt:z', 0, -1, { rev: true, withScores: true }), ['乙', 30, '甲', 15]);
  await kv.zrem('rt:z', '甲');
  assert.deepEqual(await kv.zrange('rt:z', 0, -1), ['乙']);
});
```

- [ ] 跑 `node --test test/functions/kv-shim.test.mjs`，確認失敗
- [ ] 實作 `functions/lib/_kv.js`：**整支從 `~/projects/vocab-duel/functions/api/_redis.js` 移植**（該檔已在 vocab-duel 與字字珠璣兩站驗證過），改動只有四處：
  1. 函式名 `redisFor` → `kvFor`（其餘方法本體逐字照抄，含 `incr` 首建即帶 TTL 的 race 修法、`sliceRange` helper）
  2. **不移植 `vercelToPages`** 轉接層（科學英雄的 functions 走原生 `onRequestPost` 風格）
  3. 表結構欄位名對齊本專案 `schema.sql`（k/f/v/exp/member/score，與 vocab-duel 同構，理論上零改動——移植後逐表比對一次）
  4. 檔頭註解改為：

```js
// Redis-over-D1 shim（科學英雄子系統共用：即時對戰 rt: / 科學市集 mkt:）
// 移植自 vocab-duel functions/api/_redis.js（僅去掉 vercelToPages 轉接層）。
// 契約：get/hget/hgetall/lrange 一律回原始字串，呼叫端防禦式 JSON.parse；
//       set/hset/lpush/zadd 傳物件自動 stringify；TTL 存 exp epoch ms、讀取惰性過期。
// 金鑰約定：各子系統 secret 分開命名不共用——即時對戰 env.RT_SECRET、市集 env.MKT_SECRET。
```

  （若移植來源不在本機，依上方測試逐條實作即可——測試就是行為規格書。）
- [ ] 跑 `node --test test/functions/kv-shim.test.mjs`，確認全綠（若 fake-d1 綁參形式需調整，只改 helper 不改 shim）
- [ ] `git add functions/lib/_kv.js test/functions/kv-shim.test.mjs && git commit -m "feat(rt): D1 kv shim（自 vocab-duel _redis.js 移植，rt:/mkt: 共用）"`

---

## Task 4：`rt-room` 後端（create / join / push / poll）

**Files:**
- 新增 `~/projects/science-hero/functions/api/rt-room.js`
- 新增 `~/projects/science-hero/functions/lib/_nick.js`（暱稱詞庫白名單＋驗證，Task 9 前端共用同一份清單）
- 新增 `~/projects/science-hero/test/functions/rt-room.test.mjs`

**Interfaces (Produces — 前端 Task 6 依賴，JSON 契約寫死):**

```
POST /api/rt-room
  { op:'create', snap }                → { ok:1, code:'1000'~'9999', seed:int }
  { op:'join', code, snap }            → { ok:1, seed, scope, opp:snap } | { ok:0, error }
  { op:'push', code, role:'p1'|'p2', state } → { ok:1 } | { ok:0, error }
  { op:'poll', code, role }            → { ok:1, opp:{snap,state,hb}|null, now:epochMs } | { ok:0, error:'房間已過期' }

snap  = { nick(詞庫組合暱稱，白名單驗證), compLv(1-5, 科學夥伴階級), hp(1-200), scope }
scope = { subject:'nature'|'biology'|'chemphys'|'earth', unit:string|null(≤24字), grade:string|null(≤2字) }
state = { dmg(0-9999), heal(0-100), round(0-10), combo(0-10), correct(0-10), done:0|1, hb:epochMs(伺服器蓋章) }

D1 keys（TTL 600 秒 = 10 分鐘房）：rt:room:{code}（meta {seed, scope}）、rt:room:{code}:p1、rt:room:{code}:p2
限流 keys：rt:rl:room:{ip}（create/join 60 秒 30 次）、rt:rl:push:{ip}（push 60 秒 120 次）
斷線判定：前端用 poll 回傳的 now − opp.hb > 20000ms 判定（DEAD_MS，Task 5 常數）
```

**Steps:**

- [ ] 實作 `functions/lib/_nick.js`（ESM，暱稱白名單的唯一事實來源；前端 `js/rtbattle.js` 持同一份清單——IIFE 無法 import，Task 5 有跨檔一致性測試守著）：

```js
export const NICK_ADJ  = ['好奇的','冷靜的','閃亮的','勇敢的','機智的','沉穩的','敏銳的','熱血的'];
export const NICK_NOUN = ['電子','磁鐵','火山','彗星','葉綠體','光子','恐龍','石英','水分子','貓頭鷹'];
export function isValidNick(nick) {   // 必須 = ADJ×NOUN 組合＋可選 2 位數字尾碼
  if (typeof nick !== 'string') return false;
  const m = nick.match(/^(.{2,4}的)(.{2,3})(\d{0,2})$/u);
  if (!m) return false;
  return NICK_ADJ.includes(m[1]) && NICK_NOUN.includes(m[2]);
}
```

- [ ] 寫失敗測試 `test/functions/rt-room.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { onRequestPost } from '../../functions/api/rt-room.js';

const SNAP = { nick: '好奇的電子', compLv: 3, hp: 100, scope: { subject: 'biology', unit: 'cell', grade: null } };
const call = (env, body, ip = '1.2.3.4') => onRequestPost({
  request: new Request('http://x/api/rt-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://science-hero.pages.dev' },
    body: JSON.stringify(body),
  }),
  env,
}).then(r => r.json());

const env = () => ({ SCIENCE_HERO_DB: createFakeD1(), RT_SECRET: 'test-secret' });

test('create → join → push → poll 全流程', async () => {
  const e = env();
  const c = await call(e, { op: 'create', snap: SNAP });
  assert.equal(c.ok, 1);
  assert.match(c.code, /^\d{4}$/);
  assert.equal(typeof c.seed, 'number');

  const j = await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '熱血的火山' } }, '5.6.7.8');
  assert.equal(j.ok, 1);
  assert.equal(j.seed, c.seed);
  assert.deepEqual(j.scope, SNAP.scope);
  assert.equal(j.opp.nick, '好奇的電子');

  const p = await call(e, { op: 'push', code: c.code, role: 'p2', state: { dmg: 30, heal: 0, round: 3, combo: 2, correct: 3, done: 0 } }, '5.6.7.8');
  assert.equal(p.ok, 1);

  const q = await call(e, { op: 'poll', code: c.code, role: 'p1' });
  assert.equal(q.ok, 1);
  assert.equal(q.opp.state.dmg, 30);
  assert.equal(q.opp.snap.nick, '熱血的火山');
  assert.equal(typeof q.opp.state.hb, 'number', 'hb 必須是伺服器蓋章的 epoch ms');
  assert.equal(typeof q.now, 'number');
});

test('join：不存在的房/滿房都回 ok:0', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'join', code: '0000', snap: SNAP })).ok, 0);
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '冷靜的磁鐵' } }, '5.6.7.8');
  assert.equal((await call(e, { op: 'join', code: c.code, snap: { ...SNAP, nick: '機智的彗星' } }, '9.9.9.9')).ok, 0);
});

test('輸入驗證：暱稱白名單、壞 scope、壞 role、超界 state 全擋', async () => {
  const e = env();
  // 暱稱只收詞庫組合——自由輸入（含正常字串）一律擋，杜絕霸凌管道；帶 2 位數尾碼合法
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '小明' } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '好奇的量子' } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, nick: '好奇的電子07' } })).ok, 1);
  assert.equal((await call(e, { op: 'create', snap: { ...SNAP, scope: { subject: 'math', unit: null, grade: null } } })).error, 'bad snap');
  assert.equal((await call(e, { op: 'push', code: 'abcd', role: 'p1', state: { dmg: 1 } })).error, 'bad req');
  assert.equal((await call(e, { op: 'push', code: '1234', role: 'p3', state: { dmg: 1 } })).error, 'bad req');
  const c = await call(e, { op: 'create', snap: SNAP });
  await call(e, { op: 'push', code: c.code, role: 'p1', state: { dmg: 999999, heal: 5000, round: 99, combo: -5, correct: 3, done: 1 } });
  const q = await call(e, { op: 'poll', code: c.code, role: 'p2' });
  assert.equal(q.opp.state.dmg, 9999);   // clamp 上限
  assert.equal(q.opp.state.heal, 100);
  assert.equal(q.opp.state.round, 10);
  assert.equal(q.opp.state.combo, 0);
});

test('限流：同 IP create 超過 30 次回錯誤', async () => {
  const e = env();
  let last = null;
  for (let i = 0; i < 31; i++) last = await call(e, { op: 'create', snap: SNAP });
  assert.ok(last.error && last.error.includes('頻繁'));
});
```

- [ ] 跑 `node --test test/functions/rt-room.test.mjs`，確認失敗
- [ ] 實作 `functions/api/rt-room.js`：**以 `~/projects/vocab-duel/functions/api/room.js` 為底移植**（本 Task 只做 create/join/push/poll 四個 op；challenge 系列留給 Task 8、season 系列留給 Task 10），改動點：
  1. 原生 CF Pages 風格：`export async function onRequestOptions()`（回 204＋CORS）與 `export async function onRequestPost({ request, env })`；request 解析 `const body = await request.json().catch(() => ({}))`；IP 取 `request.headers.get('cf-connecting-ip')`；回應一律 `new Response(JSON.stringify(obj), { status, headers: CORS(request) })`
  2. `import { kvFor } from '../lib/_kv.js'`、`import { isValidNick } from '../lib/_nick.js'`；`const kv = kvFor(env.SCIENCE_HERO_DB)`（每個 request 內建立，不用模組層變數）
  3. key 前綴：`const keyOf = (code) => \`rt:room:${code}\``；限流 key `rt:rl:room:{ip}`（incr 首建 TTL 60，>30 回 `{ok:0, error:'操作太頻繁，休息一下再試'}`）、`rt:rl:push:{ip}`（TTL 60，>120）
  4. CORS 白名單 `ORIGINS = ['https://science-hero.pages.dev', 'https://science-hero-hk6429.vercel.app', 'https://science-hero.netlify.app', 'http://localhost:8788']`；`CORS(request)` helper 寫法逐字照抄 vocab-duel `room.js`（名單內回原 origin、否則 pages.dev，外加 `POST,OPTIONS`／`Content-Type`／`Cache-Control: no-store`）
  5. `cleanSnap`／`cleanScope` 改科學英雄欄位（`clamp(n, max)` helper 逐字照抄 vocab-duel）：

```js
const OK_SUBJECT = new Set(['nature', 'biology', 'chemphys', 'earth']);
function cleanScope(s) {
  if (!s || !OK_SUBJECT.has(s.subject)) return null;
  return {
    subject: s.subject,
    unit: (typeof s.unit === 'string' && /^[a-z_]{1,24}$/.test(s.unit)) ? s.unit : null,
    grade: (typeof s.grade === 'string' && /^\d{1,2}$/.test(s.grade)) ? s.grade : null,
  };
}
function cleanSnap(s) {
  if (!s || !isValidNick(s.nick)) return null;   // 詞庫白名單，非黑名單過濾
  const scope = cleanScope(s.scope);
  if (!scope) return null;
  return { nick: s.nick, compLv: clamp(s.compLv, 5) || 1, hp: clamp(s.hp, 200) || 100, scope };
}
```

  6. `cleanState`：dmg clamp 9999、heal clamp 100、round/combo/correct clamp 10、done 0/1、`hb: Date.now()` 一律伺服器蓋章（client 傳的 hb 直接丟棄）
  7. create/join/push/poll 四段邏輯逐字移植 vocab-duel（4 位數房號 `1000 + floor(rng*9000)` 防撞 8 次重試、`seed = Math.floor(Math.random() * 2**31)`、TTL 600、push 獨立限流桶、poll 不限流、查無房回 `{ok:0, error:'房間已過期'}`），僅 key 前綴與錯誤訊息繁中化
- [ ] 跑 `node --test test/functions/rt-room.test.mjs`，確認全綠；再跑 `node --test test/functions/` 全綠
- [ ] `wrangler pages dev` 煙霧測試：

```bash
cd ~/projects/science-hero
npx wrangler d1 execute science-hero-db --local --file=schema.sql
npx wrangler pages dev . --port 8788 &
sleep 5
curl -s -X POST http://localhost:8788/api/rt-room -H 'Content-Type: application/json' \
  -d '{"op":"create","snap":{"nick":"好奇的電子","compLv":1,"hp":100,"scope":{"subject":"biology","unit":null,"grade":null}}}'
# 預期：{"ok":1,"code":"<4位數>","seed":<整數>}；用回傳 code 再打 op:'join'（換暱稱「熱血的火山」）
# 預期：{"ok":1,"seed":<同一個>,"scope":{...},"opp":{"nick":"好奇的電子",...}}
curl -s -X POST http://localhost:8788/api/rt-room -H 'Content-Type: application/json' -d '{"op":"poll","code":"0000","role":"p1"}'
# 預期：{"ok":0,"error":"房間已過期"}
kill %1
```

- [ ] `git add functions/ test/functions/rt-room.test.mjs && git commit -m "feat(rt): rt-room 後端（4 位數房號 create/join/push/poll，TTL 10 分鐘，詞庫暱稱白名單）"`

---

## Task 5：rtbattle 純邏輯層（seeded RNG、同 seed 出題、傷害記帳、勝負判定）

**Files:**
- 新增 `~/projects/science-hero/js/rtbattle.js`（IIFE `SciRtBattle`）
- 新增 `~/projects/science-hero/test/rtbattle.test.mjs`

**Interfaces (Produces — Task 6/7/8/9 依賴):**

匯出（完整行為見下方實作碼，實作即契約）：常數 `ROUNDS=10 / ROUND_SEC=15 / POLL_MS=1500 / DEAD_MS=20000 / MAX_HP=100`；`mulberry32(seed)`；`withSeededRandom(rng, fn)`；`buildQuestions(seed, pool, rounds?)` →（= `SciQuiz.buildQuestion` 原生回傳形狀的陣列；同 seed 同 pool 不論傳入順序，必同題同 mode 同選項序）；`answerResult({correct, combo, myHp, boost})` → `{dmg, nextCombo}`（`boost={double?,goggles?}`，Task 7 用）；`hpOf(maxHp, dmgTaken, healGained)`；`judge({myHp, oppHp, myDone, oppDone, oppHbAgeMs})` → `'win'|'lose'|'draw'|null`；`NICK_ADJ / NICK_NOUN / genNick(rng?)`（與 `functions/lib/_nick.js` 同一份清單）。

**Consumes（既有，不可改）:** `SciQuiz.buildQuestion(target, pool, mode)`（`js/quiz.js`，內部 shuffle／mode 擲骰全走 `Math.random`，所以 `withSeededRandom` 換掉 `Math.random` 即可讓它確定性）、`SciBattle.calcDamage(combo, hp)`（`js/battle.js`，12+combo×3、hp<30 ×1.5）。

**設計說明——為什麼用 `withSeededRandom` 而不重寫出題器：** Global Constraint 8 禁改 `SciQuiz` 簽名，而 `buildQuestion` 的三處隨機（誘答 shuffle、選項 shuffle、mode 擲骰）都走 `Math.random`。暫換 `Math.random` 為 seeded rng、finally 還原＝最小侵入的確定性化；前提是 pool **先依 id 排序**（兩機載入順序差異就不影響）。`buildQuestions` 同步一次生完 10 題再還原，中間無 await、無其他隨機消費者，安全。

**Steps:**

- [ ] 寫失敗測試 `test/rtbattle.test.mjs`。`makeSandbox` 照抄 `test/logic.test.mjs`，兩處不同：檔案清單改為既有五檔＋`'js/shapi.js','js/rtbattle.js'`、exports 改 `{ SciQuiz, SciBattle, SciStore, SciRtBattle, SHAPI }`；檔頭同樣讀 `data/biology.json` 進 `terms`。測試本體：

```js
test('mulberry32 確定性＋withSeededRandom 換掉/還原 Math.random（含 throw 走 finally）', () => {
  const { SciRtBattle } = makeSandbox();
  const seq = (rng) => Array.from({ length: 100 }, rng);
  const a = seq(SciRtBattle.mulberry32(42));
  assert.deepEqual(a, seq(SciRtBattle.mulberry32(42)));
  assert.notDeepEqual(a, seq(SciRtBattle.mulberry32(43)));
  for (const v of a) assert.ok(v >= 0 && v < 1);
  const orig = Math.random;
  assert.equal(SciRtBattle.withSeededRandom(() => 0.5, () => Math.random()), 0.5);
  assert.equal(Math.random, orig);
  assert.throws(() => SciRtBattle.withSeededRandom(() => 0.5, () => { throw new Error('boom'); }));
  assert.equal(Math.random, orig, 'throw 也要走 finally 還原');
});

test('buildQuestions：同 seed 同 pool（不看傳入順序）→ 同題同 mode 同選項序；恰 10 題不重複；正解在列；無副作用', () => {
  const { SciRtBattle } = makeSandbox();
  const orig = Math.random;
  const q1 = SciRtBattle.buildQuestions(7, terms);
  assert.equal(Math.random, orig, '生完題 Math.random 必須已還原');
  assert.deepEqual(q1, SciRtBattle.buildQuestions(7, terms), '同 seed 必逐位元組相同（含 options 順序與 mode）');
  assert.deepEqual(q1, SciRtBattle.buildQuestions(7, [...terms].reverse()), '先依 id 排序，不看 pool 傳入順序');
  assert.equal(q1.length, SciRtBattle.ROUNDS);
  assert.equal(new Set(q1.map(q => q.answerId)).size, SciRtBattle.ROUNDS, '標靶不重複');
  for (const q of q1) {
    assert.equal(q.options.length, 4);
    assert.ok(q.options.some(o => o.id === q.answerId), '正解必在選項中');
    assert.ok(q.mode === 'term2def' || q.mode === 'def2term');
  }
  assert.notDeepEqual(SciRtBattle.buildQuestions(1, terms).map(q => q.answerId),
    SciRtBattle.buildQuestions(2, terms).map(q => q.answerId), '不同 seed 不同串');
  assert.equal(SciRtBattle.buildQuestions(1, terms.slice(0, 6)).length, 6, 'pool 不足時全取');
});

test('answerResult：沿用 SciBattle.calcDamage、boost 加乘、goggles 護連擊', () => {
  const { SciRtBattle, SciBattle } = makeSandbox();
  const ar = SciRtBattle.answerResult;
  // 基準：對 12+combo*3（hp<30 ×1.5）不重造公式，直接對照 SciBattle
  assert.deepEqual(ar({ correct: true, combo: 2, myHp: 100, boost: {} }), { dmg: SciBattle.calcDamage(2, 100), nextCombo: 3 });
  assert.deepEqual(ar({ correct: true, combo: 0, myHp: 20, boost: { double: true } }), { dmg: SciBattle.calcDamage(0, 20) * 2, nextCombo: 1 });
  assert.deepEqual(ar({ correct: false, combo: 4, myHp: 100, boost: {} }), { dmg: 0, nextCombo: 0 });
  assert.deepEqual(ar({ correct: false, combo: 4, myHp: 100, boost: { goggles: true } }), { dmg: 0, nextCombo: 4 }, '護目鏡：答錯不斷連擊');
});

test('hpOf：扣傷加療、上下限 clamp', () => {
  const { SciRtBattle } = makeSandbox();
  assert.equal(SciRtBattle.hpOf(100, 30, 0), 70);
  assert.equal(SciRtBattle.hpOf(100, 30, 10), 80);
  assert.equal(SciRtBattle.hpOf(100, 0, 50), 100, '回血不可超過最大血');
  assert.equal(SciRtBattle.hpOf(100, 999, 10), 0, '不可為負');
});

test('judge：血量歸零、雙完比血、斷線判勝、未分勝負', () => {
  const { SciRtBattle } = makeSandbox();
  const base = { myHp: 100, oppHp: 100, myDone: false, oppDone: false, oppHbAgeMs: 0 };
  assert.equal(SciRtBattle.judge({ ...base, myHp: 0 }), 'lose');
  assert.equal(SciRtBattle.judge({ ...base, oppHp: 0 }), 'win');
  assert.equal(SciRtBattle.judge({ ...base, myHp: 0, oppHp: 0 }), 'draw');
  assert.equal(SciRtBattle.judge({ ...base, myDone: true, oppDone: true, myHp: 80, oppHp: 60 }), 'win');
  assert.equal(SciRtBattle.judge({ ...base, myDone: true, oppDone: true, myHp: 60, oppHp: 60 }), 'draw');
  assert.equal(SciRtBattle.judge({ ...base, oppHbAgeMs: SciRtBattle.DEAD_MS + 1 }), 'win');
  assert.equal(SciRtBattle.judge(base), null);
});

test('暱稱詞庫：前端清單與後端 functions/lib/_nick.js 逐字一致（跨檔契約守門）', async () => {
  const { SciRtBattle } = makeSandbox();
  const backend = await import('../functions/lib/_nick.js');
  assert.deepEqual(SciRtBattle.NICK_ADJ, backend.NICK_ADJ);
  assert.deepEqual(SciRtBattle.NICK_NOUN, backend.NICK_NOUN);
  const nick = SciRtBattle.genNick(SciRtBattle.mulberry32(9));
  assert.ok(backend.isValidNick(nick), `前端產生的暱稱後端必收：${nick}`);
});
```

- [ ] 跑 `node --test test/rtbattle.test.mjs`，確認失敗（`js/rtbattle.js` 不存在）
- [ ] 實作 `js/rtbattle.js`：

```js
// 即時對戰純邏輯：同 seed 不同機出同一組題；傷害權威在攻擊方；伺服器只當狀態郵筒。
// UI 層在 js/rtbattle-ui.js；本檔零 DOM、零網路，全部可 node --test（vm harness）。
const SciRtBattle = (() => {
  const ROUNDS = 10;
  const ROUND_SEC = 15;
  const POLL_MS = 1500;
  const DEAD_MS = 20000;
  const MAX_HP = 100; // 與 js/battle.js 的內部 MAX_HP 同值（該常數未匯出，改值要兩邊同步）

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function withSeededRandom(rng, fn) {
    const orig = Math.random;
    Math.random = rng;
    try { return fn(); } finally { Math.random = orig; }
  }

  function buildQuestions(seed, pool, rounds = ROUNDS) {
    const rng = mulberry32(seed);
    // 先依 id 排序：兩機的 pool 載入/篩選順序不同也能出同序（vocab-duel 已驗證手法）
    const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
    const n = Math.min(rounds, sorted.length);
    const used = new Set();
    const targets = [];
    while (targets.length < n) {
      const i = Math.floor(rng() * sorted.length);
      if (used.has(i)) continue;
      used.add(i);
      targets.push(sorted[i]);
    }
    return targets.map((t) => {
      const mode = rng() < 0.5 ? 'term2def' : 'def2term'; // mode 也由 seed 決定，不留給內部擲骰
      return withSeededRandom(rng, () => SciQuiz.buildQuestion(t, sorted, mode));
    });
  }

  function answerResult({ correct, combo, myHp, boost = {} }) {
    if (!correct) return { dmg: 0, nextCombo: boost.goggles ? combo : 0 };
    const dmg = SciBattle.calcDamage(combo, myHp) * (boost.double ? 2 : 1);
    return { dmg, nextCombo: combo + 1 };
  }

  function hpOf(maxHp, dmgTaken, healGained) {
    return Math.max(0, Math.min(maxHp, maxHp - dmgTaken + healGained));
  }

  function judge({ myHp, oppHp, myDone, oppDone, oppHbAgeMs }) {
    if (oppHbAgeMs > DEAD_MS) return 'win'; // 對手斷線
    if (myHp <= 0 && oppHp <= 0) return 'draw';
    if (myHp <= 0) return 'lose';
    if (oppHp <= 0) return 'win';
    if (myDone && oppDone) return myHp > oppHp ? 'win' : myHp < oppHp ? 'lose' : 'draw';
    return null;
  }

  // ── 暱稱詞庫：NICK_ADJ / NICK_NOUN 與 functions/lib/_nick.js（Task 4）逐字相同（跨檔一致性測試守門）；
  //    genNick(rng = Math.random) = 隨機 adj + noun + 兩位數尾碼（`${adj}${noun}07` 形式）──

  return {
    ROUNDS, ROUND_SEC, POLL_MS, DEAD_MS, MAX_HP,
    mulberry32, withSeededRandom, buildQuestions,
    answerResult, hpOf, judge,
    NICK_ADJ, NICK_NOUN, genNick,
  };
})();
```

- [ ] 跑 `node --test test/rtbattle.test.mjs`，確認全綠
- [ ] 跑 `node --test test/logic.test.mjs`，既有 13 綠不變
- [ ] `git add js/rtbattle.js test/rtbattle.test.mjs && git commit -m "feat(rt): rtbattle 純邏輯（seeded 出題/傷害記帳/勝負判定/暱稱詞庫）"`

---

## Task 6：前端房間流程＋對戰同步 UI

**Files:**
- 新增 `~/projects/science-hero/js/rtbattle-ui.js`（IIFE `SciRtBattleUI`）
- 修改 `~/projects/science-hero/js/app.js`（mode 清單加一項＋dispatch 一段＋`poolForScope` helper）
- 修改 `~/projects/science-hero/index.html`（`shapi.js` 之後加 `rtbattle.js`、`rtbattle-ui.js` 兩個 `<script>`）
- 修改 `~/projects/science-hero/css/style.css`（檔尾補 `.rt-code` 大字房號等少量樣式）
- 修改 `~/projects/science-hero/test/smoke.mjs`（加連線對戰入口的降級檢查）

**Interfaces:**

Consumes（既有，不可改簽名）：`app.js` mount ctx（比照 `SciBattle.mount` 傳法）的 `recordAnswer(target, correct, elapsedMs)`／`state`／`masteredCardCount()`／`currentPool()`；`SciBattle.companionFor(masteredCount)`（夥伴階級 → snap.compLv）；`SHAPI.call('/api/rt-room', body)`（T1）；`SciRtBattle.*`（T5）；`SciStore.save(state)`。

Produces：
```js
// js/rtbattle-ui.js — IIFE
// SciRtBattleUI.mount(el, ctx)
//   ctx = { state, subjectKey, subjectLabel, scope, pool, poolForScope, recordAnswer, masteredCardCount }
//   scope = { subject, unit, grade }（開房方的當前篩選；join 方跟隨房主 scope 用 poolForScope 重取 pool）
//   poolForScope(scope) → 詞條陣列（app.js 提供，跨科取 pool 的唯一通道）
```

`app.js` 接線點（三處，全部最小侵入）：
1. `renderModeSwitch` 的清單加 `['rtbattle', '連線對戰']`（排在「答題對戰」之後、「弱點清單」之前）
2. `renderLearningBody` 加分支 `else if (mode === 'rtbattle') renderRtBattle(body);`；`rtbattle` 模式也要顯示年級／單元篩選列（與 battle 同條件）
3. 新增：

```js
// ================= 連線對戰 =================
function poolForScope(scope) {
  let pool = subjectTerms.get(scope.subject) || [];
  if (scope.unit) pool = pool.filter((t) => t.unit === scope.unit);
  if (scope.grade) pool = pool.filter((t) => String(t.grade) === scope.grade);
  return pool;
}
function renderRtBattle(body) {
  const subjectLabel = SUBJECTS.find((s) => s.key === activeSubject)?.label || '';
  SciRtBattleUI.mount(body, {
    state, subjectKey: activeSubject, subjectLabel,
    scope: { subject: activeSubject, unit: unitFilter, grade: gradeFilter },
    pool: currentPool(), poolForScope, recordAnswer, masteredCardCount: masteredCardCount(),
  });
}
```

**Steps:**

- [ ] `index.html`：`<script src="js/shapi.js"></script>` 之後依序加：

```html
<script src="js/rtbattle.js"></script>
<script src="js/rtbattle-ui.js"></script>
```

（維持順序：store → flashcard → quiz → weak → battle → shapi → rtbattle → rtbattle-ui → app）
- [ ] `css/style.css` 檔尾補（沿用既有 `.card`／`.btn`／`.quiz-option`／`.bat-*`，只補 `.rt-vs` 對峙列、`.rt-wait`、`.rt-adventure` 奇遇卡、`.rt-result-table` 並排結算表，外加大字房號 `.rt-code { font-size: 3rem; letter-spacing: .3em; text-align: center; font-weight: 700; margin: .5em 0; }`）

- [ ] 實作 `js/rtbattle-ui.js`（流程移植 vocab-duel `js/rtbattle.js` 的 create/join/lobby/start/push/poll/answer/finish 骨架，戰鬥運算換成 `SciRtBattle`；全檔零 `fetch`，只經 `SHAPI.call`）。骨架與關鍵段落：

```js
// 連線對戰 UI：房號配對＋1.5 秒輪詢＋本機出題作答。
// 傷害權威在攻擊方：我上報累計 dmg/heal，對方畫面的我方血量 = MAX_HP − 我被打的 dmg + 我的 heal。
// 所有作答一律走 ctx.recordAnswer（app.js 唯一記錄出口），不另闢記錄路徑。
const SciRtBattleUI = (() => {
  const api = (body) => SHAPI.call('/api/rt-room', body);

  function mount(el, ctx) {
    let room = null;   // { code, role:'p1'|'p2', seed, scope, opp:snap }
    let qs = [];       // buildQuestions 產物
    let st = null;     // 本場狀態
    let pollTimer = null;
    const gone = () => !el.isConnected;   // 容器被切走 → 輪詢自清（vocab-duel live.js 手法）

    // mySnap() = { nick: myNick(), compLv: SciBattle.companionFor(ctx.masteredCardCount).level,
    //              hp: SciRtBattle.MAX_HP, scope: ctx.scope }
    // myNick()：Task 9 之前每場 SciRtBattle.genNick() 隨機；Task 9 接 sci_class 後改「有存就用存的」
    // home()：兩顆大按鈕（#rt-create、#rt-join）＋4 位數 input[inputmode=numeric]；Task 8/9/10 再各加入口
    // create()：api({op:'create', snap:mySnap()}) → 失敗 offlineCard()；成功 room={code,role:'p1',seed,scope:ctx.scope,opp:null}
    //   → lobby()：大字房號 .rt-code＋「等待對手加入中…（房間保留 10 分鐘）」＋waitForOpp() 輪詢
    // join(code)：api({op:'join', code, snap}) → 失敗 failCard(r.error||'找不到這個房間，確認房號再試一次')；
    //   成功 room={code,role:'p2',seed:r.seed,scope:r.scope,opp:r.opp} → start()

    // ── 開打：同 seed 出題 ──
    function start() {
      const pool = ctx.poolForScope(room.scope);   // join 方跟隨房主 scope，跨科也拿得到 pool
      if (pool.length < 4) return failCard('這個範圍的詞條不足 4 筆，請房主換個範圍再開房');
      qs = SciRtBattle.buildQuestions(room.seed, pool);
      st = { pool, idx: 0, dmg: 0, heal: 0, combo: 0, correct: 0, done: false,
             oppDmg: 0, oppHeal: 0, oppDone: false, oppHb: Date.now(), boost: {},
             finished: false, locked: false };
      pollTimer = setInterval(tick, SciRtBattle.POLL_MS);
      nextRound();
    }

    function myHp()  { return SciRtBattle.hpOf(SciRtBattle.MAX_HP, st.oppDmg, st.heal); }
    function oppHp() { return SciRtBattle.hpOf(SciRtBattle.MAX_HP, st.dmg, st.oppHeal); }

    // ── 每 1.5 秒：先 push 再 poll（push 兼心跳，玩家想 15 秒也不會被誤判斷線）──
    async function tick() {
      if (gone() || !st || st.finished) { clearInterval(pollTimer); return; }
      await api({ op: 'push', code: room.code, role: room.role,
        state: { dmg: st.dmg, heal: st.heal, round: st.idx, combo: st.combo, correct: st.correct, done: st.done ? 1 : 0 } });
      const r = await api({ op: 'poll', code: room.code, role: room.role });
      if (!r.ok) return; // 暫時斷線：下一輪再試，不炸畫面
      if (r.opp) {
        if (!room.opp) room.opp = r.opp.snap;
        st.oppDmg = r.opp.state.dmg; st.oppHeal = r.opp.state.heal;
        st.oppDone = !!r.opp.state.done; st.oppHb = r.opp.state.hb;
        paintHud();
      }
      const verdict = SciRtBattle.judge({
        myHp: myHp(), oppHp: oppHp(), myDone: st.done, oppDone: st.oppDone,
        oppHbAgeMs: r.opp ? r.now - st.oppHb : 0,
      });
      if (verdict) finish(verdict);
    }

    // ── 作答：唯一記錄出口 recordAnswer；傷害用 answerResult（內含 calcDamage）──
    function answer(chosenId, elapsedMs) {
      if (st.locked || st.finished) return;
      st.locked = true;
      const q = qs[st.idx];
      const correct = chosenId === q.answerId;
      const target = st.pool.find((t) => t.id === q.answerId);
      ctx.recordAnswer(target, correct, elapsedMs);       // 弱點/盒序/統計/存檔/音效一次做完
      const r = SciRtBattle.answerResult({ correct, combo: st.combo, myHp: myHp(), boost: st.boost });
      st.dmg += r.dmg;
      st.combo = r.nextCombo;
      if (correct) st.correct += 1;
      st.boost = {};                                       // 奇遇效果一次性，用完即清
      st.idx += 1;
      maybeAdventure();                                    // Task 7 接進來（本 Task 先放空函式）
      if (st.idx >= qs.length) st.done = true;
      showFeedback(correct, target, () => (st.done ? waitOpp() : nextRound()));
    }

    function nextRound() { /* 渲染第 st.idx 題：quiz-prompt/quiz-options 沿用既有 class；15 秒倒數，逾時視同答錯（chosenId=null） */ }
    function waitOpp() { /* 「你打完了！等待對手完賽…」＋雙方血條；勝負交給 tick 的 judge */ }
    function paintHud() { /* 雙方暱稱＋夥伴 emoji＋血條（沿用 .bat-hp 樣式）＋連擊標記 */ }

    // finish(verdict)：st.finished 防重入 → clearInterval → SciStore.save(ctx.state) →
    //   結算卡（.card.celebrate-in）：{win:'🏆 獲勝！', lose:'💪 惜敗', draw:'🤝 平手'}[verdict]＋
    //   「答對 X/10・總輸出 Y」＋敗方加一行「段位分不扣——把知識點記牢，下次贏回來！」（白帽）＋
    //   「回連線對戰」按鈕重 mount。Task 10 在此接賽季計分。
    // offlineCard()：「😴 連不上對戰伺服器。沒有網路也沒關係——『答題對戰』的電腦對手與
    //   同裝置雙人模式都不用連線。」；failCard(msg)：錯誤卡＋「回連線對戰」按鈕
    function maybeAdventure() { /* Task 7 實作；本 Task 先留空函式（介面先立） */ }

    home();
  }

  return { mount };
})();
```

  實作補完要點（骨架中省略的函式全數落地，無佔位）：`home()` 房號輸入 `<input inputmode="numeric" maxlength="4">`、開房前 `ctx.pool.length < 4` 提示換範圍；`waitForOpp()` 1.5 秒輪詢、過期顯示「房間已過期，重開一間吧」；每題 `ROUND_SEC` 秒倒數，逾時 `answer(null, ROUND_SEC*1000)`（算答錯、照記 `recordAnswer`）；所有 timer 在 `gone()`／`finish()` 清掉，防鬼輪詢。
- [ ] `app.js` 三處接線（上方 Interfaces 段的程式碼照放）
- [ ] `test/smoke.mjs` 追加檢查（放在「4. 弱點清單」之前；smoke 的本機 server 沒有後端，正好驗降級路徑）：

```js
  // 3c. 連線對戰：入口存在；本機 server 無後端 → 按「開房」要出現優雅降級卡，不是白畫面
  await page.click('.mode-switch button[data-mode="rtbattle"]');
  await page.waitForSelector('#rt-create');
  await page.click('#rt-create');
  await page.waitForSelector('.card');
  const rtText = await page.locator('.subject-body').textContent();
  if (!rtText.includes('連不上對戰伺服器')) fails.push('連線對戰離線時未顯示降級卡');
  console.log('✅ 連線對戰入口存在、離線降級正常');
```

  （註：smoke 靜態 server 是 localhost → SHAPI 打相對路徑 → 404 → soft error → 降級卡，順帶驗證「SHAPI 永不 throw」契約。）
- [ ] 跑 `node --test test/logic.test.mjs test/shapi.test.mjs test/rtbattle.test.mjs` 全綠；`node test/smoke.mjs` 全綠
- [ ] 真機煙霧測試（兩個瀏覽器分頁）：

```bash
cd ~/projects/science-hero
npx wrangler d1 execute science-hero-db --local --file=schema.sql
npx wrangler pages dev . --port 8788
# 開兩個分頁 http://localhost:8788：
# A：切「國中生物」→ 連線對戰 → 開房 → 看到 4 位數大字房號；B：輸房號加入 → 兩邊同時進入對戰，
#    題目、題型（term2def/def2term）與選項順序完全相同
# A 答對一題 → 約 1.5~3 秒內 B 的我方血條下降（傷害 = 12+combo*3，可心算對帳）
# B 直接關閉分頁 → 約 20 秒後 A 顯示「🏆 獲勝！」（斷線判勝）
# A 結算卡顯示「答對 X/10・總輸出 Y」，答過的題有進弱點清單（切到弱點清單確認）
```

- [ ] `git add -A && git commit -m "feat(rt): 連線對戰前端（房號配對/輪詢同步/calcDamage 傷害管線/斷線判定/離線降級）"`

---

## Task 7：科學奇遇（seed 決定事件序列、全部正面白帽、效果只影響觸發方）

**Files:**
- 修改 `~/projects/science-hero/js/rtbattle.js`（加 `ADVENTURES`／`buildAdventureScript`）
- 修改 `~/projects/science-hero/js/rtbattle-ui.js`（`maybeAdventure` 落地＋效果消化）
- 修改 `~/projects/science-hero/test/rtbattle.test.mjs`（加測試）

**Interfaces (Produces):**

`js/rtbattle.js` 追加（四事件內容見下方實作碼）：`ADVENTURE_EVERY=5`（每 5 題檢查）、`ADVENTURE_RATE=0.6`（觸發機率；最後檢查點保底必發）、`ADVENTURES`（四正面白帽事件）；`buildAdventureScript(seed, role, rounds?, every?)`——role `'p1'|'p2'` → `Map<questionIndex, adventure>`，questionIndex ∈ {5, 10}（第 N 題答完後觸發）；同 seed 同 role 同序列（斷線重整可重建）、p1/p2 不同 salt 各自序列、相鄰不重複同事件。

**設計說明：** 與字字珠璣「雙方同一事件」不同，本站規格是**雙方各自序列、效果只影響觸發方**——用 `seed ^ role salt` 分流。四事件全是加成，無懲罰事件（白帽）。`heal` 效果反映到上報的 `st.heal`（Task 4 state 契約已含 heal、clamp 100），對方畫面上我的血條同步回升。科學英雄目前沒有奇遇層，本 Task 內建輕量版（純函式、可注入 rng）。

**Steps:**

- [ ] 在 `test/rtbattle.test.mjs` 追加失敗測試：

```js
test('buildAdventureScript：檢查點只落在 5/10、同 seed 同 role 同序列、事件全出自 ADVENTURES', () => {
  const { SciRtBattle } = makeSandbox();
  const s1 = SciRtBattle.buildAdventureScript(99, 'p1');
  assert.deepEqual([...s1.entries()], [...SciRtBattle.buildAdventureScript(99, 'p1').entries()]);
  const okIds = new Set(SciRtBattle.ADVENTURES.map(a => a.id));
  for (const [at, ev] of s1) {
    assert.ok(at === 5 || at === 10, `檢查點只能在 5/10，出現了 ${at}`);
    assert.ok(okIds.has(ev.id), `事件必須出自 ADVENTURES：${ev.id}`);
  }
});

test('buildAdventureScript：p1/p2 各自序列、不同 seed 大機率不同；保底至少一事件；相鄰不重複', () => {
  const { SciRtBattle } = makeSandbox();
  const ids = (m) => [...m.entries()].map(([at, e]) => `${at}:${e.id}`).join(',');
  let diffRole = 0, diffSeed = 0;
  for (let seed = 0; seed < 200; seed++) {
    if (ids(SciRtBattle.buildAdventureScript(seed, 'p1')) !== ids(SciRtBattle.buildAdventureScript(seed, 'p2'))) diffRole++;
    if (ids(SciRtBattle.buildAdventureScript(seed, 'p1')) !== ids(SciRtBattle.buildAdventureScript(seed + 1, 'p1'))) diffSeed++;
    for (const role of ['p1', 'p2']) {
      const seq = [...SciRtBattle.buildAdventureScript(seed, role).values()].map(e => e.id);
      assert.ok(seq.length >= 1, `seed=${seed} role=${role} 整場零奇遇，保底失效`);
      for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], '相鄰不重複');
    }
  }
  assert.ok(diffRole >= 100 && diffSeed >= 100, `序列獨立性不足（role:${diffRole} seed:${diffSeed}/200）`);
});

test('奇遇效果與 answerResult/hpOf 咬合：double、goggles、heal、eliminate', () => {
  const { SciRtBattle, SciBattle } = makeSandbox();
  const effects = Object.fromEntries(SciRtBattle.ADVENTURES.map(a => [a.id, a]));
  assert.equal(effects.insight.effect, 'double');
  assert.equal(effects.goggles.effect, 'goggles');
  assert.equal(effects.breakthrough.effect, 'eliminate');
  assert.equal(effects.energy.effect, 'heal');
  assert.equal(effects.energy.amount, 10);
  const r = SciRtBattle.answerResult({ correct: true, combo: 1, myHp: 100, boost: { double: true } });
  assert.equal(r.dmg, SciBattle.calcDamage(1, 100) * 2);   // double 生效一次
  assert.equal(SciRtBattle.hpOf(100, 30, 10), 80);          // heal 進血量公式
});
```

- [ ] 跑 `node --test test/rtbattle.test.mjs`，確認新測試失敗
- [ ] `js/rtbattle.js` 實作（IIFE 內追加、return 物件補匯出）：

```js
  // ── 科學奇遇：seed 化事件序列，全部正面白帽，效果只影響觸發方 ──
  const ADVENTURE_EVERY = 5;
  const ADVENTURE_RATE = 0.6;
  const ADVENTURES = [
    { id: 'insight', name: '靈感閃現', emoji: '💡', desc: '下一題答對傷害 ×2', effect: 'double' },
    { id: 'breakthrough', name: '實驗突破', emoji: '🧪', desc: '下一題排除一個錯誤選項', effect: 'eliminate' },
    { id: 'energy', name: '能量湧現', emoji: '⚡', desc: '立刻回復 10 HP', effect: 'heal', amount: 10 },
    { id: 'goggles', name: '護目鏡', emoji: '🥽', desc: '下一次答錯不中斷連擊', effect: 'goggles' },
  ];
  const ROLE_SALT = { p1: 0x515EED01, p2: 0x515EED02 };

  function buildAdventureScript(seed, role, rounds = ROUNDS, every = ADVENTURE_EVERY) {
    const rng = mulberry32((seed ^ (ROLE_SALT[role] || 0)) >>> 0); // 與出題 rng 分流，互不干擾
    const script = new Map();
    let lastId = null;
    for (let at = every; at <= rounds; at += every) {
      const isLast = at + every > rounds;
      const fire = rng() < ADVENTURE_RATE || (isLast && script.size === 0); // 機率＋保底
      const roll = rng(); // 不論是否觸發都消費一次，保持序列穩定
      if (!fire) continue;
      const pool = ADVENTURES.filter(a => a.id !== lastId);
      const picked = pool[Math.floor(roll * pool.length)];
      lastId = picked.id;
      script.set(at, picked);
    }
    return script;
  }
```

  並在 return 補：`ADVENTURE_EVERY, ADVENTURE_RATE, ADVENTURES, buildAdventureScript,`
- [ ] 跑 `node --test test/rtbattle.test.mjs`，確認全綠
- [ ] `js/rtbattle-ui.js` 接線：
  - `start()` 時：`st.advScript = SciRtBattle.buildAdventureScript(room.seed, room.role);`
  - `maybeAdventure()` 落地：

```js
    function maybeAdventure() {
      const ev = st.advScript.get(st.idx); // st.idx 已 +1（= 已答題數）
      if (!ev) return;
      if (ev.effect === 'heal') st.heal = Math.min(100, st.heal + ev.amount);
      else st.boost[ev.effect] = true;    // double / goggles / eliminate
      showAdventure(ev); // .rt-adventure 卡片：`${ev.emoji} 科學奇遇【${ev.name}】——${ev.desc}`
    }
```

  - `nextRound()` 渲染時消化 `eliminate`：為真 → 從非正解選項隨機挑一顆（可用 `Math.random`，只影響自己畫面）加 `disabled`＋刪除線，並立即 `st.boost.eliminate = false`（渲染期先清，防誤延到下下題；`double`／`goggles` 留給 `answerResult` 消化）；`heal` 自然走 `st.heal` → `tick()` push → 雙方畫面同步回血
- [ ] 跑 `node --test test/rtbattle.test.mjs test/logic.test.mjs` 全綠；`node test/smoke.mjs` 全綠
- [ ] 真機煙霧：本機兩分頁對戰，第 5 題答完至少一方看到奇遇卡（60% 機率；多開幾場驗到）；同一方重整前後同 seed 同 role 事件序列一致；A 拿到「能量湧現」後，B 畫面上 A 的血條回升 10；「靈感閃現」下一題答對傷害翻倍（心算對帳：12+combo×3 再 ×2）
- [ ] `git add -A && git commit -m "feat(rt): 科學奇遇（seed 化事件序列/每5題檢查+保底/四正面白帽事件/效果只及觸發方）"`

---

## Task 8：非同步挑戰書（6 碼＋7 天 TTL）

**Files:**
- 修改 `~/projects/science-hero/functions/api/rt-room.js`（加 challenge/accept/challengeResult 三個 op）
- 修改 `~/projects/science-hero/test/functions/rt-room.test.mjs`（加測試）
- 修改 `~/projects/science-hero/js/rtbattle-ui.js`（發戰帖／應戰流程）

**Interfaces (Produces):**

```
POST /api/rt-room 追加：
  { op:'challenge', seed, scope, nick, score }   → { ok:1, code:'6碼英數（避混淆字元 0O1IL）' }
      score = { correct(0-10), dmg(0-9999) }
  { op:'accept', code }                           → { ok:1, seed, scope, challenger:nick, score } | { ok:0, error }
  { op:'challengeResult', code, nick, score }     → { ok:1, challenger:{nick,score}, accepter:{nick,score} } | { ok:0, error }
D1 key：rt:ch:{code}，TTL 7 天（CH_TTL = 7*86400）
碼字母表：'ABCDEFGHJKMNPQRSTUVWXYZ23456789'（無 0/O/1/I/L，口頭轉述不混淆）；accept 收大小寫
```

**流程（不需雙方同時在線）：** 發起方打完一場**單機 10 題**（同 `buildQuestions`，無對手、無輪詢），上傳成績拿 6 碼；接受方 7 天內輸碼 → 拿同 seed 同 scope → 打**完全同一串題**（含同一份 `buildAdventureScript(seed, 'p1')` 奇遇腳本——雙方都用 `'p1'` role，同一序列、絕對公平）→ 回報成績 → 並排對比結算。

**Steps:**

- [ ] `test/functions/rt-room.test.mjs` 追加失敗測試：

```js
test('挑戰書：challenge → accept → challengeResult 全流程，scope 保形、小寫碼也吃', async () => {
  const e = env();
  const scope = { subject: 'earth', unit: 'astronomy', grade: null };
  const score = { correct: 8, dmg: 152 };
  const c = await call(e, { op: 'challenge', seed: 123456, scope, nick: '沉穩的石英', score });
  assert.match(c.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const a = await call(e, { op: 'accept', code: c.code.toLowerCase() });
  assert.deepEqual([a.ok, a.seed, a.challenger], [1, 123456, '沉穩的石英']);
  assert.deepEqual(a.scope, scope);
  assert.deepEqual(a.score, score);
  const r = await call(e, { op: 'challengeResult', code: c.code, nick: '敏銳的光子', score: { correct: 9, dmg: 180 } });
  assert.deepEqual(r.challenger, { nick: '沉穩的石英', score });
  assert.deepEqual(r.accepter, { nick: '敏銳的光子', score: { correct: 9, dmg: 180 } });
});

test('挑戰書：壞碼/查無碼回 ok:0 不炸 500；成績超界 clamp；暱稱白名單照擋', async () => {
  const e = env();
  const NSCOPE = { subject: 'nature', unit: null, grade: null };
  assert.equal((await call(e, { op: 'accept', code: 'zz' })).ok, 0);
  assert.equal((await call(e, { op: 'accept', code: 'AAAAAA' })).ok, 0);
  assert.equal((await call(e, { op: 'challenge', seed: 1, scope: NSCOPE, nick: '路人甲', score: { correct: 1, dmg: 1 } })).ok, 0);
  const c = await call(e, { op: 'challenge', seed: 1, scope: NSCOPE, nick: '好奇的電子', score: { correct: 99, dmg: 999999 } });
  const a = await call(e, { op: 'accept', code: c.code });
  assert.deepEqual(a.score, { correct: 10, dmg: 9999 });   // clamp
});
```

- [ ] 跑測試確認失敗
- [ ] `rt-room.js` 實作：**challenge/accept/challengeResult 三段與 `genChCode`／`okChCode`／`CH_TTL` 逐字移植 vocab-duel `room.js`**，改動：key 前綴 `rt:ch:`、`scope` 走 `cleanScope`、`nick` 走 `isValidNick`、`cleanScore(s) = { correct: clamp(s.correct, 10), dmg: clamp(s.dmg, 9999) }`、accepter 寫回同一筆（重打以最後一次為準）、seed 驗 `Number.isInteger` 且 0 ≤ seed < 2**31、限流沿用 `rt:rl:room:{ip}`、錯誤訊息繁中
- [ ] 跑 `node --test test/functions/rt-room.test.mjs` 全綠
- [ ] `js/rtbattle-ui.js` 前端：
  - `home()` 加兩入口：「📮 發挑戰書（打一場留成績）」「⚔️ 輸入挑戰碼應戰」
  - 發起方 `soloRun()`：`seed = Math.floor(Math.random() * 2**31)` 本機產生；流程 = start() 的單機版（無 push/poll、無對手血條，奇遇腳本固定 `buildAdventureScript(seed, 'p1')`）；打完 `api({ op:'challenge', seed, scope: ctx.scope, nick: myNick(), score: { correct: st.correct, dmg: st.dmg } })` → 顯示 6 碼大字（`.rt-code`）＋「複製戰帖」按鈕（剪貼簿文案含暱稱、科別、輸出、答對數、挑戰碼與「7 天內有效」）
  - 接受方 `acceptRun(code)`：`accept` 拿 seed/scope → `poolForScope(scope)` → 同一套 `buildQuestions`＋`buildAdventureScript(seed, 'p1')` → 打完 `challengeResult` 回報 → `.rt-result-table` 並排兩人暱稱／答對數／總輸出，高者標 🏆、平手 🤝；離線／壞碼一律 soft error 卡片
- [ ] 跑 `node --test test/functions/ test/rtbattle.test.mjs` 全綠
- [ ] 真機煙霧（`wrangler pages dev`）：分頁 A 發戰帖拿 6 碼 → 無痕視窗開分頁 B 輸碼應戰 → **兩場題目與奇遇完全相同**（對照第 1 題題幹與第 5 題奇遇名）→ 結算卡並排比分正確
- [ ] `git add -A && git commit -m "feat(rt): 非同步挑戰書（6 碼 7 天 TTL，同 seed 同題同奇遇比成績）"`

---

## Task 9：全班戰況牆（老師開房全班同題搶答＋白帽榜單＋班級碼 `sci_class`）

**Files:**
- 新增 `~/projects/science-hero/functions/api/rt-live.js`
- 新增 `~/projects/science-hero/test/functions/rt-live.test.mjs`
- 修改 `~/projects/science-hero/js/rtbattle.js`（加 `safeBoard` 純函式＋`loadClass`/`saveClass`）
- 修改 `~/projects/science-hero/test/rtbattle.test.mjs`（加測試）
- 修改 `~/projects/science-hero/js/rtbattle-ui.js`（學生端「隨堂戰況」入口＋老師主持面板）

**Interfaces (Produces):**

```
POST /api/rt-live
  { op:'start', code(班級碼), qn(5|10|15), scope }   → { ok:1, live, token }（token = 主持憑證，只回給開場者）
  { op:'state', code }                                → { ok:1, live:{seed,qn,scope,phase,qNo}|null }（不含 token 材料）
  { op:'next', code, token } / { op:'end', code, token } → { ok:1, live } | { ok:0, error:'主持憑證不對' }
  { op:'answer', code, nick, qNo, correct }           → { ok:1 } | { ok:0, error }
  { op:'roster', code }                               → { ok:1, list:[{nick,score,qNo}] }（score 降冪）

主持憑證：token = HMAC-SHA256(env.RT_SECRET, `${code}:${startTs}`) 十六進位前 32 字元；start 時算好回給老師
  （前端存記憶體），next/end 用 live 內存的 startTs 重算比對——伺服器不存 token 本體（RT_SECRET 的實際用途）。
班級碼 code：^[A-Za-z0-9]{2,12}$（老師自訂，如 '803'）；phase：'lobby' → 'q' → 'end'
D1 keys（TTL 7200 秒）：rt:live:{code}（meta 含 startTs）、rt:live:{code}:roster（hash，field=nick）
```

`js/rtbattle.js` 追加：`safeBoard(rows, myNick, topN=5)` → `{ top:[前 topN 的 {nick,score}], me:{rank,nick,score}|null, total }`（白帽裁切：me 只在自己掉出 topN 時給；絕不回傳 topN 以外其他人的名次）；`loadClass()` / `saveClass({code, nick})`：localStorage `'sci_class'`（本計畫唯一新 key，市集共用），讀寫全包 try/catch，nick 一律出自 genNick 詞庫組合、不開放自由輸入。

**Steps:**

- [ ] 在 `test/rtbattle.test.mjs` 追加失敗測試：

```js
const rows = [
  { nick: '好奇的電子01', score: 9 }, { nick: '冷靜的磁鐵02', score: 8 }, { nick: '閃亮的火山03', score: 7 },
  { nick: '勇敢的彗星04', score: 6 }, { nick: '機智的光子05', score: 5 }, { nick: '沉穩的石英06', score: 4 },
  { nick: '熱血的恐龍07', score: 1 },
];

test('safeBoard：只露前 5＋自己的名次；自己在前段或查無自己回 me:null', () => {
  const { SciRtBattle } = makeSandbox();
  const b = SciRtBattle.safeBoard(rows, '熱血的恐龍07');
  assert.deepEqual(b.top.map(r => r.nick), rows.slice(0, 5).map(r => r.nick));
  assert.deepEqual(b.me, { rank: 7, nick: '熱血的恐龍07', score: 1 });
  assert.equal(b.total, 7);
  assert.ok(!('rows' in b) && !('list' in b), '不可整份名單外流');
  assert.equal(SciRtBattle.safeBoard(rows, '好奇的電子01').me, null);
  assert.equal(SciRtBattle.safeBoard(rows, '路人').me, null);
});

test('loadClass/saveClass：sci_class 讀寫、壞 JSON 不炸', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciRtBattle.loadClass(), null);
  lib.SciRtBattle.saveClass({ code: '803', nick: '好奇的電子01' });
  assert.deepEqual(lib.SciRtBattle.loadClass(), { code: '803', nick: '好奇的電子01' });
  lib.__setRaw('sci_class', '{oops');                 // 壞資料防禦
  assert.equal(lib.SciRtBattle.loadClass(), null);
});
```

  （`__setRaw` = `makeSandbox` 順手多回傳的一個小 helper，直接對 sandbox 的 localStorage stub 寫原始字串，讓測試踩得到壞資料路徑。）
- [ ] 寫失敗測試 `test/functions/rt-live.test.mjs`（`call`/`env` helper 與 rt-room 測試同款，import 路徑換 `rt-live.js`、URL 換 `/api/rt-live`；`const SCOPE = { subject: 'chemphys', unit: null, grade: null }`）：

```js
test('start → state → next → answer → roster → end 全流程', async () => {
  const e = env();
  const s = await call(e, { op: 'start', code: '803', qn: 10, scope: SCOPE });
  assert.equal(s.live.phase, 'lobby');
  assert.equal(typeof s.live.seed, 'number');
  assert.match(s.token, /^[0-9a-f]{32}$/, '主持憑證 = HMAC 十六進位前 32 字元');
  const st = await call(e, { op: 'state', code: '803' });
  assert.equal(st.live.startTs, undefined, 'token 材料（startTs）絕不外洩');
  const n = await call(e, { op: 'next', code: '803', token: s.token });
  assert.deepEqual([n.live.phase, n.live.qNo], ['q', 1]);
  assert.equal((await call(e, { op: 'next', code: '803', token: 'deadbeef'.repeat(4) })).ok, 0, '假憑證擋下');
  await call(e, { op: 'answer', code: '803', nick: '好奇的電子01', qNo: 1, correct: true });
  await call(e, { op: 'answer', code: '803', nick: '冷靜的磁鐵02', qNo: 1, correct: false });
  const r = await call(e, { op: 'roster', code: '803' });
  assert.deepEqual(r.list[0], { nick: '好奇的電子01', score: 1, qNo: 1 });
  assert.deepEqual(r.list[1], { nick: '冷靜的磁鐵02', score: 0, qNo: 1 });
  assert.equal((await call(e, { op: 'end', code: '803', token: s.token })).live.phase, 'end');
});

test('防灌分與輸入驗證：重送不計分、lobby 不收答案、詞庫外暱稱擋、進行中不可重開、壞班級碼擋', async () => {
  const e = env();
  assert.equal((await call(e, { op: 'start', code: '有空格 x', qn: 5, scope: SCOPE })).ok, 0);
  const s = await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE });
  assert.equal((await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE })).ok, 0, '進行中不可重開');
  assert.equal((await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true })).ok, 0, 'lobby 不收答案');
  await call(e, { op: 'next', code: 'c1', token: s.token });
  await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true });
  await call(e, { op: 'answer', code: 'c1', nick: '好奇的電子01', qNo: 1, correct: true }); // 重送
  assert.equal((await call(e, { op: 'roster', code: 'c1' })).list[0].score, 1, '重送不灌分');
  assert.equal((await call(e, { op: 'answer', code: 'c1', nick: '王小明', qNo: 1, correct: true })).ok, 0);
  await call(e, { op: 'end', code: 'c1', token: s.token });
  assert.equal((await call(e, { op: 'start', code: 'c1', qn: 5, scope: SCOPE })).ok, 1, '結束後可重開');
});
```

- [ ] 跑兩支新測試確認失敗
- [ ] `js/rtbattle.js` 實作 `safeBoard`／`loadClass`／`saveClass`：

```js
  function safeBoard(rows, myNick, topN = 5) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, topN).map(({ nick, score }) => ({ nick, score }));
    const idx = sorted.findIndex(r => r.nick === myNick);
    const me = idx >= topN ? { rank: idx + 1, nick: myNick, score: sorted[idx].score } : null;
    return { top, me, total: sorted.length };
  }
```

  `loadClass`/`saveClass`：localStorage key 常數 `'sci_class'`；`loadClass` 全包 try/catch、JSON.parse 後驗 `code`/`nick` 皆為字串才回物件（否則 null）；`saveClass` 只寫 `{code, nick}` 兩欄、寫入失敗（隱私模式）靜默。return 補：`safeBoard, loadClass, saveClass,`
- [ ] 實作 `functions/api/rt-live.js`（CORS／限流／`isValidNick` 沿用 rt-room 同款；主持改「HMAC token」輕量憑證，不綁帳號）。要點：
  - `hostToken(secret, code, startTs)`：

```js
async function hostToken(secret, code, startTs) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${code}:${startTs}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
```

  - `start`：班級碼驗 `^[A-Za-z0-9]{2,12}$`、`qn` 只收 5/10/15、scope 走 `cleanScope`；既有場次 `phase !== 'end'` 回 `{ok:0, error:'這個班級碼已有進行中的隨堂戰況'}`；`kv.set('rt:live:'+code, {...含 startTs}, {ex:7200})`；回 `{ok:1, live:公開欄位, token}`
  - `state`：讀出後 `delete live.startTs` 再回；`next`/`end`：用存的 startTs 重算 token 比對，不符回 `{ok:0, error:'主持憑證不對'}`；`next` 推 `'lobby'→'q'`、`qNo+1`，`qNo` 達 `qn` 後再按一次轉 `'end'`
  - `answer`：`phase !== 'q'` 擋；暱稱走 `isValidNick`；roster 用 hash 存 `{score, qNo}`，**`qNo <= 已記錄 qNo` 直接忽略**（防重送灌分）；`hset` 後 `expire(rosterKey, 7200)`；`roster`：`hgetall` → 防禦式 parse → score 降冪
- [ ] 跑 `node --test test/functions/rt-live.test.mjs test/rtbattle.test.mjs`，全綠
- [ ] `js/rtbattle-ui.js` 接線：
  - `home()` 加兩入口：「📡 隨堂戰況（學生）」「🧑‍🏫 我是老師（開場主持）」
  - **班級碼與暱稱（`sci_class` 在此建立）**：學生首次進入 → 輸入班級碼＋按「🎲 抽一個科學代號」（`genNick()` 產生、可重抽、**無自由輸入框**）→ `saveClass({code, nick})`、之後預填 `loadClass()`；Task 6 的 `myNick()` 同步改為 `loadClass()?.nick || 隨機`（連線對戰與戰況牆共用同一代號）
  - 老師端：班級碼＋題數（5/10/15）→ `start`（token 存記憶體）→ 主持面板「下一題」「結束」＋`roster` 3 秒輪詢（已答人數與前五名）；結束投影 `safeBoard(rows, null).top` 前五＋「全班共 N 人參賽」（**不投影完整名單**）
  - 學生端：`state` 3 秒輪詢 → `phase === 'q'` 用 `buildQuestions(live.seed, poolForScope(live.scope), live.qn)` 本機出題、顯示第 `live.qNo` 題 → 作答走 `ctx.recordAnswer`＋`answer` op 回報 → 已答顯示「等老師出下一題」；結束畫面只顯示 `safeBoard(rows, myNick)`：前五＋（掉出前五時）「你目前第 N 名・答對 X 題」＋「跟上一場的自己比就是進步」；輪詢自清 `gone()` 同 Task 6
- [ ] 跑 `node --test test/functions/ test/rtbattle.test.mjs test/logic.test.mjs` 全綠；`node test/smoke.mjs` 全綠
- [ ] 真機煙霧（`wrangler pages dev`）：一分頁當老師開場（班級碼 803、5 題）、兩分頁當學生加入 → 同題同選項 → 老師按「下一題」兩生畫面同步換題 → 老師端看到已答人數 → 結束畫面：老師投影前五、學生只看到前五＋自己名次
- [ ] `git add -A && git commit -m "feat(rt): 全班戰況牆（老師開房全班同題/HMAC 主持憑證/榜只露前五/sci_class 班級碼+詞庫代號）"`

---

## Task 10：月賽季排位（D1 zset、每月重置、賽季稱號）

**Files:**
- 修改 `~/projects/science-hero/js/rtbattle.js`（加 SEASON_* 常數與純函式）
- 修改 `~/projects/science-hero/test/rtbattle.test.mjs`（加測試）
- 修改 `~/projects/science-hero/functions/api/rt-room.js`（加 seasonAdd/seasonTop 兩個 op）
- 修改 `~/projects/science-hero/test/functions/rt-room.test.mjs`（加測試）
- 修改 `~/projects/science-hero/js/rtbattle-ui.js`（結算計分＋排位榜畫面）

**Interfaces (Produces):**

`js/rtbattle.js` 追加（常數值與行為見下方實作碼）：`SEASON_TITLES`（六階）、`WIN_PTS=20`、`LOSE_PTS=5`（輸也加分，白帽不倒扣）；`seasonKey(dateStr)`＝`'YYYY-MM-DD'→'YYYY-MM'`；`titleFor(pts)`；`recordSeasonResult(state, todayStr, verdict)`——verdict `'win'|'lose'|'draw'`，直接改 `state.rtSeason`（SciStore 主 state，呼叫端負責 `SciStore.save`）後回傳 `{key, pts, wins, battles, title}`；跨季自動歸零、上季稱號收進 `state.rtSeason.titles = {'YYYY-MM': '稱號'}`（本機收藏，跟匯出/匯入走）。

```
POST /api/rt-room 追加：
  { op:'seasonAdd', nick, pts }  → { ok:1, total }   // zset zincrby；pts clamp 0-20（單場上限）；賽季 key 伺服器自算
  { op:'seasonTop', season? }    → { ok:1, season:'YYYY-MM', top:[{nick,pts}] }  // 前 10 名；season 省略 = 本月
D1 key：rt:season:{YYYY-MM}（zset，member=nick），TTL 100 天（跨月可回顧上季榜）
```

**與本機 PvE 段位（`state.rank`）的關係（規格要求講清楚）——兩套完全獨立：**
1. `state.rank`（`SciBattle.rankWin/rankLose`）**只認 PvE，本計畫完全不動**：連線對戰勝敗不呼叫 `rankWin/rankLose`，每週首敗保護照舊。
2. 賽季分（`state.rtSeason` 本機鏡像＋`rt:season:{YYYY-MM}` 雲端榜）**只認同步房連線對戰**：勝 +20、敗/平 +5；每月 1 日換季歸零，上季稱號入本機收藏（稀缺性：賽季限定稱號）。
3. 挑戰書與全班戰況牆**不計賽季分**（避免變成刷分管道）。

**Steps:**

- [ ] 在 `test/rtbattle.test.mjs` 追加失敗測試：

```js
test('seasonKey/titleFor：月賽季切齊、門檻邊界', () => {
  const { SciRtBattle } = makeSandbox();
  assert.equal(SciRtBattle.seasonKey('2026-07-20'), '2026-07');
  assert.equal(SciRtBattle.seasonKey('2026-12-01'), '2026-12');
  assert.equal(SciRtBattle.titleFor(0), '見習觀測員');
  assert.equal(SciRtBattle.titleFor(59), '見習觀測員');
  assert.equal(SciRtBattle.titleFor(60), '正式研究員');
  assert.equal(SciRtBattle.titleFor(880), '星際科學家');
  assert.equal(SciRtBattle.titleFor(99999), '星際科學家');
});

test('recordSeasonResult：勝 +20、敗 +5（不倒扣）、平 +5；跨季歸零＋上季稱號入收藏', () => {
  const { SciRtBattle, SciStore } = makeSandbox();
  const state = SciStore.load();
  let r = SciRtBattle.recordSeasonResult(state, '2026-07-20', 'win');
  assert.deepEqual([r.key, r.pts, r.wins, r.battles], ['2026-07', 20, 1, 1]);
  r = SciRtBattle.recordSeasonResult(state, '2026-07-21', 'lose');
  assert.deepEqual([r.pts, r.wins, r.battles], [25, 1, 2]);
  assert.equal(r.title, '見習觀測員');
  r = SciRtBattle.recordSeasonResult(state, '2026-08-01', 'draw');   // 換季
  assert.deepEqual([r.key, r.pts, r.battles], ['2026-08', 5, 1]);
  assert.equal(state.rtSeason.titles['2026-07'], '見習觀測員', '上季稱號要收進本機收藏');
  // 既有欄位不受影響（Global Constraint 8）
  assert.equal(state.stats.totalReviews, 0);
  assert.equal(state.rank, undefined, '不可動到 PvE 段位欄位');
});
```

- [ ] `test/functions/rt-room.test.mjs` 追加：

```js
test('seasonAdd/seasonTop：累積、單場封頂 20、前 10 降冪、暱稱白名單', async () => {
  const e = env();
  await call(e, { op: 'seasonAdd', nick: '好奇的電子01', pts: 20 });
  const r = await call(e, { op: 'seasonAdd', nick: '好奇的電子01', pts: 999 }); // clamp 到 20
  assert.equal(r.total, 40);
  await call(e, { op: 'seasonAdd', nick: '冷靜的磁鐵02', pts: 5 });
  assert.equal((await call(e, { op: 'seasonAdd', nick: '王小明', pts: 5 })).ok, 0);
  const top = await call(e, { op: 'seasonTop' });
  assert.equal(top.ok, 1);
  assert.match(top.season, /^\d{4}-\d{2}$/);
  assert.deepEqual(top.top, [{ nick: '好奇的電子01', pts: 40 }, { nick: '冷靜的磁鐵02', pts: 5 }]);
});
```

- [ ] 跑兩支測試確認失敗
- [ ] `js/rtbattle.js` 實作（IIFE 內追加；`recordSeasonResult` 純資料操作，不碰 localStorage——存檔責任在呼叫端 `SciStore.save`，與 `SciBattle.rankWin` 同一分工慣例）：

```js
  const SEASON_TITLES = [
    { min: 0, title: '見習觀測員' },
    { min: 60, title: '正式研究員' },
    { min: 160, title: '資深實驗家' },
    { min: 320, title: '首席研究員' },
    { min: 560, title: '科學院士' },
    { min: 880, title: '星際科學家' },
  ];
  const WIN_PTS = 20;
  const LOSE_PTS = 5; // 敗/平也加分（白帽：不倒扣，參與就有累積）

  function seasonKey(dateStr) { return dateStr.slice(0, 7); }

  function titleFor(pts) {
    let t = SEASON_TITLES[0].title;
    for (const s of SEASON_TITLES) if (pts >= s.min) t = s.title;
    return t;
  }

  function recordSeasonResult(state, todayStr, verdict) {
    const key = seasonKey(todayStr);
    let s = state.rtSeason;
    if (!s || s.key !== key) {
      const titles = (s && s.titles) || {};
      if (s && s.key) titles[s.key] = titleFor(s.pts); // 上季稱號入收藏
      s = state.rtSeason = { key, pts: 0, wins: 0, battles: 0, titles };
    }
    s.battles += 1;
    if (verdict === 'win') { s.pts += WIN_PTS; s.wins += 1; }
    else s.pts += LOSE_PTS;
    return { key: s.key, pts: s.pts, wins: s.wins, battles: s.battles, title: titleFor(s.pts) };
  }
```

  return 補：`SEASON_TITLES, WIN_PTS, LOSE_PTS, seasonKey, titleFor, recordSeasonResult,`
- [ ] `rt-room.js` 實作 seasonAdd/seasonTop：賽季 key 伺服器自算（`new Date().toISOString().slice(0, 7)`，**不信任 client**）；`seasonAdd` 走 `isValidNick` 驗證＋`clamp(pts, 20)`＋`rt:rl:room:{ip}` 同一限流桶；`zincrby` 後 `expire('rt:season:'+key, 100*86400)`；`seasonTop` 收 `season` 參數時驗 `^\d{4}-\d{2}$`（否則用本月），`zrange(key, 0, 9, { rev: true, withScores: true })` 組成 `[{nick, pts}]`
- [ ] 跑 `node --test test/functions/ test/rtbattle.test.mjs` 全綠
- [ ] `js/rtbattle-ui.js` 接線：
  - Task 6 的 `finish(verdict)` 末尾加：`const season = SciRtBattle.recordSeasonResult(ctx.state, SciStore.todayStr(), verdict);` → `SciStore.save(ctx.state)` → 結算卡加一行 `🗓️ ${season.key} 賽季・${season.title}（${season.pts} 分，勝+20/其餘+5）` → `api({ op:'seasonAdd', nick: myNick(), pts: verdict==='win' ? WIN_PTS : LOSE_PTS })`（soft error 可忽略）
  - `home()` 加「🏆 賽季排位榜」入口：`seasonTop` → 前 10 名列表＋自己的本機分數與稱號＋歷季稱號收藏（`state.rtSeason.titles`）＋說明「每月 1 日換季重新起算；輸了也有參與分，不倒扣」；離線時顯示本機賽季資料＋「連上網路才看得到全服排行」
- [ ] 真機煙霧：打完一場，結算卡出現賽季稱號與分數；排位榜看得到自己的科學代號；輸的一方也 +5
- [ ] `git add -A && git commit -m "feat(rt): 月賽季排位（D1 zset 月榜/六階賽季稱號/敗不扣分白帽計分/本機稱號收藏）"`

---

## Task 11：部署與端到端驗證

**Files:** 無新檔（部署動作＋驗證清單）

**Steps:**

- [ ] 全量測試最後一跑：

```bash
cd ~/projects/science-hero
node scripts/validate-all.mjs                                    # 資料驗證 ALL CLEAN
node --test test/logic.test.mjs test/shapi.test.mjs test/rtbattle.test.mjs   # 前端純邏輯全綠
node --test test/functions/                                      # 後端全綠
node test/smoke.mjs                                              # SMOKE ALL PASS ✅
```

- [ ] 遠端 D1 套 schema（`IF NOT EXISTS` 可安全重跑；**寫遠端，先向使用者口頭確認**）：

```bash
npx wrangler d1 execute science-hero-db --remote --file=schema.sql
npx wrangler d1 execute science-hero-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# 預期含：hash, kv, list, zset
```

- [ ] 設定 `RT_SECRET`（production secret，與本機 `.dev.vars` 不同值；用亂數產生，**不落任何檔案、不入版控**）：

```bash
openssl rand -hex 32 | npx wrangler pages secret put RT_SECRET --project-name science-hero
npx wrangler pages secret list --project-name science-hero
# 預期列出：RT_SECRET
```

  （換 RT_SECRET 只影響 2 小時 TTL 內的戰況牆場次，可接受；`MKT_SECRET` 留給市集計畫自設，此處不碰。）
- [ ] **向使用者口頭確認後**才部署（守則：寫遠端前先確認）：
  - CF Pages（後端唯一平台）：`npx wrangler pages deploy . --project-name science-hero --branch master`
  - Vercel／Netlify 鏡像照既有三平台 SOP 重推（純靜態即可——`functions/`、`wrangler.toml`、`schema.sql` 推上去也不影響靜態站；前端經 SHAPI 打絕對網址就吃得到後端）
- [ ] 線上端到端驗證清單：
  - API 活著：

```bash
curl -s -X POST https://science-hero.pages.dev/api/rt-room -H 'Content-Type: application/json' \
  -d '{"op":"poll","code":"0000","role":"p1"}'
# 預期：{"ok":0,"error":"房間已過期"}
curl -s -X POST https://science-hero.pages.dev/api/rt-room -H 'Content-Type: application/json' -d '{"op":"seasonTop"}'
# 預期：{"ok":1,"season":"<本月>","top":[...]}（首日空榜 top:[]）
```

  - pages.dev 兩裝置真機對戰一場：同題同選項、傷害 1.5~3 秒內同步、奇遇卡出現（機率性，多開幾場）、結算卡有賽季稱號、答題有進弱點清單
  - **關鍵回歸（vocab-duel 地雷驗證）**：Vercel 與 Netlify 鏡像各開一次連線對戰，確認能開房／加入（DevTools Network 確認請求打到 `https://science-hero.pages.dev/api/rt-room`，**無相對路徑 `api/` 請求、無 CORS 錯誤**）
  - 挑戰書：pages.dev 發戰帖 → 手機輸碼應戰 → 並排比分正確；戰況牆：一師二生三裝置跑 5 題隨堂，老師端已答人數即時、結束畫面只顯示前五＋個人名次；離線降級：飛航模式開站 → 連線對戰顯示降級卡、閃卡/自測/PvE 照常可玩
- [ ] 全庫 grep 守門（防回歸）：`grep -rn "fetch('api/\|fetch(\"api/\|fetch(\`api/" js/ && echo '❌ 相對路徑 fetch' || echo '✅ 無相對路徑 fetch'`；另人工掃 `js/` 所有 `fetch(` 呼叫點，除 `shapi.js` 本體與 `app.js` 的 `fetch(subject.file)`（靜態資料檔，放行）外不得有別的 fetch
- [ ] `git push origin master`；同步回 iCloud 母版 `naicheng-claude-agent/科學英雄`（守 iCloud 慣例：大檔產物不 commit 進母版 git）
- [ ] 回報使用者：三平台網址、新功能入口位置（各科分頁 → 連線對戰）、已知限制（傷害上報無簽章、靠 clamp＋限流防作弊；房間 10 分鐘 TTL；戰況牆單班同時只能一場）

---

## 自我檢查（已核對）

- **Spec 覆蓋**（對照 `docs/superpowers/specs/2026-07-20-science-hero-revamp-design.md` 即時對戰段落與跨子系統契約）：SHAPI 絕對網址＋soft error＋localhost override（T1）；D1 四表＋假 D1 照抄字字珠璣手法（T2）；kv shim（T3）；4 位數房號＋seed＋10 分 TTL＋20 秒心跳＋限流＋`rt:`（T4）；同 seed 同題（既有 `buildQuestion`＋選項序確定性）＋mulberry32＋`calcDamage` 沿用＋勝負判定（T5）；大字房號／加入／1.5 秒輪詢／血條同步／斷線判勝／app.js 接線／雙分頁驗證（T6）；奇遇 seed 化、各自序列、效果只及觸發方、四正面事件、每 5 題＋機率＋保底（T7）；挑戰書 6 碼＋7 天＋同題並排結算（T8）；戰況牆前五＋私訊名次＋`sci_class` 詞庫暱稱（T9）；月賽季 zset＋每月重置＋稱號收藏＋與 `state.rank` 關係（T10）；部署＋`RT_SECRET`＋鏡像絕對網址回歸＋curl 預期 JSON＋smoke（T11）。
- **設計規格三大差異遵守**：無 meta 層 → 自帶班級碼地基（T9）、零晶能收支（晶能屬科學基地計畫）；IIFE 慣例＋vm harness＋playwright smoke 全程沿用；視覺 emoji 先行、無生圖阻塞。
- **既有介面核實**（寫計畫前逐檔讀過原始碼）：`SciQuiz.buildQuestion(target, pool, mode=null)` 回 `{mode, prompt, options:[{id,label}], answerId}`、內部隨機全走 `Math.random`；`SciBattle.calcDamage(combo, hp)`＝12+combo×3、hp<30 ×1.5，`MAX_HP=100` 內部常數未匯出，`companionFor(masteredCount)` 回含 `level` 的物件，`state.rank={pts,peak,shieldWk}` 只認 PvE；`recordAnswer(target, correct, elapsedMs)` 是 `app.js` 閉包、經 mount ctx 傳入（比照 `SciBattle.mount` 既例）；`currentPool()`＝unit/grade 雙重篩選；`SciStore` key `science-hero:v1`、`todayStr()` 回 `YYYY-MM-DD`；vm harness＝檔案串接＋`globalThis.__exports`；smoke＝playwright-core＋本機靜態 server；`index.html` script 順序 store→flashcard→quiz→weak→battle→app。
- **無占位語**：全文無 TBD/TODO；每個 Task 附完整失敗測試碼、實作碼或逐字移植來源與改動點清單、可貼上執行的指令與預期輸出。
- **跨 Task 簽名一致**：`SHAPI.call`（T1→T6/T8/T9/T10）；`kvFor`（T3→T4/T8/T9/T10）；`snap/state/scope` 形狀（T4→T6，`heal` 供 T7）；`buildQuestions`（T5→T6/T8/T9）；`answerResult/hpOf/judge`（T5→T6，`boost` 供 T7）；`buildAdventureScript`（T7→T6，T8 雙方固定 `'p1'`）；`isValidNick`＋詞庫（T4 定義、T5 鏡像＋一致性測試、T9/T10 使用）；`safeBoard/loadClass/saveClass`（T9 定義、`myNick()` 回接 T6）；`recordSeasonResult`（T10→T6 `finish`）。
- **白帽總查**：奇遇全正面（T7）、敗不扣賽季分（T10）、PvE 首敗保護不動、榜只露前五＋私訊名次（T9）、暱稱零自由輸入（T4/T9）、離線降級不懲罰（T1/T6）、挑戰書/戰況牆不計分防刷（T10）。
