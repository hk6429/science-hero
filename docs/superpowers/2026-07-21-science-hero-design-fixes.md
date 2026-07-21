# 科學英雄 — 網站設計專家組修正（D1–D13）

四位設計專家（視覺 6.5／UX 7／RWD 7／a11y 5.5）審查後的修正。純前端 vanilla JS（`<script>` IIFE），
無框架無 build，老師要能直接改 CSS/JSON。**不要導入 Tailwind/React/設計系統套件。**

改完三者全綠：`node scripts/validate-all.mjs`、
`node --test test/logic.test.mjs test/functions/*.test.mjs`、`node test/smoke.mjs`。
能寫純函式測試的（D6/D7/D11 的 JS 邏輯）就寫 TDD；CSS/a11y 屬性層由 smoke + 靜態檢查驗。
鐵律不變：養成數值只掛真實學習量，不改晶能經濟；既有測試不可退步。

---

## 🔴 交叉命中（多位專家點名，最優先）

### D1. 解除禁縮放（RWD＋a11y 硬傷，改一個字）
`index.html:5` 現為 `content="width=device-width, initial-scale=1, maximum-scale=1"`。
刪掉 `, maximum-scale=1`，只留 `width=device-width, initial-scale=1`。違反 WCAG 1.4.4，低視力學生放大不了。
smoke 加：viewport meta 不含 `maximum-scale`。

### D2. 小字灰字對比拉過 AA（視覺＋RWD＋a11y）
`css/style.css` `:root` 的 `--muted: #6b7d72`（白底約 4.0–4.3:1，小字未達 4.5:1）→ 壓深到 `#566b5e`（或更深，自行取到 ≥4.5:1）。
另把功能性小字下限抬到 `0.72rem`：至少 `.unit-chip-label`(~509)、`.bat-locknote`(~688)。裝飾字（`.sb-plaque` clamp）下限提到 `.6rem`。

---

## 🟠 視覺設計

### D3. 補上未定義的 `--primary`（render bug）
`.new-player-guide`(~1014) 與 `.sb-rank-badge.is-lit`(~1021) 用了 `var(--primary)`，但 `:root` 從未定義 → fallback 失效、外框/光暈沒渲染。
在 `:root` 加 `--primary: var(--green);`（一行）。

### D4. 硬寫綠收斂回 token
全站硬寫的 `#2e9e5b`→`var(--green)`、`#174d2d`／`#176b39`→`var(--green-dark)`（散在科學基地/市集/連線對戰，約 833/876/881/1000 等）。
目視「兩種綠」色差消失。改完 smoke/畫面不得壞。

### D5. 四個彈窗抽共用 base（`.info-overlay`/`.base-overlay`/`.fusion-overlay`/`.mkt-overlay`）
四者各自定義遮罩透明度/圓角/邊框/標題列。抽一個共用 `.sh-overlay`（遮罩 + panel 圓角 + head 基底），各 overlay 只留主題色覆寫，去除重複。
純 CSS 重構，視覺與 smoke 不得變。**若判斷風險過高可降級為「只統一遮罩透明度與 panel 圓角」，但要在回報說明。**

---

## 🟠 UX 資訊架構

### D6. 新手不要展開「更多功能」（TDD）
`js/app.js:811` `if (moreTools) moreTools.open = !isNew;` → 新手（isNew=true）反而把六顆進階工具全展開。
改成永遠 `false`（`moreTools.open = false`）。新手有新手卡就夠。
若 onboarding 有可抽出的純函式，加測試斷言「新使用者狀態下 moreTools 預設關」；否則於 smoke 驗「首次載入 #more-tools 未 open」。

### D7. 閃卡／自測「今天先這樣」死路補 CTA（TDD）
`js/app.js:444` 與 `:549` 按「今天先這樣」後只剩一張純文字卡、無任何按鈕 → dead end。
在該收尾卡加一排 CTA：`看今日弱點`（進 mode='weak'）／`換一科`／`再練一輪`（重啟該回合），複用既有函式，別新寫邏輯。
smoke 加：閃卡按「今天先這樣」後，收尾卡至少有 1 顆可點按鈕，點「再練一輪」能回到出題。

