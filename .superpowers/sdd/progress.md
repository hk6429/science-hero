# SDD Progress Ledger — 科學英雄改版（八角理論強化）

設計規格與四份計畫在母版：`naicheng-claude-agent/科學英雄/docs/superpowers/`
執行順序：科學基地 → 即時對戰 → 精靈融合 → 科學市集

## 跨計畫一致性檢查（2026-07-20 完成）

四份計畫落盤後做過一輪 grep 一致性檢查，結論：契約大致對齊，僅一處真漂移已修正。

- **已修正**：共用貨幣 `SciEconomy` 參數順序——base 原定 `(reason, n)`、fusion/market 為 `(n, reason)`。統一為**數量在前** `earnCrystals(n, reason)`／`spendCrystals(n, reason)`（改 base 一檔約 15 處，consumer 零改動；符合慣例、且 base 的 spendCrystals body 不用 reason，consumer 傳單一 n 仍相容）。
- **確認無誤**（非漂移）：rtbattle 的 `_redis.js` 3 處是移植來源引用（vocab-duel→`_kv.js`）；`fuse:` D1 前綴 0 處（融合純前端）；`SHAPI` 歸屬正確；晶能上限 100、`rt:`/`mkt:` namespace、`RT_SECRET`/`MKT_SECRET` 分離、五把 localStorage 鑰匙全一致。
- **待執行階段處理（軟性語意提醒，非阻塞）**：market 的 `withdraw → earnCrystals（豁免上限）` 期待跳過每日上限，但 base 的 `UNCAPPED` 目前只含 `'achievement'`。做到 market Task 3/8 錢包出金時，需在 base `UNCAPPED` 加入 `'mkt-withdraw'` 之類 reason（或改用不計上限的專用入金路徑），否則玩家提領自己存入的晶能會誤撞每日上限。

## 計畫 A：科學基地 (2026-07-20-science-hero-base.md, 9 Tasks)

**✅ 完工上線 2026-07-21**（commit c00cdf2，三平台部署）。Codex 在母版實作（沙盒寫不進
~/projects，改指母版），全 9 Task TDD 完成。新檔 js/economy.js（SciEconomy 晶能單一入口）／
base-store.js（純邏輯）／base-ui.js（場景渲染，缺圖 onerror→emoji 佔位）；app.js/battle.js
掛鉤晶能發放；index.html 掛 script。驗收：validate-all 1001 筆過、logic 13→39 全綠、
smoke ALL PASS（Claude 補跑，並加 assets/base 佔位圖 404 精準放行）。同時修好 ~/projects
測試檔歷史落差（logic 8→39、smoke 補齊）。美術 38 張生圖清單未做（emoji-first，不阻塞）。

## 計畫 B：即時對戰 (2026-07-20-science-hero-rtbattle.md, 11 Tasks)

**✅ 完工上線 2026-07-21**（commit 025a7d0，三平台＋真後端）。Codex 母版實作 11 Task TDD。
新檔 js/shapi.js（跨子系統後端入口，鏡像站絕對 URL 打回 pages.dev）、rtbattle.js＋rtbattle-ui.js
（1.5s 輪詢、seeded 確定性出題、科學奇遇、離線降級卡）、functions/api/rt-room.js＋rt-live.js、
functions/lib/_kv.js（Redis-over-D1 shim）＋_nick.js、schema.sql 四表、wrangler.toml。
主線程接手基建：建 D1 `science-hero-db`（id 403a5481-7335-46b7-b382-fb62ddf64408）、
schema 套遠端＋本機、`.dev.vars` 本機 RT_SECRET（gitignored）、CF Pages production 設 RT_SECRET
secret。驗收：validate 1001 過、70/70 測試綠（55 前端 + 15 Functions）、smoke ALL PASS（修
Codex 兩處 smoke 寫法：/api 404 白名單放行離線觸發、降級卡改等文字非同步渲染）；真後端
round-trip 實測 create→房號+seed 寫入、join→讀回對手快照、seasonTop→D1 zset 讀皆 ok:1。

## 計畫 C：精靈融合 (2026-07-20-science-hero-fusion.md, 9 Tasks)

**✅ 完工上線 2026-07-21**（commit 88586af，三平台，純前端無基建）。Codex 母版實作 9 Task TDD。
新檔 js/fusion-store.js（sci_fusion 獨立存檔，等級掛精通詞卡數不掛操作次數）；六隻稚靈融合：
雙親不消耗、20% 失敗只扣晶能返還 15、每日 3 次上限＋滿額退款修正；配方揭曉解謎題、稚靈隨行
PvE 第二段追擊（PvP 不觸發保公平）、1080×1350 名片分享。改 battle.js（追擊接線）／app.js
（融合坊入口）／economy.js（滿額退款）。驗收：validate 1001、87/87 前端測試綠、smoke ALL PASS
（修 Codex 一處 smoke：關閉後 overlay 帶 hidden 需 state:'hidden' 等待，預設等可見會逾時）。
自然科 0 筆 advanced:true → 依計畫用既有詞池 fallback。

## 計畫 D：科學市集 (2026-07-20-science-hero-market.md, 9 Tasks)

**✅ 完工上線 2026-07-21**（commit 4fb0910，三平台＋真後端）。Codex 母版實作 9 Task TDD，
複用即時對戰基建（_kv/D1 四表，mkt: 前綴、獨立 MKT_SECRET，無需新 schema）。新檔
functions/api/mkt.js＋functions/lib/market-core.js、js/market-store.js（sci_market 背包/攜帶/
claims/留痕）＋market-ui.js（六件攤位/透明規則/離線降級）。班級限定上架、HMAC 簽章、每日 3 次
限購、週五時窗、10% 稅、claimKey 防重複領款、roster fail-closed、珍品週限量 5、達人榜。
economy.js UNCAPPED 補 mkt-withdraw/mkt-refund（保留融合退款）。主線程接手：CF Pages 設
MKT_SECRET secret、遠端 D1 四表沿用。驗收：validate 1001、133/133 測試綠（97 前端 + 36
Functions）、smoke ALL PASS；真後端實測 list/wallet/stars 皆 ok:1、deposit 被 roster gate
正確擋（「先在戰況牆報到才能交易」防濫用）。

---

## 🎉 四份計畫全數完工上線（2026-07-21）

基地 → 即時對戰 → 精靈融合 → 科學市集，38 Tasks 全部 TDD 完成、三平台部署驗證。
共用基建：SciEconomy 晶能單一入口（UNCAPPED=achievement/fusion-refund/mkt-withdraw/mkt-refund）、
SHAPI（鏡像站絕對 URL 打回 pages.dev）、_kv Redis-over-D1 shim（science-hero-db
id 403a5481-7335-46b7-b382-fb62ddf64408，四表 kv/hash/list/zset，rt:/mkt: 前綴）、
RT_SECRET/MKT_SECRET 分離。全站三平台：science-hero.pages.dev（含後端）/
science-hero-hk6429.vercel.app / science-hero.netlify.app。
美術（2026-07-21 補完，commit 60bdcfd 三平台）：科學基地 38 張扁平插畫全上線（assets/base/），
取代 emoji 佔位。其餘子系統（對戰/融合/市集）維持 emoji（無 <img> 槽，設計即用 emoji）。
