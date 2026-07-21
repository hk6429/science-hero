# 科學英雄精靈融合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在科學英雄（母版 `naicheng-claude-agent/科學英雄`、部署副本 `~/projects/science-hero`）新增「精靈融合」子系統：先把現有的單一科學夥伴擴展為**四科各一隻精靈**（各綁該科精通卡數，沿用 `companionFor` 純函式手法），再讓兩科滿階精靈融合出**稚靈**（四科兩兩配對恰好 6 隻封頂）。雙親精靈永不消耗；晶能（`SciEconomy`）承擔融合成本；20% 失敗只扣晶能＋安慰台詞＋返還一半晶能，精靈與學習進度完全不受影響；配方揭曉解謎（答對雙科隱藏題才見稚靈真身）、稚靈可隨行出戰（走既有 companion assist 通道疊加）、暱稱從預設詞庫組合、稚靈名片 canvas 分享卡。**純前端，不碰後端／SHAPI／D1。**

**Architecture:** 沿用科學英雄既有慣例——**`<script>` IIFE 全域掛載，不是 ES module**。新增 `js/fusion-store.js`（`const SciFusionStore = (() => {...})();`，key `sci_fusion` 的獨立存檔＋所有可單元測試的純函式）；四科精靈擴展改在既有 `js/battle.js`（加 `SUBJECT_LINES`／`companionForSubject`，不改 `calcDamage`／`mount` 對外簽名）；融合 UI（融合坊 overlay＋稚靈名片 canvas）加在 `js/app.js` 內（沿用現站「app.js 一手包 UI」的結構，不另開 UI 檔）。晶能收支只走 `SciEconomy`（`js/economy.js`，由「科學基地」計畫建立；本計畫只 **Consumes**，若基地計畫尚未執行則走內建 stub，見 Global Constraints）。

**Tech Stack:** Vanilla JS `<script>` IIFE、localStorage（`sci_fusion` 一把鑰匙，讀寫全包 try/catch）、`node --test test/logic.test.mjs`（vm 串接 harness，比照既有寫法）、`node test/smoke.mjs`（playwright-core）、Canvas 2D 名片。

## Global Constraints

- **模組慣例＝`<script>` IIFE 全域掛載，不是 ES module**：新模組一律 `const SciXxx = (() => { ... return {...}; })();` 放 `js/` 平層；`index.html` 依相依序加 `<script>` 標籤（見 Task 2 / Task 9）。**不得**使用 `import` / `export`。
- **單元測試沿用 vm 串接 harness**：`test/logic.test.mjs` 把多支 `<script>` 檔案串成一支 script 跑進 `vm.createContext`，用 `globalThis.__exports = { ... }` 取出（見該檔第 16–35 行）。本計畫要把 `js/economy.js`（或其 stub）、`js/fusion-store.js` 加進 `makeSandbox` 的載入清單，並把 `SciEconomy`、`SciFusionStore` 加進 `__exports`。**每個 Task 先寫失敗測試 → 跑一次確認紅 → 最小實作 → 跑到綠**。
- **雙親精靈永不消耗**（硬性規則，沿用字鬥英雄 P3-11 教訓）：融合成功或失敗，四科精靈原樣保留（它們本就只是 `state.cards` 的純函式推導，不存任何可被扣除的數值）。稚靈是**新增收藏**（`sci_fusion.hatched`），不是升級替代。
- **失敗只扣晶能、返還一半**（時間成本型損失規避，白帽原則）：`state.cards`／精通進度／`weakLog` 全部不受影響；失敗給安慰台詞＋返還 `floor(FUSE_COST/2)` 晶能。搭配每日融合次數上限，把失敗代價轉成「多練幾天」的時間成本，而非懲罰。
- **養成數值 100% 掛真實學習量**：精靈階級＝該科精通卡數；融合資格＝兩科精通 ≥100 ＋兩科近期正確率 ≥80%。**不掛操作次數**。
- **純前端**：不新增 `SHAPI`／D1／`functions/`；`sci_fusion` 全跑 localStorage。晶能經濟不由本計畫實作（`SciEconomy` 屬「科學基地」計畫），本計畫只呼叫其 `spendCrystals`／`earnCrystals`。
- **`SciEconomy` stub 策略**（基地計畫尚未執行時不阻塞開發／測試）：`fusion-store.js` 內以 `const Econ = (typeof SciEconomy !== 'undefined' && SciEconomy.spendCrystals) ? SciEconomy : __econStub;` 取用；`__econStub` 是同檔內建的極簡 IIFE，直接讀寫 `localStorage['sci_econ']`（`{balance,earnedToday,earnedDate}`），實作 `getBalance()`／`spendCrystals(n)`／`earnCrystals(n,reason)`，介面與基地計畫的 `SciEconomy` 對齊。基地計畫上線後，全域 `SciEconomy` 存在即自動接管，stub 不再被取用（**不刪 stub**，保留為離線保險）。
- **不動既有函式簽名**：`SciQuiz.buildQuestion`／`SciFlashcard.*`／`SciWeak.*`／`SciBattle.calcDamage`／`SciBattle.mount` 的對外行為不改。Task 1 只在 `battle.js` **新增** `SUBJECT_LINES`／`companionForSubject`／`masteredBySubject` 並讓 `mount` 顯示當前科精靈（相容擴充），不移除 `COMPANION_TIERS`／`companionFor`（既有 13 條 logic 測試仍須全綠）。
- **繁中台灣用語**：所有台詞、UI 文案、註解一律繁體中文台灣用語。
- **美術先佔位**：稚靈與精靈終階先用 emoji 上線（現站本就是 emoji 風），實體立繪另批 codex exec 生圖後換裝，開發不阻塞。生圖清單見文末。

## 事前必讀（實作者請先掃過這幾段原始碼）

| 檔案 / 段落 | 看什麼 |
|---|---|
| `js/store.js` 全檔 | `SciStore` key `science-hero:v1`、`load/save/getCard/setCard/todayStr`；`state.cards[id]={box,due,seen,wrong}`、`state.stats`、`state.weakLog`。**融合狀態另存 `sci_fusion`，不塞進 `science-hero:v1`** |
| `js/battle.js` 86–102 行 | `COMPANION_TIERS`（五階 `at` 門檻 0/5/20/50/100、`atk/leech/leechChance`）、`companionFor(masteredCount)` 純函式推導手法——四科精靈完全比照 |
| `js/battle.js` 119–290 行 `mount` | `ctx = { pool, state, subjectLabel, recordAnswer, masteredCardCount }`；`companionCard()`／`assistTag()`／`onAnswer` 裡 companion 追擊＋機率回血的實作路徑（Task 1 改此處顯示當前科精靈、Task 7 在其後疊加稚靈第二段追擊） |
| `js/app.js` 130–134 行 `currentPool` | 分頁/單元/年級篩選後的唯一濾字點 |
| `js/app.js` 324–345 行 | `renderBattle` 怎麼把 `masteredCardCount()` 灌進 `SciBattle.mount`；`recordAnswer(target, correct, elapsedMs)` 是唯一答題記錄出口 |
| `js/app.js` 3–8 / 693–696 行 | `SUBJECTS`（key `nature/biology/chemphys/earth`）、`masteredCardCount()`＝`state.cards` 中 `box>=maxBox` 的卡數；`maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1`（＝4） |
| `js/weak.js` 全檔 | `SciWeak.recordAnswer` **每次作答都 push**（含答對），entry `{termId,unit,correct,guessed,t}`，只留最近 300 筆——融合的「近期正確率」就從這裡 derive |
| `js/quiz.js` 全檔 | `SciQuiz.buildQuestion(target, pool)` 四選一——配方揭曉隱藏題直接複用，不自造出題器 |
| `test/logic.test.mjs` 16–35 行 | vm 串接 harness＋`makeSandbox` 載入清單＋`__exports`（Task 2 起要擴充） |
| `test/smoke.mjs` 68–101 行 | 對戰分頁的 playwright 冒煙寫法（Task 9 加融合坊步驟照此模式） |
| `data/*.json` | 詞條 id 前綴：`elementary.json`＝`e`（nature）、`biology.json`＝`b`、`physics-chemistry.json`＝`pc`（chemphys）、`earth-science.json`＝`d`（earth）；欄位含選配 `advanced:true`（**biology 6、physics-chemistry 7、earth-science 3、elementary 0 筆**——見 Task 6 nature 的 fallback） |

## 資料形狀（一次定清楚，所有 Task 共用）

**`sci_fusion`（獨立 localStorage key，`SciFusionStore.load/save` 讀寫）：**

```js
{
  v: 1,
  hatched: [],        // 已孵化稚靈 id 陣列，如 ['cub_forestdeer']（依孵化順序）
  nicknames: {},      // { [cubId]: '暱稱' }（預設詞庫組合，非自由輸入）
  revealed: [],       // 已揭曉配方的 pairKey 陣列，如 ['nature+biology']
  failStreak: 0,      // 連續融合失敗次數（僅用於安慰台詞挑選，不影響機率——無 pity）
  lastFuseDate: '',   // 最近一次「嘗試融合」的日期 YYYY-MM-DD
  fuseCount: 0,       // 【擴充欄位】lastFuseDate 當日已嘗試融合次數，跨日隨 lastFuseDate 重置——每日上限需要它
  activeCub: '',      // 【擴充欄位】隨行出戰的稚靈 id（''＝無）
}
```

> **兩個擴充欄位的說明（避免被誤判違規）**：設計規格給的骨架是 `{v,hatched,nicknames,revealed,failStreak,lastFuseDate}`；Task 5 的「每日融合次數上限」與 Task 7 的「稚靈隨行出戰」是規格明列的功能，各需一個持久欄位（`fuseCount`／`activeCub`），故在骨架上補這兩欄。`load()` 對舊存檔缺欄位一律補預設值（見 Task 2）。除此二欄外不再擴張。

