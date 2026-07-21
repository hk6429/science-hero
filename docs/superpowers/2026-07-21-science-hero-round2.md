# 科學英雄 — 第二波收尾（G1–G4）

純前端 vanilla JS（<script> IIFE）。用 TDD（能寫純函式測試的就寫）。改完三者全綠：
`node scripts/validate-all.mjs`、`node --test test/logic.test.mjs test/functions/fake-d1.test.mjs test/functions/kv-shim.test.mjs test/functions/rt-live.test.mjs test/functions/rt-room.test.mjs`、`node test/smoke.mjs`。
鐵律不變：養成數值只掛真實學習量，不改晶能經濟。

## G1. 四科精靈進化 20 階美術槽（接圖）
主線程已生成 `assets/battle/sprite-{subject}-s{n}.png`（subject ∈ nature/biology/chemphys/earth，n=1..5）。
- 在 `js/battle.js` 的**科學夥伴渲染**（`companionForSubject` 那條路徑，約 line 201-215 的 `bat-companion-face`／`assistTag`）把 emoji 換成 `<img src="assets/battle/sprite-${subjectKey}-s${level}.png" ...>` ＋ **emoji fallback**（抄 F 波 foe/cub 的 `onerror` 寫法）。level = 該精靈階（1..5）。
- **通用夥伴** `companionFor`（無 subjectKey，COMPANION_TIERS 🥚🐣🦉🐉✨）維持 emoji，不接圖。
- 缺圖 onerror → 既有各階 emoji。smoke 既有對戰/夥伴檢查需仍綠。

## G2. 老師／家長輕量匯出（無後端，白帽）
在弱點頁或設定區加一顆「📋 給老師/家長看」按鈕，點擊彈出摘要（可複製純文字）：
- 各科精通詞卡數、各科近 30 題正確率（複用 `accuracyBySubject`）、前十弱點詞（複用弱點聚合）。
- 純文字 summary + 「複製」按鈕即可；QR 非必要（要做就用自帶的小型 canvas QR，禁外部 CDN/lib）。
- 不觸及後端、不需帳號。加純函式測試：給定 state 產出的 summary 含精通數/正確率/弱點詞。

## G3. 家長說明頁「這站在教什麼、家長怎麼陪」
首頁可進入的靜態說明頁/彈窗，內容（繁中）：這站練什麼（國小自然＋國中生物/理化/地科需背需記的）、
養成怎麼掛真實學習（精通=間隔複習答對、不是點擊次數）、家長可以怎麼陪（看弱點頁、用匯出摘要）。
不要行銷腔，教師對家長的口吻。smoke 加：說明頁入口可開。

## G4. 訪客計數器（index.html 無 CSP，直接加）
- 可見徽章：`<img src="https://visitor-badge.laobi.icu/badge?page_id=hk6429.science-hero" alt="訪客數">`（放頁尾）。
- 幕後分析：GoatCounter，頁尾加
  `<script data-goatcounter="https://hk6429.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`
- 不影響既有版面與 smoke（smoke 對外網 request 會 404/擋，比照既有白名單處理：徽章網域的 request 失敗不得讓 smoke FAIL——若 smoke 因此噴 console error，把該網域加進 smoke 的 response/console 白名單）。

## 驗收
validate 1001＋全測試綠＋smoke 全綠。逐項回報 G1-G4 改哪個檔、加哪條測試。沙盒只寫母版，別碰 ~/projects。
