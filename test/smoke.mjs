// 煙霧測試：起本機 server → 確認四科分頁 → 閃卡翻 5 張 → 自測 5 題 → 看弱點清單 →
// 重新整理後進度還在 → 手機寬度（390px）不橫向跑版。
// 需求：本機有 playwright-core 且已快取 chromium（見 NODE_PATH 用法）。
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer((req, res) => {
  const p = join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
console.log('server on', port);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const fails = [];
page.on('pageerror', (e) => fails.push('pageerror: ' + e.message));
// 科學基地美術資產尚未生成（emoji-first 階段），assets/base/ 底下的圖一律 404 後由 onerror 換 emoji，屬預期。
// 用 response 依 URL 精準放行「只有」assets/base/ 的 404，其餘 404（真缺檔）照樣算失敗。
page.on('response', (r) => {
  if (r.status() === 404 && !r.url().includes('/assets/base/')) fails.push('unexpected 404: ' + r.url());
});
page.on('console', (msg) => {
  // resource load 失敗（含 assets/base 佔位圖 404）改由上面的 response handler 依 URL 判斷，這裡不重複計。
  if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) fails.push('console error: ' + msg.text());
});

try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('#tabs button');
  console.log('✅ 首頁載入、分頁籤出現');

  // 生物分頁預設是 active，直接檢查內容有渲染
  await page.waitForSelector('.mode-switch button');
  console.log('✅ 生物分頁預設載入（含模式切換列）');

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

  // 4. 弱點清單（此時應該已經有作答紀錄）
  await page.click('.mode-switch button[data-mode="weak"]');
  await page.waitForSelector('.card');
  console.log('✅ 弱點清單頁可開啟');

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
  const expected = await page.evaluate((id) => `${JSON.parse(localStorage.getItem('sci_base')).placements[id].x}%`, decorId);
  if (styleLeft !== expected) fails.push(`重整後裝飾座標未還原：style=${styleLeft} 存檔=${expected}`);
  console.log('✅ 重整後基地擺設持久化還原');
} catch (e) {
  fails.push('flow error: ' + e.message);
}

await browser.close();
server.close();
if (fails.length) { console.error('SMOKE FAIL:', fails); process.exit(1); }
console.log('SMOKE ALL PASS ✅');
