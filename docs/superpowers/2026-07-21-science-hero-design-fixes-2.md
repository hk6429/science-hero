# 科學英雄 — 設計專家收尾第二批（E1–E5，純程式軌）

延續 D1–D13，補上設計審查中未收的項目。純前端 vanilla JS（`<script>` IIFE），無框架無 build。
E4（介面圖示美術）由主線程另走生圖產線，**不在本規格內**，你不要動任何圖片/assets。

改完三者全綠：`node scripts/validate-all.mjs`、
`node --test test/logic.test.mjs test/functions/*.test.mjs`、`node test/smoke.mjs`。
鐵律：養成數值只掛真實學習量、不改晶能經濟；既有測試不可退步（目前 110 綠、validate 1001、smoke 全綠）。
沙盒只寫母版，別碰 ~/projects。

---

## E1. 四科「自然」分頁色拉開與品牌綠的撞色（視覺專家 #3）
現況：`css/style.css` `--sci-nature: #2f9e44` 與品牌 `--green: #1f9d55` RGB 距離僅 23，切到自然分頁時主題色與站台基礎綠幾乎分不出來。
- 改 `--sci-nature` 到一個明顯區隔品牌綠、且與其他三科（生物 teal #0d9488／理化橙 #e8590c／地科藍 #4263eb）都夠分得開的色。建議往**黃綠/嫩芽綠**位移，例如 `#66a80f`（橄欖黃綠）或 `#74b816`，自行取一個對白底文字對比仍達 AA（≥4.5:1，因為它會當 `nav.tabs button.active` 的文字色，見 174 行）的值——**務必實算對比**，太亮的黃綠當文字色會不足，必要時取稍深版。
- 只動這一個 token，四科主題化選擇器（174/193/198/203/553/775 等）自動連動，不要逐條改。
- 驗：四科 active 分頁文字色兩兩可辨；nature 文字對比 ≥4.5:1（在回報附上實算值）。

## E2. header 建立單一主線、其餘降級（UX 專家 #5）
現況：`index.html` header 三個平行 `hero-stat`（🔥連續天數／⭐戰功／見習生段位）並列同權重，新手不知哪個是核心目標。
- **不要刪功能**，改視覺層級：把「⭐ 戰功（mastered-count，＝真實精通量，核心指標）」設為主，字級/權重明顯大於另兩個；「🔥 連續天數」與「見習生段位」降為次級小字（同一列右側或下方小字）。
- 「今日目標」進度條維持在 header、是「現在該做什麼」的主 CTA，確保它視覺上不被 hero-stats 蓋過。
- 純 CSS（可加一個 `.hero-stat--primary` class 與對應樣式）＋ index.html 給戰功那顆加 class；JS 若有重建 hero-stats 的地方一併帶上。不改數值邏輯。
- 驗：smoke 既有 header 檢查不得壞；戰功顆有 `hero-stat--primary`。

## E3. 精簡模式列（UX 專家補充，次要）
現況：每張學習卡上方 mode-switch 五顆（閃卡/自測/對戰/弱點/連線對戰）＋單元 chips＋年級 chips 疊在首屏。
- 把「連線對戰」從主 mode 列收進次選單（例如移到 `#more-tools` 摺疊、或 mode 列旁一顆「更多」）。主 mode 列留四顆（閃卡/自測/對戰/弱點）。
- 連線對戰既有進入邏輯與 smoke 對它的檢查要照樣可達（smoke 目前驗「連線對戰入口存在、離線降級正常」——入口改位置後 smoke 要同步更新選擇器並維持綠）。
- 驗：主 mode 列 ≤4 顆；連線對戰仍可進入；smoke 綠。

## E5. 裝飾小字下限補齊（視覺/RWD 專家，D2 只做了兩個）
現況：D2 已把 `.unit-chip-label`、`.bat-locknote` 抬到 0.72rem，但 `.sb-plaque`（clamp 下限 ~.48rem≈7.7px）等裝飾字仍偏小。
- 把 `.sb-plaque` 及其他 clamp 下限 <0.6rem 的功能性/裝飾字，下限抬到 ≥0.6rem（純裝飾）或 0.72rem（帶資訊）。掃一遍 `css/style.css` 所有 `font-size` 含 `clamp(` 或 ≤0.65rem 的規則，逐一評估抬高。
- 驗：無功能性文字 <0.72rem、無裝飾文字 <0.6rem；smoke/畫面不壞。

---

## 驗收
validate 1001＋測試 ≥110 綠＋smoke 全綠。逐項回報 E1-E5 改哪個檔、E1 的 nature 新色與實算對比、E3 連線對戰移到哪。
