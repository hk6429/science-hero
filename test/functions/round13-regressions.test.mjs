import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = (file) => readFileSync(path.join(ROOT, file), 'utf8');

test('B：無盡巡禮里程碑使用專屬回彈動畫，並保留置中與堆疊位移', () => {
  const css = source('css/style.css');
  assert.match(
    css,
    /\.first-success\.endless-milestone-toast\.celebrate-in\s*\{[^}]*animation:\s*endlessMilestoneIn\s+\.5s\s+cubic-bezier\(\.2,\s*\.9,\s*\.3,\s*1\.25\)/s,
    '里程碑 selector 必須比共用 first-success 動畫更具特異度',
  );

  const start = css.indexOf('@keyframes endlessMilestoneIn');
  const end = css.indexOf('\n}', start);
  const keyframes = css.slice(start, end + 2);
  assert.match(
    keyframes,
    /0%\s*\{[^}]*transform:\s*translate\(-50%,\s*var\(--stack-offset,\s*0px\)\)\s*scale\(\.72\)/s,
    '0% 必須維持水平置中與吐司堆疊位移',
  );
  assert.match(
    keyframes,
    /100%\s*\{[^}]*transform:\s*translate\(-50%,\s*var\(--stack-offset,\s*0px\)\)\s*scale\(1\)/s,
    '100% 必須維持水平置中與吐司堆疊位移',
  );
});

test('C：融合成功與元靈降臨揭曉卡會播放慶祝進場動畫', () => {
  const css = source('css/style.css');
  assert.match(
    css,
    /\.fusion-notice\.celebrate-in\s*\{[^}]*animation:\s*celebrateIn\s+0\.35s\s+ease-out/s,
    'fusion-notice 的 celebrate-in 必須綁定可執行的進場動畫',
  );
});