**晶能（`SciEconomy`，key `sci_econ`，由科學基地計畫建立；本計畫只讀寫其 API）：** `getBalance()` → number；`spendCrystals(n)` → `{ok, balance}`；`earnCrystals(n, reason)` → `{earned, balance}`。stub 版行為相同（見 Global Constraints）。

**設計決策（先講明，避免實作時猜）：**

1. **per-subject 精通卡數的計算**：`state.cards` 是 `{id:{box,...}}`，id 前綴決定科別（`e/b/pc/d`）。`subjectOfId(id)` 用正則 `^([a-z]+)` 取字母前綴，對照 `PREFIX_SUBJECT = { e:'nature', b:'biology', pc:'chemphys', d:'earth' }`。`masteredBySubject(state, maxBox)` 掃一遍 `state.cards`，回 `{nature,biology,chemphys,earth}` 四個 `box>=maxBox` 計數。`maxBox` 由呼叫端傳入（＝`SciFlashcard.BOX_INTERVAL_DAYS.length-1`），純函式不依賴全域。
2. **「近期正確率」的視窗與計算式**：`state.weakLog` 每筆答題都有（含答對），但混四科。`accuracyBySubject(state, subjectKey, {window:ACC_WINDOW, minSample:ACC_MIN_SAMPLE})`：先用 `subjectOfId(entry.termId)` 濾出該科的 entry，取**最近 `ACC_WINDOW=30` 筆**，`total` 為筆數、`accuracy = 該窗內 correct 數 / total`；`total < ACC_MIN_SAMPLE(=15)` 一律視同未達標（避免 3 題 100% 就過關）。不另建滾動時間窗（Karpathy 簡潔原則）。
3. **融合資格門檻**：`canFuse(meta, state, subjA, subjB)`（`meta = { maxBox }`）四道檢查——(a) `subjA !== subjB`；(b) 兩科精通 ≥`MASTER_GATE(=100)`；(c) 兩科各自 `accuracyBySubject` 達標；(d) 該配對稚靈尚未孵化。回 `{ok, reasons:[]}`，`reasons` 收未通過的原因碼字串。
4. **雙親不消耗＝結構上不可能被扣**：精靈是 `state.cards` 的純函式投影，`fuse()` 全程只讀 `state`、只寫 `sci_fusion` 與晶能，**不寫 `state.cards`**（自我檢查用 grep 驗證）。
5. **成功機率 80%／失敗 20%**：`fuse()` 吃 `{ rng = Math.random }`，測試注入定值；失敗不設 pity，靠低成本＋每日上限自然節流。`failStreak` 只用來讓安慰台詞更貼近（連敗換句話），不改機率。
6. **稚靈戰鬥加成走既有 companion assist 通道**：`mount` 的 `onAnswer` 在科精靈追擊之後，再疊加隨行稚靈的**第二段小額追擊**（見 Task 7 數值與上限）。稚靈不改 `calcDamage`、不記段位分。

## 稚靈全庫（6 隻，寫死在 fusion-store.js 常數 `CUBS`）

四科 key 依 `SUBJECTS` 順序 `nature < biology < chemphys < earth` 排序組 `pairKey`（`sortedA+'+'+sortedB`），四科兩兩＝C(4,2)＝6 隻封頂：

| id | 名 | emoji | 雙親（pairKey） | 一句設定文案（bornLine） |
|---|---|---|---|---|
| `cub_forestdeer` | 森靈鹿 | 🦌 | `nature+biology` | 苔綠鹿角上棲著整片生態系，牠一踏步，荒地便冒出新芽。 |
| `cub_crystalfox` | 晶石狐 | 🦊 | `nature+chemphys` | 尾尖凝著會變色的結晶，牠嗅得出每一次反應該往哪走。 |
| `cub_windhawk` | 風嵐鷹 | 🦅 | `nature+earth` | 乘著季風巡遊高空，牠的翅膀讀得懂雲、也讀得懂地層。 |
| `cub_alchemydragon` | 煉金龍 | 🐉 | `biology+chemphys` | 體內流著會呼吸的化學反應，一吐息就是一場生命與元素的交換。 |
| `cub_deepwhale` | 深海鯨 | 🐋 | `biology+earth` | 潛行於洋流最深處，牠的歌聲同時是生命的脈動與地球的心跳。 |
| `cub_starcore` | 星核獸 | 🌟 | `chemphys+earth` | 胸口嵌著一顆微型恆星，把物質的規律與星空的尺度收進同一副身軀。 |

融合前 UI **不顯示**下一隻是誰（剪影＋「？？？」），答對該配對的隱藏題（配方揭曉，Task 6）後才顯示名字、emoji 與設定文案——未知性的核心。

## 四科精靈進化線（20 階，寫死在 battle.js 常數 `SUBJECT_LINES`）

沿用 `COMPANION_TIERS` 的門檻 `at` 0/5/20/50/100（`atk/leech/leechChance` 也沿用同一組數值，只換名字與 emoji），每科一條五階線：

| 科別（key） | Lv1 (at0) | Lv2 (at5) | Lv3 (at20) | Lv4 (at50) | Lv5 (at100) |
|---|---|---|---|---|---|
| 自然 nature | 🌰 萌芽種子 | 🌱 新芽綠靈 | 🌿 藤蔓精靈 | 🌳 巨木守衛 | 🍀 萬物之靈 |
| 生物 biology | 🥚 細胞原卵 | 🐛 幼蟲之靈 | 🦋 蝶翼精靈 | 🦉 智慧之鴞 | 🧬 生命之靈 |
| 理化 chemphys | ⚗️ 燒瓶精靈 | 🧪 試管之靈 | 🔥 焰晶精靈 | ⚡ 電光之靈 | ⚛️ 元素宗靈 |
| 地科 earth | 🪨 礦石精靈 | 🌋 火山之靈 | 🌊 海潮精靈 | 🌍 地脈守護 | 🪐 星辰之靈 |

「該科精通 ≥100」＝該科精靈達 Lv5（`at:100`）＝融合資格 (b) 條件。

---

## Task 1：四科精靈擴展（battle.js 加 per-subject 精靈與精通推導）

**Files**
- 修改 `js/battle.js`（新增 `SUBJECT_LINES`／`masteredBySubject`／`companionForSubject`；`mount` 顯示當前科精靈）
- 修改 `js/app.js`（`renderBattle` 傳當前科精靈資料；新增 `masteredCountForSubject`）
- 修改 `test/logic.test.mjs`（新增四科精靈測試）

**Interfaces**
- Produces（battle.js，掛上既有 `SciBattle` 回傳物件）：
  - `SUBJECT_LINES`：`{ nature:[...5階], biology:[...], chemphys:[...], earth:[...] }`，每階 `{ at, emoji, name, atk, leech, leechChance }`
  - `PREFIX_SUBJECT`：`{ e:'nature', b:'biology', pc:'chemphys', d:'earth' }`；`subjectOfId(id)` → subjectKey 或 `null`
  - `masteredBySubject(state, maxBox)` → `{ nature, biology, chemphys, earth }`（各為 `box>=maxBox` 計數）
  - `companionForSubject(subjectKey, masteredCount)` → `{ ...tier, level, mastered, next }`（形狀同 `companionFor`，名字/emoji 取自該科線）
- Consumes：`state.cards`（唯讀）；`SciFlashcard.BOX_INTERVAL_DAYS`（由 app 算 maxBox 傳入）
- 相容：**保留** `COMPANION_TIERS`／`companionFor`（既有測試依賴）；`mount` 新增 `ctx.subjectKey` 與 `ctx.masteredCountForSubject`，未傳時 fallback 回舊 `masteredCardCount`＋`companionFor`（不破壞任何現有呼叫）

**Steps**

- [ ] 在 `test/logic.test.mjs` 末端寫失敗測試：

```js
test('SciBattle.subjectOfId 依 id 前綴分流四科', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.subjectOfId('e0001'), 'nature');
  assert.equal(lib.SciBattle.subjectOfId('b0035'), 'biology');
  assert.equal(lib.SciBattle.subjectOfId('pc0107'), 'chemphys');
  assert.equal(lib.SciBattle.subjectOfId('d0233'), 'earth');
  assert.equal(lib.SciBattle.subjectOfId('zzz'), null);
});

test('SciBattle.masteredBySubject 依前綴計 box>=maxBox 的卡數', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.cards = {
    e0001: { box: 4 }, e0002: { box: 4 }, e0003: { box: 2 },
    b0001: { box: 4 }, pc0001: { box: 4 }, d0001: { box: 1 },
  };
  const m = lib.SciBattle.masteredBySubject(state, 4);
  assert.deepEqual(m, { nature: 2, biology: 1, chemphys: 1, earth: 0 });
});

test('SciBattle.companionForSubject 四科各自五階、名字取自該科線', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciBattle.companionForSubject('nature', 0).name, '萌芽種子');
  assert.equal(lib.SciBattle.companionForSubject('nature', 100).name, '萬物之靈');
  assert.equal(lib.SciBattle.companionForSubject('biology', 20).name, '蝶翼精靈');
  assert.equal(lib.SciBattle.companionForSubject('chemphys', 50).name, '電光之靈');
  assert.equal(lib.SciBattle.companionForSubject('earth', 100).next, null);
  // 數值沿用 COMPANION_TIERS：at100 階 atk 應與舊星靈相同
  assert.equal(lib.SciBattle.companionForSubject('earth', 100).atk, lib.SciBattle.companionFor(100).atk);
});

test('SciBattle.SUBJECT_LINES 四科各五階、門檻對齊 COMPANION_TIERS', () => {
  const lib = makeSandbox();
  const ats = lib.SciBattle.COMPANION_TIERS.map((t) => t.at);
  for (const key of ['nature', 'biology', 'chemphys', 'earth']) {
    const line = lib.SciBattle.SUBJECT_LINES[key];
    assert.equal(line.length, 5);
    assert.deepEqual(line.map((t) => t.at), ats);
    for (const tier of line) assert.ok(tier.name && tier.emoji);
  }
});
```

