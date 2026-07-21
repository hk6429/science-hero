# 科學英雄 — 雙審查團修正計畫（玩家組 6.5／教育組 8.0）

兩組審查（資深玩家＋教育專家）合議後的修正清單。**用 TDD**：每個邏輯修正先寫失敗測試再讓它過。
純前端 vanilla JS（`<script>` IIFE，非 ES module），測試 `test/logic.test.mjs`＋`test/functions/`＋`test/smoke.mjs`。
資料驗證 `scripts/validate-all.mjs`。改完三者全綠才算完工：`node scripts/validate-all.mjs`、
`node --test test/logic.test.mjs test/functions/fake-d1.test.mjs test/functions/kv-shim.test.mjs test/functions/rt-live.test.mjs test/functions/rt-room.test.mjs`、`node test/smoke.mjs`。

**鐵律**：養成數值只掛真實學習量（答對／精通），不得掛點擊次數。任何改動不得破壞這條。

---

## P0 — 必修

### F1. 精通間隔把關（修「假性精熟」，教育組最高優先）
現況：間隔複習只在閃卡生效（`flashcard.js getRoundQueue` 濾 `due>now`）；但**自測**（`app.js startQuizRound`）與**對戰**（`battle.js` 抽題）答對直接 `recordAnswer→bumpBox`，不看 due → 學生把單元篩到十幾張連刷可**同一天** box 0→4 精通，繞過 SRS。
- 改 `app.js recordAnswer`（約 line 358）：答對時若該卡 `due > now`（尚未到複習期），**只記 weakLog／正確率統計，不推進 box**（不 bumpBox、不因此升精通）。閃卡模式維持原本 due 佇列邏輯不受影響。
- 效果：一張卡 0→4 精通至少橫跨數日（Leitner 間隔），恢復長期記憶意義。晶能仍照答對發（不改經濟），只是「精通」這個成長指標不再能單場刷出。
- **失敗測試**：同一天對同一張卡連續答對 4 次，斷言 box 不得達到 4（跨日答對才推進）。

### F2. 台灣用語修正＋守門
- `data/physics-chemistry.json` `pc0138`「超聲波」→「超音波」（含 def 內文全部出現處）。
- `scripts/validate-all.mjs` 增補「中國用語黑名單」守門（至少：超聲波、光標、鼠標、激光、視頻、屏幕、缺省、內存），命中即 FAIL 並印出題號。加對應測試。

### F3. PvE 威脅曲線（玩家組 P0，但**不得加答題時間壓力**以免誘導亂猜）
現況 `battle.js`：玩家傷害 `12+combo*3` 滾雪球、敵人傷害寫死 `8+round(acc*8)`、連擊只有答錯才斷 → 複習過的四選一幾乎不連錯，低階怪穩輸、零張力。
- 敵人傷害改為**隨回合遞增**：如 `baseDmg + floor(round/ N) * tierFactor`（tier 越高成長越快），讓宗師級在玩家亂答 2 題時能翻盤。
- 高階（高手／宗師）怪加「每 3 回合大招」（該回合傷害加倍或附加固定重擊）。
- **只調傷害曲線，不縮短玩家答題時間、不加倒數逼答**（教育組：避免為速勝亂猜）。
- 失敗測試：同一場 round=1 與 round=9 敵人傷害，斷言遞增；宗師怪第 3 回合大招傷害 > 平常回合。

### F4. 對戰節奏與打擊感（玩家組 P0，純 UX）
- `battle.js` 三段延遲 700/1000/1200ms → 300/400/500ms。
- `css/style.css`：`.bat-hp-fill` 加 `transition: width .3s`；新增傷害跳字 `@keyframes`（受擊時 `-N` 飄字淡出）。
- smoke 既有血條檢查需仍綠。

### F5. 新手主線動線（玩家組 P0）
首次進站（`state.stats.totalReviews === 0`）在首屏 header 下渲染「▶ 今天從這裡開始」引導卡：閃卡 5 張 → 自測一輪 → 挑戰見習研究員，單線可跳轉。底部 6 顆功能鈕（市集/基地/融合/戰績卡/匯出/匯入）首次進站先摺進「更多」摺疊區。老手（有進度）維持現狀。smoke 加：首次進站看得到引導卡。

---

## P1 — 該做

