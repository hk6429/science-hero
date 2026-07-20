# 科學英雄（science-hero）

國小自然、國中生物、國中理化、國中地科背誦知識點練功站，仿字鬥英雄產線
（見 `vocab-game-pipeline` skill）。四科共用閃卡 SRS、自我測驗與弱點聚合模組，
每科維持獨立 JSON 資料集，方便教師抽換或校訂內容。

## 本機預覽

```bash
cd 科學英雄
python3 -m http.server 8080
# 開啟 http://localhost:8080
```

## 資料管線

```bash
node scripts/merge.mjs         # 合併生物原始 shards（生物打樣輪保留）
node scripts/validate.mjs      # 驗證生物資料
node scripts/validate-all.mjs  # 四科 schema、內容邏輯與跨科 id 驗證
```

## 測試

```bash
node --test test/logic.test.mjs

# smoke.mjs 需要本機有 playwright-core（含快取 chromium）。若沒裝過，
# 可先臨時借用其他專案的 node_modules（例如 english-hero-island）：
#   ln -s ../working-copy/english-hero-island/node_modules/playwright-core node_modules/playwright-core
node test/smoke.mjs
```

## 目前範圍

- ✅ 國小自然／國中生物／國中理化／國中地科：各科資料層 + 閃卡 SRS + 自測（四選一）+ 弱點聚合
- 🚧 對戰引擎、寵物/城邦養成層：待使用者確認是否需要後才開工
- 🚧 三平台正式部署：待使用者確認內容校對通過後才進行
