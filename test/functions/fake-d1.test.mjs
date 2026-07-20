import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';

test('fake-d1：prepare/bind/run/first/all 走 ?N 位置參數，四表 schema 齊備', async () => {
  const db = createFakeD1();
  await db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,?3)').bind('a', 'x', null).run();
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('a').first('v'), 'x');
  const { results } = await db.prepare('SELECT k,v FROM kv').bind().all();
  assert.deepEqual(results, [{ k: 'a', v: 'x' }]);
  assert.equal(await db.prepare('SELECT v FROM kv WHERE k=?1').bind('none').first('v'), null);
  const t = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kv','hash','list','zset') ORDER BY name").bind().all();
  assert.deepEqual(t.results.map((row) => row.name), ['hash', 'kv', 'list', 'zset']);
});

test('fake-d1：batch 依序執行', async () => {
  const db = createFakeD1();
  await db.batch([
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('a', '1'),
    db.prepare('INSERT INTO kv (k,v,exp) VALUES (?1,?2,NULL)').bind('b', '2'),
  ]);
  assert.equal(await db.prepare('SELECT COUNT(*) AS c FROM kv').bind().first('c'), 2);
});