- [ ] 跑 `node --test test/logic.test.mjs`，確認新測試**失敗**（`companionForSubject` 等未定義）
- [ ] 在 `js/battle.js` `COMPANION_TIERS`／`companionFor` 之後加：

```js
  // ── 四科精靈：沿用 COMPANION_TIERS 的門檻與數值，只換各科名字與 emoji ──
  const SUBJECT_LINES = {
    nature: [
      ['🌰', '萌芽種子'], ['🌱', '新芽綠靈'], ['🌿', '藤蔓精靈'], ['🌳', '巨木守衛'], ['🍀', '萬物之靈'],
    ],
    biology: [
      ['🥚', '細胞原卵'], ['🐛', '幼蟲之靈'], ['🦋', '蝶翼精靈'], ['🦉', '智慧之鴞'], ['🧬', '生命之靈'],
    ],
    chemphys: [
      ['⚗️', '燒瓶精靈'], ['🧪', '試管之靈'], ['🔥', '焰晶精靈'], ['⚡', '電光之靈'], ['⚛️', '元素宗靈'],
    ],
    earth: [
      ['🪨', '礦石精靈'], ['🌋', '火山之靈'], ['🌊', '海潮精靈'], ['🌍', '地脈守護'], ['🪐', '星辰之靈'],
    ],
  };
  // 把純名字表折成完整 tier（數值＝COMPANION_TIERS 同階）
  Object.keys(SUBJECT_LINES).forEach((key) => {
    SUBJECT_LINES[key] = SUBJECT_LINES[key].map(([emoji, name], i) => ({
      ...COMPANION_TIERS[i], emoji, name,
    }));
  });

  const PREFIX_SUBJECT = { e: 'nature', b: 'biology', pc: 'chemphys', d: 'earth' };
  function subjectOfId(id) {
    const m = String(id).match(/^([a-z]+)/);
    return (m && PREFIX_SUBJECT[m[1]]) || null;
  }

  function masteredBySubject(state, maxBox) {
    const out = { nature: 0, biology: 0, chemphys: 0, earth: 0 };
    const cards = (state && state.cards) || {};
    for (const id of Object.keys(cards)) {
      const subj = subjectOfId(id);
      if (subj && cards[id].box >= maxBox) out[subj] += 1;
    }
    return out;
  }

  function companionForSubject(subjectKey, masteredCount) {
    const line = SUBJECT_LINES[subjectKey] || COMPANION_TIERS;
    const n = masteredCount || 0;
    let i = 0;
    while (i + 1 < line.length && n >= line[i + 1].at) i++;
    const cur = line[i];
    const next = line[i + 1] || null;
    return { ...cur, level: i + 1, mastered: n, next };
  }
```

- [ ] `mount` 內：把 `companionCard()`／`assistTag()`／`onAnswer` 裡的 `companionFor(masteredCardCount)` 改成「當前科精靈」——新增 `const currentCompanion = () => ctx.subjectKey ? companionForSubject(ctx.subjectKey, ctx.masteredCountForSubject) : companionFor(masteredCardCount);` 並全數改用 `currentCompanion()`（保留舊參數作 fallback，維持相容）
- [ ] 在 `SciBattle` 的 `return {...}` 補上 `SUBJECT_LINES, PREFIX_SUBJECT, subjectOfId, masteredBySubject, companionForSubject,`
- [ ] `js/app.js`：新增

```js
  function masteredCountForSubject(subjectKey) {
    const maxBox = SciFlashcard.BOX_INTERVAL_DAYS.length - 1;
    return SciBattle.masteredBySubject(state, maxBox)[subjectKey] || 0;
  }
```

  並在 `renderBattle` 的 `SciBattle.mount(body, {...})` 物件加 `subjectKey: activeSubject, masteredCountForSubject: masteredCountForSubject(activeSubject),`
- [ ] 跑 `node --test test/logic.test.mjs` 到全綠（既有 13 條＋新 4 條）
- [ ] Commit：`git add -A && git commit -m "feat(融合): 四科精靈擴展——per-subject 精通推導＋當前科精靈助戰"`

---

## Task 2：sci_fusion 基座（fusion-store.js IIFE＋晶能 stub）

**Files**
- 新增 `js/fusion-store.js`
- 修改 `test/logic.test.mjs`（`makeSandbox` 載入清單加 `js/economy.js`?—見註＋`js/fusion-store.js`；`__exports` 加 `SciFusionStore`）
- （可選）若 `js/economy.js` 尚未由基地計畫建立：**不新建**，本 Task 靠 fusion-store 內建 `__econStub` 撐住，harness 載入清單也不加 `js/economy.js`

**Interfaces**
- Produces：`SciFusionStore.KEY = 'sci_fusion'`
- Produces：`load()` → 回完整 state（缺欄位補預設、壞 JSON 回全新預設）；`save(fstate)`（寫 localStorage，包 try/catch）
- Produces：`defaults()` → 全新 state 物件（`{v:1,hatched:[],nicknames:{},revealed:[],failStreak:0,lastFuseDate:'',fuseCount:0,activeCub:''}`）
- Produces：晶能取用 `crystalBalance()`／`spendCrystals(n)`／`refundCrystals(n)`（內部走 `Econ`；`Econ` 為全域 `SciEconomy` 或 `__econStub`）
- Consumes：全域 `SciEconomy`（若存在）；否則 `localStorage['sci_econ']`

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試：

```js
test('SciFusionStore.load 空狀態有預期骨架、save/load round-trip', () => {
  const lib = makeSandbox();
  const s = lib.SciFusionStore.load();
  assert.deepEqual(s.hatched, []);
  assert.deepEqual(s.revealed, []);
  assert.equal(s.v, 1);
  assert.equal(s.fuseCount, 0);
  assert.equal(s.activeCub, '');
  s.hatched.push('cub_forestdeer');
  lib.SciFusionStore.save(s);
  assert.deepEqual(lib.SciFusionStore.load().hatched, ['cub_forestdeer']);
});

test('SciFusionStore.load 壞 JSON 回全新預設、缺欄位補齊', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_fusion', '{ this is not json');
  assert.deepEqual(lib.SciFusionStore.load().hatched, []);
  lib.__setRaw('sci_fusion', JSON.stringify({ v: 1, hatched: ['x'] }));
  const s = lib.SciFusionStore.load();
  assert.deepEqual(s.hatched, ['x']);
  assert.equal(s.fuseCount, 0);     // 缺欄位補預設
  assert.equal(s.activeCub, '');
  assert.deepEqual(s.revealed, []);
});

test('SciFusionStore 晶能 stub：spend 足額才扣、refund 入帳', () => {
  const lib = makeSandbox();
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30, earnedToday: 0, earnedDate: '' }));
  assert.equal(lib.SciFusionStore.crystalBalance(), 30);
  assert.equal(lib.SciFusionStore.spendCrystals(30).ok, true);
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
  assert.equal(lib.SciFusionStore.spendCrystals(1).ok, false);
  lib.SciFusionStore.refundCrystals(15);
  assert.equal(lib.SciFusionStore.crystalBalance(), 15);
});
```

- [ ] 為讓測試能塞原始字串，於 `test/logic.test.mjs` 的 `makeSandbox` 內把 `store`（localStorage 後端 Map）暴露成 helper：在 `loadScripts` 回傳的 `__exports` 上補 `__setRaw: (k, v) => localStorage.setItem(k, v)`（把 `combined` 尾端改為 `globalThis.__exports = { SciStore, SciFlashcard, SciQuiz, SciWeak, SciBattle, SciFusionStore, __setRaw: (k,v)=>localStorage.setItem(k,v) };`），並把 `js/fusion-store.js` 加進 `makeSandbox` 的 `loadScripts([...])` 清單（放在 `js/battle.js` 之後）
- [ ] 跑 `node --test test/logic.test.mjs` 確認新測試失敗
- [ ] 新增 `js/fusion-store.js`（本 Task 只放基座；Task 3–8 逐段擴充同一檔）：

