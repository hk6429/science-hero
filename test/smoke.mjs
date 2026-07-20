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
page.on('console', (msg) => { if (msg.type() === 'error') fails.push('console error: ' + msg.text()); });

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
    await page.waitForTimeout(2000); // 答錯現在會多停留顯示正確答案，需等長一點
  }
  console.log('✅ 自測 5 題');

  // 3. 弱點清單（此時應該已經有作答紀錄）
  await page.click('.mode-switch button[data-mode="weak"]');
  await page.waitForSelector('.card');
  console.log('✅ 弱點清單頁可開啟');

  // 4. 重新整理後進度還在（localStorage 應保留 totalReviews > 0）
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('science-hero:v1')).stats.totalReviews);
  await page.reload();
  await page.waitForSelector('#tabs button');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('science-hero:v1')).stats.totalReviews);
  if (!(before > 0 && after === before)) fails.push(`重新整理後進度未保留：before=${before} after=${after}`);
  console.log('✅ 重新整理後進度保留（totalReviews=' + after + '）');

  // 5. 手機寬度不橫向跑版
  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
  if (overflow) fails.push('390px 出現橫向捲動');
  else console.log('✅ 390px 無橫向捲動');
} catch (e) {
  fails.push('flow error: ' + e.message);
}

await browser.close();
server.close();
if (fails.length) { console.error('SMOKE FAIL:', fails); process.exit(1); }
console.log('SMOKE ALL PASS ✅');
