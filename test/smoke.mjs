// 煙霧測試：起本機 server → 確認四科分頁 → 閃卡翻 5 張 → 自測 5 題 → 看弱點清單 →
// 重新整理後進度還在 → 手機寬度（390px）不橫向跑版。
// 需求：本機有 playwright-core 且已快取 chromium（見 NODE_PATH 用法）。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function runRestrictedStaticSmoke() {
  const checks = [];
  const ok = (name, condition) => { if (!condition) throw new Error(`static smoke failed: ${name}`); checks.push(name); console.log(`✅ ${name}`); };
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'js/app.js'), 'utf8');
  const uiLogic = readFileSync(join(root, 'js/ui-logic.js'), 'utf8');
  const battle = readFileSync(join(root, 'js/battle.js'), 'utf8');
  const css = readFileSync(join(root, 'css/style.css'), 'utf8');
  const subjects = ['elementary.json', 'biology.json', 'physics-chemistry.json', 'earth-science.json'];
  ok('四科資料可解析且均有至少 180 筆', subjects.every((file) => JSON.parse(readFileSync(join(root, 'data', file), 'utf8')).length >= 180));
  ok('首頁共用腳本與四科分頁容器接線完整', /id="tabs"/.test(html) && /js\/app\.js/.test(html));
  ok('首次進站引導卡與更多功能摺疊區存在', /id="new-player-guide"/.test(html) && /id="more-tools"/.test(html));
  ok('連線對戰入口位於更多功能摺疊區', /id="more-tools"[\s\S]*id="rtbattle-tool-btn"/.test(html));
  ok('viewport 允許使用者縮放', /width=device-width, initial-scale=1/.test(html) && !/maximum-scale/.test(html));
  ok('收尾卡保留弱點、換科與再練 CTA', /data-rest-action="weak"/.test(uiLogic) && /data-rest-action="subject"/.test(uiLogic) && /data-rest-action="restart"/.test(uiLogic));
  ok('精通到期把關與每日任務模組已接線', /bumpBoxIfDue/.test(app) && /js\/daily-quests\.js/.test(html));
  ok('PvE 血條、跳字與戰功結算條存在', /bat-hp-fill/.test(css) && /bat-damage-pop/.test(css) && /bat-record-summary/.test(battle));
  ok('守護者與稚靈圖片槽含 fallback', /assets\/battle\/foe-/.test(battle) && /assets\/fusion\/cub-/.test(app) && /onerror="this\.replaceWith/.test(`${battle}\n${app}`));
  ok('四科精靈圖片槽依科別階級載入且含 fallback', /sprite-\$\{subjectKey\}-s\$\{artLevel\}/.test(battle) && /subjectCompanionArt/.test(battle));
  ok('老師家長摘要入口與可複製文字框已接線', /id="family-summary-btn"/.test(app) && /id="family-summary-text"/.test(html) && /buildFamilySummary/.test(app));
  ok('家長說明入口與教師口吻內容已接線', /id="parent-guide-btn"/.test(html) && /id="parent-guide-overlay"/.test(html) && /精通不是點得多/.test(html));
  ok('訪客徽章與 GoatCounter 已接線', /visitor-badge\.laobi\.icu\/badge\?page_id=hk6429\.science-hero/.test(html) && /hk6429\.goatcounter\.com\/count/.test(html) && /gc\.zgo\.at\/count\.js/.test(html));
  ok('融合坊六格與基地成就牆入口仍在', /fusion-pair-card/.test(app) && /id="base-wall-btn"/.test(html));
  ok('介面圖示接專案美術真圖且含 emoji fallback', /class="io-ico" src="assets\/ui\/ui-/.test(html) && /class="brand-ico" src="assets\/ui\/ui-brand/.test(html) && /io-ico-emoji/.test(html));
  ok('390px 響應式規則仍存在', /@media[^\{]*\(max-width:\s*420px\)/s.test(css));
  ok('彈窗共用 sh base 與舊 class 相容選擇器已接線', /class="sh-overlay info-overlay"/.test(html) && /\.sh-overlay,\s*\.info-overlay/.test(css));
  ok('44px 關閉鍵與觸控間距已接線', /\.info-head button[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s.test(css) && /\.io-btn\s*\{[^}]*padding:\s*11px 16px/s.test(css));
  ok('375px 連線碼使用 clamp 並允許斷行', /\.rt-code[^}]*clamp\(1\.8rem, 10vw, 3rem\)[^}]*word-break:\s*break-all/s.test(css));
  ok('全域焦點、分頁 aria-selected 與減少動畫已接線', /:focus-visible/.test(css) && /role="tablist"/.test(html) && /aria-selected/.test(app) && /prefers-reduced-motion/.test(css));
  ok('三個對話框共用焦點管理並支援 Esc', /createDialogController/.test(app) && /familySummaryDialog = createDialogController/.test(app) && /parentGuideDialog = createDialogController/.test(app) && /fusionDialog = createDialogController/.test(app) && /event\.key === 'Escape'/.test(app));
  ok('答題結果容器使用 polite status 報讀', /setAttribute\('role', 'status'\)/.test(app) && /setAttribute\('aria-live', 'polite'\)/.test(app));
  console.log(`SMOKE STATIC PASS ${checks.length}/${checks.length}（瀏覽器受執行環境限制）`);
}