```js
// 精靈融合系統：四科精靈滿階融合出稚靈（6 隻封頂）。純前端、獨立存檔 sci_fusion。
// 晶能收支走 SciEconomy（科學基地計畫建立）；未上線時走 __econStub（離線保險，勿刪）。
// 硬性規則：雙親精靈永不消耗（本檔不寫 state.cards）；失敗只扣晶能並返還一半（白帽時間成本）。
const SciFusionStore = (() => {
  const KEY = 'sci_fusion';
  const ECON_KEY = 'sci_econ';

  function defaults() {
    return { v: 1, hatched: [], nicknames: {}, revealed: [], failStreak: 0, lastFuseDate: '', fuseCount: 0, activeCub: '' };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const p = JSON.parse(raw);
      const d = defaults();
      return {
        v: 1,
        hatched: Array.isArray(p.hatched) ? p.hatched : d.hatched,
        nicknames: (p.nicknames && typeof p.nicknames === 'object') ? p.nicknames : d.nicknames,
        revealed: Array.isArray(p.revealed) ? p.revealed : d.revealed,
        failStreak: Number.isFinite(p.failStreak) ? p.failStreak : 0,
        lastFuseDate: typeof p.lastFuseDate === 'string' ? p.lastFuseDate : '',
        fuseCount: Number.isFinite(p.fuseCount) ? p.fuseCount : 0,
        activeCub: typeof p.activeCub === 'string' ? p.activeCub : '',
      };
    } catch {
      return defaults();
    }
  }

  function save(fstate) {
    try { localStorage.setItem(KEY, JSON.stringify(fstate)); } catch { /* 隱私模式等寫入失敗靜默 */ }
  }

  // ── 晶能：全域 SciEconomy 優先，否則走內建 stub（讀寫 sci_econ）──
  const __econStub = (() => {
    function read() {
      try { return JSON.parse(localStorage.getItem(ECON_KEY)) || { balance: 0 }; }
      catch { return { balance: 0 }; }
    }
    function write(o) { try { localStorage.setItem(ECON_KEY, JSON.stringify(o)); } catch { /* noop */ } }
    return {
      getBalance() { return read().balance || 0; },
      spendCrystals(n) {
        const o = read();
        if (!Number.isFinite(n) || n < 0 || (o.balance || 0) < n) return { ok: false, balance: o.balance || 0 };
        o.balance = (o.balance || 0) - n; write(o);
        return { ok: true, balance: o.balance };
      },
      earnCrystals(n) {
        const o = read();
        if (!Number.isFinite(n) || n <= 0) return { earned: 0, balance: o.balance || 0 };
        o.balance = (o.balance || 0) + Math.floor(n); write(o);
        return { earned: Math.floor(n), balance: o.balance };
      },
    };
  })();
  const Econ = (typeof SciEconomy !== 'undefined' && SciEconomy && SciEconomy.spendCrystals) ? SciEconomy : __econStub;

  function crystalBalance() { return Econ.getBalance(); }
  function spendCrystals(n) { return Econ.spendCrystals(n); }
  function refundCrystals(n) { return Econ.earnCrystals(n, 'fusion-refund'); }

  return { KEY, defaults, load, save, crystalBalance, spendCrystals, refundCrystals };
})();
```

- [ ] `index.html`：在 `<script src="js/battle.js"></script>` 之後、`js/app.js` 之前插入（若基地計畫已加 `js/economy.js`，其標籤須在本行之前）：`<script src="js/fusion-store.js"></script>`
- [ ] 跑 `node --test test/logic.test.mjs` 到全綠
- [ ] Commit：`git commit -am "feat(融合): sci_fusion 基座——獨立存檔＋晶能 stub 離線保險"`

---

## Task 3：融合資格判定（canFuse 純函式）

**Files**
- 修改 `js/fusion-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces**
- Produces：`MASTER_GATE = 100`、`ACC_GATE = 0.8`、`ACC_WINDOW = 30`、`ACC_MIN_SAMPLE = 15`
- Produces：`accuracyBySubject(state, subjectKey, opts?)` → `{ accuracy, total }`（取該科最近 `ACC_WINDOW` 筆；`total < ACC_MIN_SAMPLE` 時 accuracy 仍算出但資格判定視為未達標）
- Produces：`SUBJECT_ORDER = ['nature','biology','chemphys','earth']`；`pairKey(a, b)` → 依序排好的 `'x+y'`；`cubForPair(a, b)` → CUB 定義或 `null`（Task 4 才有 CUBS，本 Task 先只做 `pairKey`）
- Produces：`canFuse(meta, state, subjA, subjB)` → `{ ok, reasons }`，`meta = { maxBox }`；`reasons` 為未通過原因碼陣列，碼 ∈ `'same-subject' | 'master:<subj>' | 'accuracy:<subj>' | 'already-hatched'`
- Consumes：`SciBattle.masteredBySubject`、`SciBattle.subjectOfId`（全域，同一 vm/browser 作用域）；`load()`（讀 hatched/revealed）

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試（用 helper 灌一批某科的滿階卡＋近期正確率 weakLog）：

```js
function fusionReadyState(lib) {
  const state = lib.SciStore.load();
  state.cards = {};
  // nature 與 biology 各 100 張滿階（box=4）
  for (let i = 1; i <= 100; i++) state.cards[`e${String(i).padStart(4, '0')}`] = { box: 4, due: 0, seen: 5, wrong: 0 };
  for (let i = 1; i <= 100; i++) state.cards[`b${String(i).padStart(4, '0')}`] = { box: 4, due: 0, seen: 5, wrong: 0 };
  // 兩科近期各 20 筆、90% 正確
  state.weakLog = [];
  for (const pre of ['e', 'b']) {
    for (let i = 0; i < 20; i++) {
      state.weakLog.push({ termId: `${pre}0001`, unit: 'x', correct: i < 18, guessed: false, t: Date.now() + i });
    }
  }
  return state;
}

test('canFuse：兩科滿階＋近期正確率達標 → ok', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  const r = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
});

test('canFuse：同一科 → same-subject', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  const r = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'nature');
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('same-subject'));
});

test('canFuse：某科精通不足 100 → master:<subj>', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  delete state.cards['b0100']; // biology 剩 99
  const r = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('master:biology'));
});

test('canFuse：某科近期正確率 < 80% → accuracy:<subj>', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  state.weakLog = state.weakLog.map((e) =>
    e.termId.startsWith('b') ? { ...e, correct: false } : e); // biology 全錯
  const r = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.ok(r.reasons.includes('accuracy:biology'));
});

test('canFuse：樣本數 < ACC_MIN_SAMPLE 視為未達標', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  state.weakLog = state.weakLog.filter((e) => e.termId.startsWith('e')); // biology 樣本 0
  const r = lib.SciFusionStore.canFuse({ maxBox: 4 }, state, 'nature', 'biology');
  assert.ok(r.reasons.includes('accuracy:biology'));
});

test('accuracyBySubject：只取最近 ACC_WINDOW 筆', () => {
  const lib = makeSandbox();
  const state = lib.SciStore.load();
  state.weakLog = [];
  for (let i = 0; i < 40; i++) state.weakLog.push({ termId: 'e0001', unit: 'x', correct: i >= 10, guessed: false, t: i });
  // 最近 30 筆（i=10..39）全對 → accuracy 1
  const r = lib.SciFusionStore.accuracyBySubject(state, 'nature');
  assert.equal(r.total, 30);
  assert.ok(Math.abs(r.accuracy - 1) < 1e-9);
});
```

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加（回傳物件同步補這些名稱）：

```js
  const MASTER_GATE = 100;   // 每科精通 ≥100 = 精靈達 Lv5
  const ACC_GATE = 0.8;      // 近期正確率門檻
  const ACC_WINDOW = 30;     // 近期視窗（該科最近 N 筆作答）
  const ACC_MIN_SAMPLE = 15; // 樣本不足不放行
  const SUBJECT_ORDER = ['nature', 'biology', 'chemphys', 'earth'];

  function pairKey(a, b) {
    return [a, b].sort((x, y) => SUBJECT_ORDER.indexOf(x) - SUBJECT_ORDER.indexOf(y)).join('+');
  }

  function accuracyBySubject(state, subjectKey, opts = {}) {
    const window = opts.window || ACC_WINDOW;
    const log = (state && state.weakLog) || [];
    const mine = log.filter((e) => SciBattle.subjectOfId(e.termId) === subjectKey).slice(-window);
    const total = mine.length;
    const correct = mine.filter((e) => e.correct).length;
    return { accuracy: total > 0 ? correct / total : 0, total };
  }

  function canFuse(meta, state, subjA, subjB) {
    const maxBox = (meta && meta.maxBox) || 4;
    const reasons = [];
    if (subjA === subjB) reasons.push('same-subject');
    const mastered = SciBattle.masteredBySubject(state, maxBox);
    [subjA, subjB].forEach((s) => {
      if ((mastered[s] || 0) < MASTER_GATE && !reasons.includes(`master:${s}`)) reasons.push(`master:${s}`);
      const acc = accuracyBySubject(state, s);
      if ((acc.total < ACC_MIN_SAMPLE || acc.accuracy < ACC_GATE) && !reasons.includes(`accuracy:${s}`)) {
        reasons.push(`accuracy:${s}`);
      }
    });
    if (subjA !== subjB) {
      const fstate = load();
      const cub = cubForPair(subjA, subjB);
      if (cub && fstate.hatched.includes(cub.id)) reasons.push('already-hatched');
    }
    return { ok: reasons.length === 0, reasons };
  }
```

  > `cubForPair` 於 Task 4 定義（同檔）；本 Task 先讓 `canFuse` 的 `already-hatched` 分支容忍 `cubForPair` 尚回 `null`（`if (cub && ...)`）。若嚴格 TDD 要本 Task 綠，可在本 Task 先加一個 `cubForPair` 佔位回 `null`，Task 4 再補全 CUBS。
- [ ] 跑到全綠
- [ ] Commit：`git commit -am "feat(融合): 融合資格判定——雙科滿階＋近期正確率視窗"`

---

## Task 4：融合核心成功路徑（6 稚靈、雙親不消耗）

**Files**
- 修改 `js/fusion-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces**
- Produces：`CUBS`（6 隻：`{ id, name, emoji, pair:[subjA,subjB], bornLine }`）；`CUB_BY_PAIR`（pairKey → cub）；`cubForPair(a, b)` → cub 或 `null`
- Produces：`FUSE_COST = 30`、`FAIL_RATE = 0.2`
- Produces：`fuse(fstate, state, subjA, subjB, { rng = Math.random, today = '' , meta = { maxBox: 4 } } = {})` → 成功 `{ ok:true, result:'success', cub:{id,name,emoji,bornLine,pair}, fstate }`；失敗（機率）見 Task 5；擋下 `{ ok:false, reason }`（reason ∈ `'ineligible' | 'crystals' | 'daily-limit'`）
- Produces：`listCubs(fstate)` → `[{ id, name, emoji, pair, nickname, displayName, isActive }]`（view model）
- **雙親不消耗**：`fuse` 全程不寫 `state.cards`

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試（沿用 `fusionReadyState`；灌晶能餘額）：

