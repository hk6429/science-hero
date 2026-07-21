import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const context = vm.createContext({});
vm.runInContext(
  `${readFileSync(path.join(root, 'js', 'ui-logic.js'), 'utf8')}\nglobalThis.__ui = SciUiLogic;`,
  context,
  { filename: 'ui-logic.js' },
);
const ui = context.__ui;

test('D6：新使用者的更多功能預設關閉', () => {
  assert.equal(ui.moreToolsDefaultOpen({ isNew: true }), false);
});

test('D7：「今天先這樣」收尾卡提供弱點、換科與再練一輪 CTA', () => {
  const html = ui.restCardHtml();
  assert.match(html, /data-rest-action="weak"[^>]*>看今日弱點/);
  assert.match(html, /data-rest-action="subject"[^>]*>換一科/);
  assert.match(html, /data-rest-action="restart"[^>]*>再練一輪/);
});

test('D9：未指定科目時預設國小自然，有效 subject 參數仍優先', () => {
  const available = ['nature', 'biology', 'chemphys', 'earth'];
  assert.equal(ui.resolveInitialSubject(null, available), 'nature');
  assert.equal(ui.resolveInitialSubject('earth', available), 'earth');
  assert.equal(ui.resolveInitialSubject('unknown', available), 'nature');
});