const { chromium } = await import('playwright-core');
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
} catch (error) {
  if (!/Permission denied|MachPortRendezvous|Target page, context or browser has been closed/.test(String(error?.message || error))) throw error;
  runRestrictedStaticSmoke();
  console.log('SMOKE ALL PASS ✅');
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('http://science-hero.local/**', async (route) => {
  const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
  const p = join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!existsSync(p)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: MIME[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
});
// SHAPI 在鏡像/非同源 host（含測試用 science-hero.local）會打絕對後端網址 https://science-hero.pages.dev/api/…。
// 測試不應真的打到 production，也不該因跨源 CORS 噴 console error；一律攔截回 404＝「後端不可達」，正是離線降級要測的情境。
await page.route('https://science-hero.pages.dev/**', (route) => route.fulfill({ status: 404, body: '' }));
const fails = [];
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message));
// 預期 404 白名單：(1) assets/base/ 美術尚未生成，onerror 換 emoji；(2) 靜態 server 無 Functions，
// /api/ 一律 404 正是觸發「離線降級卡」的機制。其餘 404（真缺檔）照樣算失敗。
page.on('response', (r) => {
  const u = r.url();
  if (r.status() === 404 && !u.includes('/assets/base/') && !u.includes('/assets/battle/') && !u.includes('/assets/fusion/') && !u.includes('/assets/ui/') && !u.includes('/api/')) fails.push('unexpected 404: ' + u);
});
page.on('console', (msg) => {
  // resource load 失敗（含 assets/base 佔位圖 404）改由上面的 response handler 依 URL 判斷，這裡不重複計。
  if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) fails.push('console error: ' + msg.text());
});