```js
const okRng = () => 0.5; // >= FAIL_RATE → 成功

test('CUBS：全庫 6 隻、pairKey 兩兩不重複、台詞非空殼', () => {
  const lib = makeSandbox();
  assert.equal(lib.SciFusionStore.CUBS.length, 6);
  const keys = lib.SciFusionStore.CUBS.map((c) => lib.SciFusionStore.pairKey(c.pair[0], c.pair[1]));
  assert.equal(new Set(keys).size, 6);
  for (const c of lib.SciFusionStore.CUBS) {
    assert.ok(c.emoji && c.name.length >= 2);
    assert.ok(c.bornLine.length >= 12, `${c.id} 設定文案過短`);
  }
});

test('fuse 成功：扣 30 晶能、稚靈入庫、雙親 state.cards 前後一致', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const cardsBefore = JSON.stringify(state.cards);
  const fstate = lib.SciFusionStore.load();
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  assert.equal(r.ok, true);
  assert.equal(r.result, 'success');
  assert.equal(r.cub.id, 'cub_forestdeer');
  assert.equal(lib.SciFusionStore.crystalBalance(), 0);
  assert.equal(JSON.stringify(state.cards), cardsBefore, '雙親不可被消耗');
  assert.deepEqual(fstate.hatched, ['cub_forestdeer']);
});

test('fuse：晶能不足回 crystals、不出稚靈', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 29 }));
  const fstate = lib.SciFusionStore.load();
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'crystals');
  assert.deepEqual(fstate.hatched, []);
});

test('fuse：資格不符直接擋 ineligible', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  delete state.cards['b0100'];
  const fstate = lib.SciFusionStore.load();
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  assert.equal(r.reason, 'ineligible');
});

test('fuse：同配對已孵化 → 資格判定 already-hatched → ineligible', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 60 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  lib.SciFusionStore.save(fstate);
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  assert.equal(r.reason, 'ineligible');
});

test('listCubs：回擁有稚靈的 view model、displayName 落回本名', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: okRng, today: '2026-07-20' });
  const list = lib.SciFusionStore.listCubs(fstate);
  assert.equal(list.length, 1);
  assert.equal(list[0].displayName, '森靈鹿');
  assert.equal(list[0].isActive, false);
});
```

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加：

```js
  const FUSE_COST = 30;   // 一次融合 30 晶能（＝攻克約 30 題、數天積累）
  const FAIL_RATE = 0.2;  // 20% 失敗——只扣晶能並返還一半（Task 5）

  // 稚靈全庫：四科兩兩＝6 隻封頂。pair 依 SUBJECT_ORDER 排序後與 pairKey 對齊。
  const CUBS = [
    { id: 'cub_forestdeer',    name: '森靈鹿', emoji: '🦌', pair: ['nature', 'biology'],
      bornLine: '苔綠鹿角上棲著整片生態系，牠一踏步，荒地便冒出新芽。' },
    { id: 'cub_crystalfox',    name: '晶石狐', emoji: '🦊', pair: ['nature', 'chemphys'],
      bornLine: '尾尖凝著會變色的結晶，牠嗅得出每一次反應該往哪走。' },
    { id: 'cub_windhawk',      name: '風嵐鷹', emoji: '🦅', pair: ['nature', 'earth'],
      bornLine: '乘著季風巡遊高空，牠的翅膀讀得懂雲、也讀得懂地層。' },
    { id: 'cub_alchemydragon', name: '煉金龍', emoji: '🐉', pair: ['biology', 'chemphys'],
      bornLine: '體內流著會呼吸的化學反應，一吐息就是一場生命與元素的交換。' },
    { id: 'cub_deepwhale',     name: '深海鯨', emoji: '🐋', pair: ['biology', 'earth'],
      bornLine: '潛行於洋流最深處，牠的歌聲同時是生命的脈動與地球的心跳。' },
    { id: 'cub_starcore',      name: '星核獸', emoji: '🌟', pair: ['chemphys', 'earth'],
      bornLine: '胸口嵌著一顆微型恆星，把物質的規律與星空的尺度收進同一副身軀。' },
  ];
  const CUB_BY_PAIR = new Map(CUBS.map((c) => [pairKey(c.pair[0], c.pair[1]), c]));
  const CUB_BY_ID = new Map(CUBS.map((c) => [c.id, c]));
  function cubForPair(a, b) { return CUB_BY_PAIR.get(pairKey(a, b)) || null; }

  function fuse(fstate, state, subjA, subjB, opts = {}) {
    const { rng = Math.random, today = '', meta = { maxBox: 4 } } = opts;
    const gate = canFuse(meta, state, subjA, subjB);
    if (!gate.ok) return { ok: false, reason: 'ineligible', reasons: gate.reasons };
    // （Task 5 在此插入每日上限檢查）
    const cub = cubForPair(subjA, subjB);
    if (!cub) return { ok: false, reason: 'ineligible' };
    const paid = spendCrystals(FUSE_COST);
    if (!paid.ok) return { ok: false, reason: 'crystals' };
    // （Task 5 在此插入 20% 失敗分支——扣款之後、入庫之前）
    fstate.hatched.push(cub.id);
    fstate.failStreak = 0;
    fstate.lastFuseDate = today;
    return {
      ok: true, result: 'success', fstate,
      cub: { id: cub.id, name: cub.name, emoji: cub.emoji, bornLine: cub.bornLine, pair: cub.pair.slice() },
    };
  }

  function listCubs(fstate) {
    return fstate.hatched.map((id) => {
      const c = CUB_BY_ID.get(id);
      if (!c) return null;
      const nick = fstate.nicknames[id] || '';
      return { id, name: c.name, emoji: c.emoji, pair: c.pair.slice(), nickname: nick, displayName: nick || c.name, isActive: fstate.activeCub === id };
    }).filter(Boolean);
  }
```

  補進 `return {...}`：`CUBS, cubForPair, FUSE_COST, FAIL_RATE, fuse, listCubs,`（以及 Task 3 的 `MASTER_GATE, ACC_GATE, accuracyBySubject, canFuse, pairKey, SUBJECT_ORDER`）
- [ ] 跑到全綠（含 Task 3 的 `already-hatched` 現在 `cubForPair` 已可回真值）
- [ ] Commit：`git commit -am "feat(融合): 融合核心成功路徑——6稚靈封頂、雙親不消耗"`

---

## Task 5：失敗機制（20% 只扣晶能＋返還一半＋每日上限）

**Files**
- 修改 `js/fusion-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces**
- Produces：`MAX_FUSE_PER_DAY = 3`、`FAIL_LINES`（≥3 句安慰台詞）
- Produces：`fuse` 失敗分支回 `{ ok:true, result:'fail', line, refund, fstate }`（`ok:true` 表流程正常走完，`result` 區分成敗；`refund = floor(FUSE_COST/2)`）
- Produces：`fuse` 每日上限回 `{ ok:false, reason:'daily-limit' }`（**扣款前**檢查，超限不扣晶能）
- Produces：`failLine(fstate)`（依 `failStreak` 挑台詞，可注入 rng）
- Consumes：`refundCrystals`（Task 2）

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試：

```js
const failRng = () => 0.1; // < FAIL_RATE → 失敗

test('fuse 失敗：只扣晶能後返還一半、不出稚靈、雙親與進度不動', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const cardsBefore = JSON.stringify(state.cards);
  const fstate = lib.SciFusionStore.load();
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: failRng, today: '2026-07-20' });
  assert.equal(r.ok, true);
  assert.equal(r.result, 'fail');
  assert.ok(lib.SciFusionStore.FAIL_LINES.includes(r.line));
  assert.equal(r.refund, 15);
  assert.equal(lib.SciFusionStore.crystalBalance(), 15); // 扣 30、退 15
  assert.deepEqual(fstate.hatched, []);
  assert.equal(JSON.stringify(state.cards), cardsBefore);
  assert.equal(fstate.failStreak, 1);
});

test('fuse 每日上限：超過 MAX_FUSE_PER_DAY 回 daily-limit 且不扣晶能', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 999 }));
  const fstate = lib.SciFusionStore.load();
  for (let i = 0; i < lib.SciFusionStore.MAX_FUSE_PER_DAY; i++) {
    lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: failRng, today: '2026-07-20' });
  }
  const balBefore = lib.SciFusionStore.crystalBalance();
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: failRng, today: '2026-07-20' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'daily-limit');
  assert.equal(lib.SciFusionStore.crystalBalance(), balBefore, '超限不應扣晶能');
});

test('fuse 每日上限跨日重置', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 999 }));
  const fstate = lib.SciFusionStore.load();
  for (let i = 0; i < lib.SciFusionStore.MAX_FUSE_PER_DAY; i++) {
    lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: failRng, today: '2026-07-20' });
  }
  const r = lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: failRng, today: '2026-07-21' });
  assert.notEqual(r.reason, 'daily-limit');
});

test('FAIL_LINES：至少 3 句、每句非空殼', () => {
  const lib = makeSandbox();
  assert.ok(lib.SciFusionStore.FAIL_LINES.length >= 3);
  for (const l of lib.SciFusionStore.FAIL_LINES) assert.ok(l.length >= 10);
});
```

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加常數與台詞：

```js
  const MAX_FUSE_PER_DAY = 3; // 每日融合嘗試上限（時間成本型節流，非懲罰）
  const FAIL_LINES = [
    '兩股靈力沒能合上——別急，這不扣你的精靈、也不扣你的學習，退你一半晶能，明天再來一次。',
    '光暈閃了一下又散開了。稚靈感覺得到你的努力，只是還差一點火候，這半數晶能拿回去。',
    '這次沒接住，但精靈毫髮無傷、進度一格沒少。休息一下，多練幾題晶能又滿了。',
  ];
  function failLine(fstate) {
    const i = Math.min(fstate.failStreak || 0, FAIL_LINES.length - 1);
    return FAIL_LINES[i];
  }