### F6. 年級標籤對齊實際授課年段（教育組）
現況生物標 G8/G9、地科標 G8，但實際 7 生物／8 理化／9 理化＋地科。
- `data/biology.json` 全改標 **G7**；`data/earth-science.json` geology/weather/ocean 相關改標 **G9**；理化 G8/G9 維持。
- 確認 `app.js` gradeFilter 分桶與 `validate-all.mjs` 年級集合仍通過；跨科 id 唯一性不受影響。
- 若某題資料實在不宜挪動年段，維持原樣並在 commit 說明；優先讓 validate＋全測試綠。

### F7. 僥倖猜對訊號（教育組）
`weak.js` 現況 `guessed` 只在答錯時記（`!correct && elapsedMs<1500`）。
- 擴展：答對但 `elapsedMs < 800` 且該卡 seen 次數少 → 記一個 `luckyGuess` 弱標（不阻止發晶能，但讓弱點診斷／精熟品質看得到）。加測試。

### F8. 弱點頁露出各科正確率（教育組）
`accuracyBySubject`（目前只用於融合門檻）在 `renderWeak`（`app.js` 約 646）頂端露出「本科近 30 題正確率 X%」。

### F9. 閃卡也餵診斷（教育組）
閃卡自評結果寫入 `weakLog`（`source:'flash'`、**不發晶能**），使只練閃卡的學生也生得出弱點地圖與融合正確率。不因此推進 box（box 仍走 F1 的 due 邏輯）。

### F10. 每日任務填 Leitner 跨天空檔（玩家組 P1）
header `daily-goal` 旁擴充 3 條每日任務（今日答對 10 題／打贏 1 場／推進 1 單元進度），完成給晶能（走既有 `state.stats.dailyReviews` 等現成計數，仍受每日晶能上限 100）。給「今天還能推進什麼」的短期目標。加測試：任務完成判定。

### F11. 即時對戰對手動態（玩家組 P1）
`rtbattle-ui.js tick()` 已同步 `opp.state.correct`，只是沒呈現。HUD 補顯示對手「答對第 N 題／連擊中」，對方答對時我方閃一下受擊。

### F12. PvE 戰功結算條（玩家組 P2→併入）
PvE 勝利結算加「本場連擊數／總輸出／最高傷害」列表，滿足看數字成長。

### F13. 段位徽章牆（玩家組 P2→併入）
`RANKS`（銅→傳奇）＋賽季稱號做成可點亮徽章牆，放進基地成就牆／段位頁。

---

## P1（美術槽位，配合主線程生圖）
主線程另行生成 14 張優先插畫（6 稚靈＋8 守護者），沿用科學基地扁平插畫風。**你只需在程式加 `<img>` 槽＋emoji fallback**（抄 `base-ui.js` 的 `fallback()` 寫法），圖檔由主線程放入：

- 守護者：`assets/battle/foe-{id}.png`，id ∈ apprentice/alchemist/ecologist/engineer/geomancer/geneticist/astromancer/elementalist。render 於對手選單卡與對戰畫面（`battle.js` 約 line 241、299），broken/缺圖 `onerror` → 既有 emoji。
- 稚靈：`assets/fusion/cub-{id}.png`，id ∈ forestdeer/crystalfox/windhawk/alchemydragon/deepwhale/starcore（對應 `cub_forestdeer` 等，檔名去底線）。render 於融合坊稚靈卡／隨行顯示（`fusion-store.js` 消費端 UI）＋對戰追擊顯示。
- **四科精靈進化 20 階（sprite-{subject}-s1..5）暫不接**，主線程第二波再補；本次程式只需先讓 foe/cub 兩類 img 槽就位，evolution 維持 emoji。

---

## 不做／維持（避免過度工程）
- 不加後端帳號、不做跨裝置班級儀表板（維持純前端白帽）；教育組 P2 的「老師/家長匯出」改為輕量：可延後，本輪不強制。
- 不縮短答題時間、不加答題倒數。
- 不改晶能經濟公式（每日上限 100、PvP 不發幣、失敗退半）。

## 驗收
- validate 1001 筆過（新增中國用語守門）＋全單元/Functions 測試綠＋smoke 全綠（含新增引導卡檢查）。
- 逐項對照本清單回報：改了哪個檔、加了哪條測試、測試前後數字。