### D8. 「科學基地」拉出摺疊當常駐入口
`index.html` 現把「🏕️ 科學基地」和「匯出進度」一起塞進預設收合的 `<details>更多功能</details>`（~L43-51）。
把「科學基地」入口移到分頁 nav 同層（或 hero 區）當常駐鈕；`<details>` summary 由「更多功能」改成具體字眼「基地・市集・融合坊」。只搬 DOM 位置＋改文字，不動邏輯。基地既有開啟事件要照樣綁到新位置。

### D9. 進站預設科目對齊第一分頁
`js/app.js:61` `let activeSubject = 'biology';` → 第一分頁是「國小自然」卻預設國中生物。
改預設 `'nature'`。既有 `?subject=` 參數優先權不變（有帶參數仍以參數為準）。

---

## 🟠 行動版 RWD

### D10. 觸控目標補到 44px
- 四個彈窗關閉 ✕（`.info-head button`~126／`.fusion-head button`~934／`.mkt-head button`~980，現約 19px）：加 `min-width:44px; min-height:44px; display:grid; place-items:center;`
- 小按鈕/晶片抬高：`.io-btn`(~90) padding→`11px 16px`、`.grade-chip`(~300) padding→`9px 14px`、`.grade-filter` gap→`8px`、`.btn-weak-practice`(~638) padding→`10px 14px`、`.base-tool-btn`(~833) 比照。

### D11. 連線碼窄手機溢出
`.rt-code`(~868) `font-size:3rem; letter-spacing:.3em` 在 360–390px 會撐出水平捲軸。
改 `font-size: clamp(1.8rem, 10vw, 3rem); letter-spacing:.2em; word-break: break-all;`。
若有純函式不涉及則免測試，smoke 驗連線對戰頁不產生 `document.documentElement.scrollWidth > innerWidth`（在 375px viewport）。

---

## 🟠 無障礙 a11y

### D12. 全域可見焦點 + 分頁 aria-selected
- `css/style.css` 全站無 `:focus-visible`。加：
  `:focus-visible { outline: 3px solid var(--green-dark); outline-offset: 2px; border-radius: 4px; }`
- 分頁 `nav.tabs` 按鈕（`js/app.js:143-153`）目前選中只靠顏色。加 `role="tab"` 與 `aria-selected="true/false"`（父層可加 `role="tablist"`）。色盲學生同時受益。
smoke 加：Tab 到按鈕有可見 outline（可驗 computed outline-style≠none on :focus-visible 難測，改驗 CSS 含 `:focus-visible` 規則 + active 分頁 `aria-selected="true"`）。

### D13. 焦點管理 + reduced-motion + 答題結果報讀
- **焦點 trap**：家長說明頁(`app.js:1210`)／學習摘要(`:668`)／融合坊(`:1168`) 三個 overlay 現在只 `hidden=false`，無 Esc/移焦點/還原。把 `base-ui.js:218-231` 那套（記 prevFocus→移焦點進 panel→Escape 關→關閉還原 prevFocus）抽成共用小函式（放 app.js 或新 util），套上這三個。
- **reduced-motion**：`css/style.css` 尾端加
  `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; } }`
- **答題結果報讀**：`js/app.js:591` 附近的答對/答錯 banner 沒有 aria-live → 給該結果容器 `role="status" aria-live="polite"`（對戰 bat-log 已有，統一標準）。
smoke 加：三個彈窗開啟後 Esc 可關；CSS 含 `prefers-reduced-motion`；答題結果容器有 `aria-live`。

---

## 驗收
validate 1001＋全測試綠（logic+functions 至少維持 107，D6/D7 新增）＋smoke 全綠（含 D1/D7/D12/D13 新檢查）。
逐項回報 D1-D13 改哪個檔、加哪條測試、D5 有無降級。沙盒只寫母版，別碰 ~/projects。