```

- [ ] 在 `fuse()` 內補兩段（位置見 Task 4 註解標記）：
  1. 資格通過**之後、扣款之前**加每日上限：

```js
    // 每日上限：跨日重置計數（時間成本節流；超限不扣款）
    if (fstate.lastFuseDate !== today) { fstate.lastFuseDate = today; fstate.fuseCount = 0; }
    if (fstate.fuseCount >= MAX_FUSE_PER_DAY) return { ok: false, reason: 'daily-limit' };
```

  2. 扣款成功**之後**先記一次嘗試，再插 20% 失敗分支：

```js
    fstate.fuseCount += 1;
    if (rng() < FAIL_RATE) {
      const refund = Math.floor(FUSE_COST / 2);
      refundCrystals(refund);
      fstate.failStreak = (fstate.failStreak || 0) + 1;
      const line = failLine(fstate);
      return { ok: true, result: 'fail', line, refund, fstate };
    }
```

  （成功分支末端已把 `failStreak` 歸零、`lastFuseDate` 設好——確認順序正確）
- [ ] 補進 `return {...}`：`MAX_FUSE_PER_DAY, FAIL_LINES, failLine,`
- [ ] 跑 `node --test test/logic.test.mjs` 到全綠（Task 4 的成功測試用 `okRng=()=>0.5`＝0.5≥0.2 不踩失敗分支；但成功測試現在會 `fuseCount+=1`，不影響斷言）
- [ ] Commit：`git commit -am "feat(融合): 20%失敗只扣晶能退一半＋每日融合上限（白帽時間成本）"`

---

## Task 6：配方揭曉解謎（答對雙科隱藏題才見稚靈真身）

**Files**
- 修改 `js/fusion-store.js`
- 修改 `test/logic.test.mjs`

**Interfaces**
- Produces：`isRevealed(fstate, a, b)` → boolean（讀 `fstate.revealed` 是否含 `pairKey`）
- Produces：`revealPair(fstate, a, b)` → `{ fstate, revealed:true }`（把 pairKey 推進 `fstate.revealed`，冪等）
- Produces：`buildRevealQuestion(a, b, poolsBySubject, rng = Math.random)` → `{ subject, question }`，`question` 為 `SciQuiz.buildQuestion(target, pool)` 的結果；`target` 優先從兩科的 `advanced:true` 詞條隨機抽，**該科無 advanced 時 fallback 抽該科任一詞條**（nature 目前 0 筆 advanced，必走 fallback）；`pool` 用該 target 所屬科的完整詞條池
- Produces：`getFusionPreview(fstate, a, b)` → `{ known:false }` 或 `{ known:true, cub:{id,name,emoji,bornLine} }`（UI 據此決定剪影或真身）
- Consumes：`SciQuiz.buildQuestion`（全域）；`cubForPair`

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試：

```js
test('未揭曉前 preview 未知；revealPair 後看得見稚靈真身', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  assert.equal(lib.SciFusionStore.getFusionPreview(fstate, 'nature', 'biology').known, false);
  lib.SciFusionStore.revealPair(fstate, 'nature', 'biology');
  const p = lib.SciFusionStore.getFusionPreview(fstate, 'biology', 'nature'); // 順序無關
  assert.equal(p.known, true);
  assert.equal(p.cub.id, 'cub_forestdeer');
});

test('isRevealed：pairKey 順序無關、冪等', () => {
  const lib = makeSandbox();
  const fstate = lib.SciFusionStore.load();
  assert.equal(lib.SciFusionStore.isRevealed(fstate, 'nature', 'earth'), false);
  lib.SciFusionStore.revealPair(fstate, 'earth', 'nature');
  lib.SciFusionStore.revealPair(fstate, 'nature', 'earth'); // 冪等
  assert.equal(fstate.revealed.filter((k) => k === 'nature+earth').length, 1);
  assert.equal(lib.SciFusionStore.isRevealed(fstate, 'nature', 'earth'), true);
});

test('buildRevealQuestion：回合法四選一題；biology 走 advanced、nature 走 fallback', () => {
  const lib = makeSandbox();
  const fs = require('node:fs');
  const bio = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'biology.json'), 'utf8'));
  const ele = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'elementary.json'), 'utf8'));
  const pools = { nature: ele, biology: bio };
  // rng 固定 0 → 取 subject 陣列第一個（nature），nature 無 advanced → fallback
  const q1 = lib.SciFusionStore.buildRevealQuestion('nature', 'biology', pools, () => 0);
  assert.equal(q1.subject, 'nature');
  assert.equal(q1.question.options.length, 4);
  assert.ok(q1.question.options.some((o) => o.id === q1.question.answerId));
});
```

> 注意：`test/logic.test.mjs` 頂端已 `import { readFileSync }`；上例為示意，實作時直接用檔案頂端既有的 `readFileSync`／`path`／`ROOT`，不要 `require`。

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加：

```js
  function isRevealed(fstate, a, b) { return fstate.revealed.includes(pairKey(a, b)); }
  function revealPair(fstate, a, b) {
    const k = pairKey(a, b);
    if (!fstate.revealed.includes(k)) fstate.revealed.push(k);
    return { fstate, revealed: true };
  }

  // 從某科詞條池抽一個目標：優先 advanced，無則 fallback 全池
  function pickRevealTarget(pool, rng) {
    const adv = pool.filter((t) => t.advanced);
    const src = adv.length ? adv : pool;
    return src[Math.floor(rng() * src.length)] || pool[0];
  }

  function buildRevealQuestion(a, b, poolsBySubject, rng = Math.random) {
    const subs = pairKey(a, b).split('+');           // 依序 [subjA, subjB]
    const subject = subs[Math.floor(rng() * subs.length)] || subs[0];
    const pool = (poolsBySubject && poolsBySubject[subject]) || [];
    const target = pickRevealTarget(pool, rng);
    return { subject, question: SciQuiz.buildQuestion(target, pool) };
  }

  function getFusionPreview(fstate, a, b) {
    if (!isRevealed(fstate, a, b)) return { known: false };
    const c = cubForPair(a, b);
    return c ? { known: true, cub: { id: c.id, name: c.name, emoji: c.emoji, bornLine: c.bornLine } } : { known: false };
  }
```

  補進 `return {...}`：`isRevealed, revealPair, buildRevealQuestion, getFusionPreview,`
- [ ] 跑到全綠
- [ ] Commit：`git commit -am "feat(融合): 配方揭曉解謎——答對隱藏題才見稚靈（nature 無 advanced 走 fallback）"`

---

## Task 7：稚靈隨行出戰（battle.js assist 通道疊加）

**Files**
- 修改 `js/fusion-store.js`（`setActiveCub`／`clearActiveCub`／`cubBattleMods`）
- 修改 `js/battle.js`（`mount` 的 `onAnswer` 疊加第二段稚靈追擊）
- 修改 `js/app.js`（`renderBattle` 傳 `cubMods`）
- 修改 `test/logic.test.mjs`

**Interfaces**
- Produces：`setActiveCub(fstate, cubId)` → `{ fstate, ok, reason }`（reason ∈ `null | 'not-owned'`）；`clearActiveCub(fstate)` → `{ fstate, ok:true }`
- Produces：`cubBattleMods(fstate)` → `{ atk, leech, leechChance }`（無隨行稚靈回全 0；有隨行回**溫和固定值**）
- Consumes（battle.js `mount`）：`ctx.cubMods`（app 傳入）；在科精靈追擊之後、切回合之前疊加第二段稚靈追擊
- **數值與上限（溫和、寫死）**：隨行稚靈固定 `atk:3`、`leech:4`、`leechChance:0.15`；**稚靈追擊上限 = 5**（`Math.min(mods.atk, 5)`），不隨精通成長、不觸發段位分、只在答對且對手未死時生效——與科精靈助戰**相加但各自獨立顯示**

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試：

```js
test('setActiveCub / clearActiveCub：只有擁有的稚靈能隨行', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: () => 0.5, today: '2026-07-20' });
  assert.equal(lib.SciFusionStore.setActiveCub(fstate, 'cub_starcore').reason, 'not-owned');
  assert.equal(lib.SciFusionStore.setActiveCub(fstate, 'cub_forestdeer').ok, true);
  assert.equal(fstate.activeCub, 'cub_forestdeer');
  lib.SciFusionStore.clearActiveCub(fstate);
  assert.equal(fstate.activeCub, '');
});

test('cubBattleMods：無隨行＝全 0；隨行＝溫和固定值且 atk 不超過 5', () => {
  const lib = makeSandbox();
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: () => 0.5, today: '2026-07-20' });
  assert.deepEqual(lib.SciFusionStore.cubBattleMods(fstate), { atk: 0, leech: 0, leechChance: 0 });
  lib.SciFusionStore.setActiveCub(fstate, 'cub_forestdeer');
  const m = lib.SciFusionStore.cubBattleMods(fstate);
  assert.ok(m.atk > 0 && m.atk <= 5);
  assert.ok(m.leech >= 0 && m.leechChance >= 0);
});
```

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加：

```js
  const CUB_ASSIST = { atk: 3, leech: 4, leechChance: 0.15, atkCap: 5 };
  function setActiveCub(fstate, cubId) {
    if (!fstate.hatched.includes(cubId)) return { fstate, ok: false, reason: 'not-owned' };
    fstate.activeCub = cubId;
    return { fstate, ok: true, reason: null };
  }
  function clearActiveCub(fstate) { fstate.activeCub = ''; return { fstate, ok: true }; }
  function cubBattleMods(fstate) {
    if (!fstate.activeCub || !fstate.hatched.includes(fstate.activeCub)) return { atk: 0, leech: 0, leechChance: 0 };
    return { atk: Math.min(CUB_ASSIST.atk, CUB_ASSIST.atkCap), leech: CUB_ASSIST.leech, leechChance: CUB_ASSIST.leechChance };
  }