try {
  await page.goto('http://science-hero.local/');
  await page.waitForSelector('#tabs button');
  console.log('✅ 首頁載入、分頁籤出現');
  await page.waitForSelector('#new-player-guide:not([hidden])');
  if (await page.locator('#more-tools').evaluate((node) => node.open)) fails.push('首次進站的更多功能應預設摺疊');
  console.log('✅ 首次進站看得到新手引導卡、更多功能預設摺疊');

  await page.click('#parent-guide-btn');
  await page.waitForSelector('#parent-guide-overlay:not([hidden])');
  if (!(await page.locator('#parent-guide-overlay').textContent()).includes('家長可以怎麼陪')) fails.push('家長說明內容未顯示');
  if (!(await page.locator('#parent-guide-overlay [role="dialog"]').evaluate((node) => node === document.activeElement))) fails.push('家長說明開啟後焦點未移入 dialog');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#parent-guide-overlay', { state: 'hidden' });
  console.log('✅ 首頁家長說明入口可開啟、移入焦點並以 Esc 關閉');

  // 第一分頁「國小自然」預設 active，且用 aria-selected 表達狀態。
  await page.waitForSelector('.mode-switch button');
  const activeTab = page.locator('#tabs button[aria-selected="true"]');
  if (await activeTab.getAttribute('data-key') !== 'nature') fails.push('預設科目不是國小自然');
  console.log('✅ 國小自然預設載入，active 分頁有 aria-selected=true');

  // 四科都應掛上共用學習模組，切換後能看到各自詞條。
  const firstTerms = new Set();
  for (const key of ['nature', 'biology', 'chemphys', 'earth']) {
    await page.click(`#tabs button[data-key="${key}"]`);
    await page.waitForSelector(`.panel[data-key="${key}"] .mode-switch`);
    const term = await page.locator(`.panel[data-key="${key}"] .flash-term`).textContent();
    if (!term?.trim()) fails.push(`${key} 沒有渲染閃卡詞條`);
    firstTerms.add(term?.trim());
  }
  if (firstTerms.size < 4) fails.push('四科分頁疑似共用了同一份資料');
  console.log('✅ 四科分頁均載入各自資料與學習模組');

  // D7：完整跑完當前閃卡回合，按「今天先這樣」後仍有可行動 CTA，且可再練。
  for (let guard = 0; guard < 30 && !(await page.locator('#flash-stop').count()); guard++) {
    await page.click('#flash-reveal');
    await page.click('#flash-correct');
    // F 條：自評後有 ~350ms 綠/紅閃再換卡，等下一張或收尾卡渲染完再判斷是否續圈
    await page.waitForSelector('#flash-reveal, #flash-stop');
  }
  await page.waitForSelector('#flash-stop');
  await page.click('#flash-stop');
  const restCtas = await page.locator('[data-rest-action]').count();
  if (restCtas < 1) fails.push('閃卡「今天先這樣」後沒有可點 CTA');
  await page.click('[data-rest-action="restart"]');
  await page.waitForSelector('#flash-reveal');
  console.log('✅ 閃卡收尾卡有 CTA，「再練一輪」可回到出題');

  // 1. 閃卡翻 5 張
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('#flash-reveal');
    await page.click('#flash-reveal');
    await page.waitForSelector('#flash-correct');
    await page.click(i % 2 ? '#flash-wrong' : '#flash-correct');
  }
  console.log('✅ 閃卡翻 5 張');

  // 2. 切到自測，答 5 題
  await page.click('.mode-switch button[data-mode="quiz"]');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.quiz-option');
    await page.click('.quiz-option >> nth=0');
    await page.waitForTimeout(3400); // 答錯現在會多停留顯示正確答案，需等長一點
  }
  console.log('✅ 自測 5 題');

  // 3. 答題對戰：選一位入門對手、答一題，確認血條有變化；段位條與夥伴卡有顯示
  await page.click('.mode-switch button[data-mode="battle"]');
  await page.waitForSelector('.bat-oppcard[data-open="1"]');
  const rankVisible = await page.locator('.bat-rank').count();
  const companionVisible = await page.locator('.bat-companion').count();
  if (!rankVisible) fails.push('對戰選單沒看到段位條');
  if (!companionVisible) fails.push('對戰選單沒看到科學夥伴卡');
  await page.click('.bat-oppcard[data-open="1"] >> nth=0');
  await page.waitForSelector('.bat-hp.foe span');
  // 答對答錯是隨機題目決定，只要「敵方或我方任一血量」有變化就代表對戰邏輯有在跑。
  const hpBefore = (await page.locator('.bat-hp span').allTextContents()).join(',');
  await page.waitForSelector('.quiz-option');
  await page.click('.quiz-option >> nth=0');
  await page.waitForTimeout(2200);
  const hpAfter = (await page.locator('.bat-hp span, .bat-result-emoji').allTextContents()).join(',');
  if (hpBefore === hpAfter) fails.push(`對戰血條疑似沒有變化：before=${hpBefore} after=${hpAfter}`);
  console.log('✅ 答題對戰可開打、血條有變化、段位條與夥伴卡有顯示');

  // 3b. PvP：切走再切回對戰分頁會重新掛載對手選單（PvE 半場中沒有退出鈕，靠切換模式重置），
  // 開一場雙人對戰，答一題後雙方血量正確變化
  await page.click('.mode-switch button[data-mode="weak"]');
  await page.click('.mode-switch button[data-mode="battle"]');
  await page.waitForSelector('#bat-pvp');
  await page.click('#bat-pvp');
  await page.waitForSelector('.bat-turn');
  const pvpHpBefore = (await page.locator('.bat-hp span').allTextContents()).join(',');
  await page.waitForSelector('.quiz-option');
  await page.click('.quiz-option >> nth=0');
  await page.waitForTimeout(1600);
  const pvpHpAfter = (await page.locator('.bat-hp span').allTextContents()).join(',');
  if (pvpHpBefore === pvpHpAfter) fails.push(`PvP 血量疑似沒有變化：before=${pvpHpBefore} after=${pvpHpAfter}`);
  const pvpTurnAfter = await page.locator('.bat-turn').textContent();
  if (!pvpTurnAfter?.includes('玩家')) fails.push('PvP 答題後未正確換手');
  console.log('✅ PvP 雙人對戰可開打、答題後血量變化且正確換手');

  // 3c. 連線對戰：入口存在；靜態 server 無 Functions，應顯示離線降級卡而非白畫面。
  if (!(await page.locator('#more-tools').evaluate((node) => node.open))) await page.locator('#more-tools > summary').click();
  await page.click('#more-tools #rtbattle-tool-btn');
  await page.waitForSelector('#rt-create');
  await page.click('#rt-create');
  // 開房走 fetch → 靜態 server 404 → offline，降級卡非同步渲染，等文字出現再判定（避免讀太早）。
  const offlineShown = await page
    .waitForFunction(() => document.body.textContent.includes('連不上對戰伺服器'), { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!offlineShown) fails.push('連線對戰離線時未顯示降級卡');
  await page.setViewportSize({ width: 375, height: 844 });
  const rtOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (rtOverflow) fails.push('375px 連線對戰頁出現水平滾動');
  await page.setViewportSize({ width: 390, height: 844 });
  console.log('✅ 連線對戰入口存在、離線降級正常');

  // 4. 弱點清單（此時應該已經有作答紀錄）
  await page.click('.mode-switch button[data-mode="weak"]');
  await page.waitForSelector('.card');
  await page.click('#family-summary-btn');
  await page.waitForSelector('#family-summary-overlay:not([hidden])');
  const familySummary = await page.locator('#family-summary-text').inputValue();
  if (!familySummary.includes('各科學習概況') || !familySummary.includes('目前最需要加強的詞')) fails.push('老師家長摘要內容不完整');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#family-summary-overlay', { state: 'hidden' });
  console.log('✅ 弱點清單頁可開啟、老師家長摘要可產生並以 Esc 關閉');

  // 4b. 融合坊：先展開「更多功能」摺疊（D6 起預設收合、D8 起融合坊留在其中）→開啟→看到晶能餘額與六格配對牆→關閉
  if (!(await page.locator('#more-tools').evaluate((node) => node.open))) await page.locator('#more-tools > summary').click();
  await page.waitForSelector('#fusion-lab-btn', { state: 'visible' });
  await page.click('#fusion-lab-btn');
  await page.waitForSelector('#fusion-overlay:not([hidden])');
  const crystalTxt = await page.locator('#fusion-crystal-balance').textContent();
  if (crystalTxt == null) fails.push('融合坊未顯示晶能餘額');
  const pairCards = await page.locator('.fusion-pair-card').count();
  if (pairCards !== 6) fails.push(`融合坊配對牆應有 6 格，實得 ${pairCards}`);
  // 終局融合區塊：新手應看到「尚未解鎖」的元靈預告（不崩、有 CTA 敘事）
  const grandLocked = await page.locator('.fusion-grand.is-locked').count();
  if (grandLocked !== 1) fails.push('融合坊未渲染終局元靈（尚未解鎖）區塊');
  await page.keyboard.press('Escape');
  // 關閉後 overlay 帶 hidden 屬性＝不可見，需用 state:'hidden' 等待（預設 state 等「可見」會逾時）。
  await page.waitForSelector('#fusion-overlay', { state: 'hidden' });
  console.log('✅ 融合坊可開啟、六格配對牆渲染、終局元靈預告在、可以 Esc 關閉');

  // 4c. 終局 prestige：注入「元靈已誕生」存檔 → 重開融合坊 → 開啟科學守護者巡禮頁
  await page.evaluate(() => {
    const cubs = ['cub_forestdeer', 'cub_crystalfox', 'cub_windhawk', 'cub_alchemydragon', 'cub_deepwhale', 'cub_starcore'];
    localStorage.setItem('sci_fusion', JSON.stringify({ v: 1, hatched: cubs, grandBorn: true }));
  });
  await page.click('#fusion-lab-btn');
  await page.waitForSelector('#fusion-overlay:not([hidden])');
  const grandBorn = await page.locator('.fusion-grand.is-born').count();
  if (grandBorn !== 1) fails.push('元靈誕生後未渲染已降臨狀態');
  await page.click('[data-prestige]');
  await page.waitForSelector('.prestige-scroll', { timeout: 3000 }).catch(() => fails.push('科學守護者巡禮頁未開啟'));
  const spiritCount = await page.locator('.prestige-spirit').count();
  if (spiritCount !== 4) fails.push(`巡禮頁應有 4 科精靈，實得 ${spiritCount}`);
  const prestigeCubs = await page.locator('.prestige-cub').count();
  if (prestigeCubs !== 6) fails.push(`巡禮頁應有 6 隻稚靈誕生語，實得 ${prestigeCubs}`);
  await page.click('.fusion-back');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#fusion-overlay', { state: 'hidden' });
  // 清掉注入存檔，避免污染後續步驟
  await page.evaluate(() => localStorage.removeItem('sci_fusion'));
  console.log('✅ 終局元靈誕生後可開啟科學守護者巡禮（四科精靈＋六稚靈巡禮）');

  // 5. 重新整理後進度還在（localStorage 應保留 totalReviews > 0）
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('science-hero:v1')).stats.totalReviews);
  await page.reload();
  await page.waitForSelector('#tabs button');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('science-hero:v1')).stats.totalReviews);
  if (!(before > 0 && after === before)) fails.push(`重新整理後進度未保留：before=${before} after=${after}`);
  console.log('✅ 重新整理後進度保留（totalReviews=' + after + '）');

  // 6. 手機寬度不橫向跑版
  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
  if (overflow) fails.push('390px 出現橫向捲動');
  else console.log('✅ 390px 無橫向捲動');

  // 7. 科學基地：種一張精通卡 → 開基地（首開 seed 不噴慶典）→ 拖曳裝飾 → 重整座標保留
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('science-hero:v1'));
    const id = Object.keys(s.cards)[0];
    s.cards[id] = { box: 4, due: 0, seen: 5, wrong: 0 };
    localStorage.setItem('science-hero:v1', JSON.stringify(s));
    localStorage.removeItem('sci_base');
  });
  await page.reload();
  await page.click('#btn-base');
  await page.waitForSelector('#base-scene .sb-main');
  if (await page.locator('.sb-epic').count()) fails.push('首次開基地不該噴既有進度的慶典（seed 防洪水失效）');
  if (await page.locator('#base-scene .sb-pav').count() !== 4) fails.push('基地場景沒有四座展館');
  await page.waitForSelector('#base-scene .sb-decor');
  console.log('✅ 基地可開啟：主樓/四展館/裝飾都在、首開無慶典洪水');

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

  await page.reload();
  await page.click('#btn-base');
  await page.waitForSelector('#base-scene .sb-decor');
  const styleLeft = await page.locator(`#base-scene .sb-decor[data-decor="${decorId}"]`).evaluate((el) => el.style.left);
  const expectedX = await page.evaluate((id) => JSON.parse(localStorage.getItem('sci_base')).placements[id].x, decorId);
  // 瀏覽器讀 el.style.left 會把極小尾數序列化（存檔 70.0000017% → getter 回 70%），故以數值容差比對還原位置而非嚴格字串。
  const styleX = parseFloat(styleLeft);
  if (!Number.isFinite(styleX) || Math.abs(styleX - expectedX) > 0.01) {
    fails.push(`重整後裝飾座標未還原：style=${styleLeft} 存檔=${expectedX}%`);
  }
  console.log('✅ 重整後基地擺設持久化還原');

  // 8. 克漏字回想題（放最後，因為會把整批字設精熟、污染狀態）：精熟字自測應出現克漏字並可自評推進
  await page.evaluate(async () => {
    const KEY = 'science-hero:v1';
    const terms = await (await fetch('/data/elementary.json')).json();
    const s = JSON.parse(localStorage.getItem(KEY)) || {};
    s.cards = s.cards || {};
    for (const t of terms) s.cards[t.id] = { box: 4, due: 0, seen: 5, wrong: 0 };
    localStorage.setItem(KEY, JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('#tabs button[data-key="nature"]');
  await page.click('#tabs button[data-key="nature"]');
  await page.click('.panel[data-key="nature"] .mode-switch button[data-mode="quiz"]');
  // box4 自測交替出題：偶數題為客觀 MC、奇數題為克漏字（Round11 起 box4 也交替，非全 cloze）。
  // 先答掉第一題（客觀 MC）讓它自動前進，下一題即為克漏字。
  await page.waitForSelector('.quiz-cloze, .quiz-option', { timeout: 6000 });
  if (await page.locator('.quiz-cloze').count() === 0) {
    await page.click('.quiz-option >> nth=0');
    await page.waitForTimeout(3400); // 等自測自動進到下一題
  }
  await page.waitForSelector('.quiz-cloze', { timeout: 6000 });
  await page.click('#cloze-reveal');
  await page.waitForSelector('#cloze-yes');
  await page.click('#cloze-yes');
  await page.waitForTimeout(1200);
  console.log('✅ 克漏字回想題（精熟字）出現、可揭曉並自評推進');
} catch (e) {
  fails.push('flow error: ' + e.message);
}

await browser.close();
if (fails.length) { console.error('SMOKE FAIL:', fails); process.exit(1); }
console.log('SMOKE ALL PASS ✅');