```

  補進 `return {...}`：`setActiveCub, clearActiveCub, cubBattleMods,`
- [ ] `js/battle.js` `mount`：`ctx` 解構加 `cubMods`（app 傳入的 `SciFusionStore.cubBattleMods(...)` 結果，未傳時 `= { atk:0,leech:0,leechChance:0 }`）。在 `onAnswer` 的科精靈追擊區塊之後、`render(true)` 之前插入第二段：

```js
        // 稚靈隨行：第二段小額追擊（與科精靈助戰獨立顯示、各自結算，不改 calcDamage）
        const cm = ctx.cubMods || { atk: 0, leech: 0, leechChance: 0 };
        if (cm.atk > 0 && battleState.oHp > 0) {
          battleState.oHp = Math.max(0, battleState.oHp - cm.atk);
          const activeCub = SciFusionStore.listCubs(SciFusionStore.load()).find((c) => c.isActive);
          battleState.log += `　${activeCub ? activeCub.emoji + ' ' + activeCub.displayName : '稚靈'} 追擊 -${cm.atk}`;
          if (cm.leech && Math.random() < cm.leechChance) {
            battleState.pHp = Math.min(MAX_HP, battleState.pHp + cm.leech);
            battleState.log += `・回血 +${cm.leech}`;
          }
        }
```

  > `assistTag()` 可順帶追加一行稚靈助戰標示（選配）。**PvP 分支不加稚靈助戰**（維持同裝置對戰公平，與現有「PvP 不觸發夥伴助戰」一致）。
- [ ] `js/app.js` `renderBattle`：`SciBattle.mount(body, {...})` 物件加 `cubMods: SciFusionStore.cubBattleMods(SciFusionStore.load()),`
- [ ] 跑 `node --test test/logic.test.mjs` 到全綠
- [ ] Commit：`git commit -am "feat(融合): 稚靈隨行出戰——第二段小額追擊經既有 assist 通道疊加（上限5、PvP除外）"`

---

## Task 8：暱稱＋稚靈名片（預設詞庫組合＋canvas 分享卡）

**Files**
- 修改 `js/fusion-store.js`（`NICK_PREFIXES`／`NICK_SUFFIXES`／`composeNickname`／`setNickname`／`buildCubCardData`）
- 修改 `js/app.js`（`drawCubCard`／`shareCubCard`——canvas 1080×1350，`toBlob`→`navigator.share`，不支援則下載 PNG）
- 修改 `test/logic.test.mjs`（只測資料層）

**Interfaces**
- Produces：`NICK_PREFIXES`（≥6 個，如 `['小','阿','靈','晶','森','風','星','海']`）、`NICK_SUFFIXES`（≥6 個，如 `['寶','仔','靈','兒','醬','君']`）
- Produces：`composeNickname(prefixIdx, suffixIdx)` → 字串（越界回 `''`）
- Produces：`setNickname(fstate, cubId, nick)` → `{ fstate, ok, reason }`（reason ∈ `null | 'not-owned' | 'not-allowed'`；`nick` 必須是 `composeNickname` 能產生的組合之一或 `''` 清除——**不開放自由輸入**）
- Produces：`buildCubCardData(fstate, cubId, { rankLabel })` → `null` 或 `{ id, name, displayName, emoji, parents:[{key,label}], bornLine, cubCount, rankLabel }`（`parents[].label` 為科目中文名；`cubCount` 為 `x/6`）
- Consumes（app.js `drawCubCard`）：`buildCubCardData`；`SUBJECTS` 科目中文名；`rankLabel(masteredCardCount())`

**Steps**

- [ ] 在 `test/logic.test.mjs` 寫失敗測試：

```js
function metaWithForestdeer(lib) {
  const state = fusionReadyState(lib);
  lib.__setRaw('sci_econ', JSON.stringify({ balance: 30 }));
  const fstate = lib.SciFusionStore.load();
  lib.SciFusionStore.fuse(fstate, state, 'nature', 'biology', { rng: () => 0.5, today: '2026-07-20' });
  return fstate;
}

test('composeNickname / setNickname：只收預設詞庫組合、空字串清除、擋自由輸入', () => {
  const lib = makeSandbox();
  const fstate = metaWithForestdeer(lib);
  const nick = lib.SciFusionStore.composeNickname(0, 0);
  assert.ok(nick.length >= 2);
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', nick).ok, true);
  assert.equal(lib.SciFusionStore.listCubs(fstate)[0].displayName, nick);
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', '任意自由字').reason, 'not-allowed');
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_forestdeer', '').ok, true); // 清除
  assert.equal(lib.SciFusionStore.listCubs(fstate)[0].displayName, '森靈鹿');
  assert.equal(lib.SciFusionStore.setNickname(fstate, 'cub_starcore', nick).reason, 'not-owned');
});

test('buildCubCardData：含雙親科目中文名、稚靈計數、段位稱號', () => {
  const lib = makeSandbox();
  const fstate = metaWithForestdeer(lib);
  const d = lib.SciFusionStore.buildCubCardData(fstate, 'cub_forestdeer', { rankLabel: '進階英雄' });
  assert.equal(d.name, '森靈鹿');
  assert.deepEqual(d.parents.map((p) => p.key), ['nature', 'biology']);
  assert.equal(d.parents[0].label, '國小自然');
  assert.equal(d.cubCount, 1);
  assert.equal(d.rankLabel, '進階英雄');
  assert.equal(lib.SciFusionStore.buildCubCardData(fstate, 'cub_starcore', {}), null);
});
```

- [ ] 跑確認失敗
- [ ] 在 `js/fusion-store.js` 追加（科目中文名內建一份，避免依賴 app.js `SUBJECTS`）：

```js
  const SUBJECT_LABELS = { nature: '國小自然', biology: '國中生物', chemphys: '國中理化', earth: '國中地科' };
  const NICK_PREFIXES = ['小', '阿', '靈', '晶', '森', '風', '星', '海'];
  const NICK_SUFFIXES = ['寶', '仔', '靈', '兒', '醬', '君'];
  const NICK_SET = new Set();
  NICK_PREFIXES.forEach((p) => NICK_SUFFIXES.forEach((s) => NICK_SET.add(p + s)));

  function composeNickname(pi, si) {
    const p = NICK_PREFIXES[pi]; const s = NICK_SUFFIXES[si];
    return (p && s) ? p + s : '';
  }
  function setNickname(fstate, cubId, nick) {
    if (!fstate.hatched.includes(cubId)) return { fstate, ok: false, reason: 'not-owned' };
    const n = String(nick);
    if (n === '') { delete fstate.nicknames[cubId]; return { fstate, ok: true, reason: null }; }
    if (!NICK_SET.has(n)) return { fstate, ok: false, reason: 'not-allowed' };
    fstate.nicknames[cubId] = n;
    return { fstate, ok: true, reason: null };
  }
  function buildCubCardData(fstate, cubId, opts = {}) {
    if (!fstate.hatched.includes(cubId)) return null;
    const c = CUB_BY_ID.get(cubId);
    if (!c) return null;
    const nick = fstate.nicknames[cubId] || '';
    return {
      id: cubId, name: c.name, displayName: nick || c.name, emoji: c.emoji,
      parents: c.pair.map((k) => ({ key: k, label: SUBJECT_LABELS[k] || k })),
      bornLine: c.bornLine, cubCount: fstate.hatched.length, rankLabel: opts.rankLabel || '',
    };
  }
```

  補進 `return {...}`：`NICK_PREFIXES, NICK_SUFFIXES, composeNickname, setNickname, buildCubCardData, SUBJECT_LABELS,`
- [ ] `js/app.js` 加 `drawCubCard(data)`（比照既有 `drawStatsCard`，canvas 1080×1350、國風綠白配色、稚靈 emoji 大圖＋暱稱＋雙親科目＋主人段位）與 `shareCubCard(cubId)`：

```js
  function shareCubCard(cubId) {
    const fstate = SciFusionStore.load();
    const data = SciFusionStore.buildCubCardData(fstate, cubId, { rankLabel: rankLabel(masteredCardCount()) });
    if (!data) return;
    const canvas = drawCubCard(data);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `科學英雄稚靈-${data.displayName}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: '我的稚靈名片' }); return; } catch { /* 取消或失敗→落回下載 */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    });
  }
```

- [ ] 跑 `node --test test/logic.test.mjs` 到全綠（canvas/DOM 層不進單元測試，由 Task 9 smoke 覆蓋）
- [ ] Commit：`git commit -am "feat(融合): 稚靈暱稱（預設詞庫組合）＋名片分享卡（share/下載雙軌）"`

---

## Task 9：融合坊 UI＋app.js 接線＋smoke

**Files**
- 修改 `js/app.js`（融合坊 overlay 渲染＋開關接線）
- 修改 `index.html`（融合坊入口按鈕＋overlay 骨架）
- 修改 `css/style.css`（融合坊樣式段）
- 修改 `test/smoke.mjs`（加融合坊開啟與圖鑑檢查步驟）

**Interfaces**
- Produces（app.js 內）：`openFusionLab()`／`renderFusionLab()`／`closeFusionLab()`；融合坊各狀態渲染函式
- Consumes：`SciFusionStore` 全部公開函式；`SciBattle.masteredBySubject`／`companionForSubject`；`SciQuiz.buildQuestion`（隱藏題）；`currentPool`／`subjectTerms`（供 `buildRevealQuestion` 的 `poolsBySubject`）

**UI 流程規格（融合坊 overlay 要覆蓋的畫面狀態）**

1. **融合坊首頁**：頂欄顯示晶能餘額（`SciFusionStore.crystalBalance()`）＋今日融合次數 `fuseCount / MAX_FUSE_PER_DAY`。四科精靈條（`companionForSubject` 各科當前階與 emoji，標「已滿階 ✓」）。六格稚靈配對牆：每格顯示配對雙科；已孵化→顯示 emoji＋`displayName`；未孵化但已揭曉（`getFusionPreview.known`）→顯示真身 emoji＋名＋設定文案＋「融合」按鈕；未揭曉→剪影＋「？？？」＋「解謎揭曉」按鈕。
2. **解謎面板**：點「解謎揭曉」→ `buildRevealQuestion(a, b, poolsBySubject)` 出四選一題（`poolsBySubject` 由 `subjectTerms` map 提供）→ 作答經 `recordAnswer`（照樣記進學習量！隱藏題也是真練習）→ 答對呼叫 `revealPair`＋`save`＋播揭曉動效並回配對牆顯示真身；答錯給鼓勵台詞、可再試（無資源損失）。
3. **融合執行**：資格通過（`canFuse.ok`）且晶能 ≥`FUSE_COST` 時「融合」可按 → 確認 → `fuse(fstate, state, a, b, { today, meta:{maxBox} })` → `SciFusionStore.save(fstate)`。成功：播 `cub.bornLine`＋稚靈揭曉動效 → 提供「幫牠取名」（兩個下拉：`NICK_PREFIXES`／`NICK_SUFFIXES` 組合，非自由輸入，`setNickname`）與「產生名片」（`shareCubCard`）。失敗：顯示 `line`＋「返還 N 晶能」，**不出現任何損失清單**，只顯示晶能餘額變化。資格未過：按鈕禁用並列出 `reasons` 對應的中文提示（`master:biology`→「國中生物尚未精通滿 100 張」、`accuracy:nature`→「國小自然近期正確率未達 80%」）。
4. **稚靈收藏區**：`listCubs` 列表，每隻可「隨行出戰」（`setActiveCub`/`clearActiveCub`，單選）、「改暱稱」、「看名片」。隨行中的稚靈打標記；隨行狀態即時反映到對戰分頁的助戰。
5. 所有插入 innerHTML 的動態字串走跳脫（比照現站慣例；稚靈名皆來自常數、暱稱來自白名單組合，風險低但仍不直接內插使用者可控字串）。

**Steps**

- [ ] `index.html`：在 `<main>` 內 `io-row` 附近加入口按鈕與 overlay 骨架（overlay 預設 `hidden`）：

```html
<button id="fusion-lab-btn" class="io-btn">🧬 精靈融合坊</button>
<!-- ...既有內容... -->
<div id="fusion-overlay" class="fusion-overlay" hidden>
  <div class="fusion-panel" role="dialog" aria-modal="true" aria-label="精靈融合坊">
    <div class="fusion-head">
      <h2>🧬 精靈融合坊</h2>
      <span class="fusion-crystals">晶能 <b id="fusion-crystal-balance">0</b></span>
      <button id="fusion-close" type="button" aria-label="關閉融合坊">✕</button>
    </div>
    <div id="fusion-body"></div>
  </div>
</div>
```

- [ ] `js/app.js`：新增 `openFusionLab/renderFusionLab/closeFusionLab` 依上方流程規格實作；在 `wireIoButtons()` 內綁 `#fusion-lab-btn`→`openFusionLab`、`#fusion-close`→`closeFusionLab`。`renderFusionLab` 用 `subjectTerms`（Map）組 `poolsBySubject = { nature:..., biology:..., chemphys:..., earth:... }`。每次寫入操作後 `SciFusionStore.save(fstate); renderFusionLab();`（並在餘額變動時更新 `#fusion-crystal-balance`）。融合成功/失敗的 rng 用預設 `Math.random`（不注入）。
- [ ] `css/style.css` 尾端加 `.fusion-overlay`（全螢幕遮罩、置中）／`.fusion-panel`／`.fusion-head`／`.fusion-pair-grid`（六格）／`.fusion-pair-card`／`.is-silhouette`（剪影：`filter: grayscale(1) brightness(0.4) opacity(.6)`）樣式段，配色沿用既有綠白 CSS 變數
- [ ] `test/smoke.mjs` 在弱點清單步驟後加一段（比照既有 overlay/對戰冒煙寫法）：

```js
  // 7. 融合坊：開啟→看到晶能餘額與六格配對牆→關閉
  await page.click('#fusion-lab-btn');
  await page.waitForSelector('#fusion-overlay:not([hidden])');
  const crystalTxt = await page.locator('#fusion-crystal-balance').textContent();
  if (crystalTxt == null) fails.push('融合坊未顯示晶能餘額');
  const pairCards = await page.locator('.fusion-pair-card').count();
  if (pairCards !== 6) fails.push(`融合坊配對牆應有 6 格，實得 ${pairCards}`);
  await page.click('#fusion-close');
  await page.waitForSelector('#fusion-overlay[hidden]');
  console.log('✅ 融合坊可開啟、六格配對牆渲染、可關閉');
```

- [ ] `index.html`：確認 `<script>` 順序為 store → flashcard → quiz → weak →（economy，若有）→ battle → fusion-store → app（Task 2 已插 fusion-store，本 Task 只需複查）
- [ ] 跑 `node --test test/logic.test.mjs`（全綠）與 `node test/smoke.mjs`（含新融合坊步驟綠）
- [ ] 手動驗收（本機 `python3 -m http.server` 開 index.html）：
  - 融合坊開關正常；未達資格時 `reasons` 中文提示正確、融合鈕禁用
  - DevTools 灌測試存檔（某兩科各 100 張 `box:4`＋近期 weakLog 90% 正確＋`sci_econ` balance≥30）走完：解謎 → 揭曉 → 融合成功 → 取暱稱（下拉組合）→ 名片 share/下載
  - 融合失敗路徑：安慰台詞出現、晶能退一半、四科精靈與精通進度完好無缺
  - 稚靈隨行後打一場對戰，確認 log 出現稚靈第二段追擊（-3）且 PvP 不出現稚靈助戰
- [ ] Commit：`git commit -am "feat(融合): 融合坊 UI——配對牆/解謎/融合流程/稚靈收藏＋smoke"`

---

## 自我檢查（完成所有 Task 後跑一遍）

- [ ] `node --test test/logic.test.mjs` 全綠（既有 13 條＋本計畫新增各 Task 測試）、`node test/smoke.mjs` 綠
- [ ] `node scripts/validate-all.mjs` 綠（資料未動，應維持原狀）
- [ ] grep 驗證雙親不消耗：`grep -n "state.cards" js/fusion-store.js` 應**只有唯讀存取**（`masteredBySubject` 在 battle.js；fusion-store 不寫 `state.cards`）；`fuse()` 失敗路徑只呼叫 `spendCrystals`＋`refundCrystals`，無其他扣減
- [ ] grep 驗證獨立存檔：`grep -n "science-hero:v1" js/fusion-store.js` 應**無命中**（融合狀態只寫 `sci_fusion`，不污染主存檔）
- [ ] 舊存檔相容：清 `sci_fusion` 後貼一份缺 `fuseCount`/`activeCub` 的舊 JSON，重載確認 `load()` 補齊且不炸
- [ ] 晶能 stub 驗證：在 `SciEconomy` 尚未上線的情況下（未載 `js/economy.js`）融合全流程可跑；基地計畫上線後全域 `SciEconomy` 自動接管
- [ ] 三平台部署**不在本計畫範圍**（純前端改動，聽到「部署」指令才走三平台 SOP：Vercel＋CF Pages＋Netlify）

## 美術生圖清單（開發不阻塞；先用 emoji 上線，完工後另開 codex exec 生圖批次）

風格：待與現站整體美術一起定案（現站為 emoji）。生圖走 codex exec（ChatGPT OAuth，不耗 API 額度）；≥2 張雙線並行、每張包 200s timeout、落盤驗證。UI 一律先用 emoji，圖生完再換裝（換裝時把 emoji 節點替換為 `<img src="assets/..." onerror="回落 emoji">`）。

**稚靈立繪 6 張：**

| 檔名 | 內容要點 |
|---|---|
| `cub-forestdeer.png` | 森靈鹿：苔綠鹿角綴嫩芽、Q 版幼態、腳邊冒新芽（自然×生物） |
| `cub-crystalfox.png` | 晶石狐：尾尖會變色的結晶、靈動嗅探姿、理化燒瓶意象（自然×理化） |
| `cub-windhawk.png` | 風嵐鷹：展翅乘風、羽翼帶雲與地層紋（自然×地科） |
| `cub-alchemydragon.png` | 煉金龍：幼龍體側流動化學反應光紋、生物 DNA 螺旋尾（生物×理化） |
| `cub-deepwhale.png` | 深海鯨：幽藍洋流中的幼鯨、身側地層與生態光點（生物×地科） |
| `cub-starcore.png` | 星核獸：胸口嵌微型恆星、身軀綴元素與星軌（理化×地科） |

**四科精靈終階 4 張（Lv5）：**

| 檔名 | 內容要點 |
|---|---|
| `spirit-nature-5.png` | 萬物之靈 🍀：綠意環繞、生機盎然的自然守護靈 |
| `spirit-biology-5.png` | 生命之靈 🧬：DNA 螺旋與細胞光暈環繞的生物靈 |
| `spirit-chemphys-5.png` | 元素宗靈 ⚛️：週期表符文與電光環繞的理化宗靈 |
| `spirit-earth-5.png` | 星辰之靈 🪐：行星環與礦石星象環繞的地科靈 |

（選配）`fusion-lab-bg.png` 融合坊主視覺：雙精靈環繞的能量熔爐光暈，作 overlay 頂圖。
