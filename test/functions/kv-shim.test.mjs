import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { kvFor } from '../../functions/lib/_kv.js';

test('kv：set/get/exists/del、物件自動 stringify、TTL 惰性過期、incr 限流桶', async () => {
  const kv = kvFor(createFakeD1());
  await kv.set('rt:a', { x: 1 });
  assert.equal(await kv.get('rt:a'), '{"x":1}');
  assert.equal(await kv.exists('rt:a'), 1);
  await kv.del('rt:a');
  assert.equal(await kv.get('rt:a'), null);
  await kv.set('rt:t', 'v', { ex: -1 });
  assert.equal(await kv.get('rt:t'), null);
  assert.equal(await kv.exists('rt:t'), 0);
  assert.equal(await kv.incr('rt:rl:x', 60), 1);
  assert.equal(await kv.incr('rt:rl:x', 60), 2);
});

test('hash：hset/hget/hgetall/hlen；list：lpush 新的在前、lrange 含端點、ltrim 保留區間', async () => {
  const kv = kvFor(createFakeD1());
  await kv.hset('rt:h', { a: '1', b: { c: 2 } });
  assert.equal(await kv.hget('rt:h', 'a'), '1');
  assert.deepEqual(await kv.hgetall('rt:h'), { a: '1', b: '{"c":2}' });
  assert.equal(await kv.hlen('rt:h'), 2);
  assert.equal(await kv.hgetall('rt:none'), null);
  await kv.lpush('rt:l', 'a'); await kv.lpush('rt:l', 'b'); await kv.lpush('rt:l', 'c');
  assert.deepEqual(await kv.lrange('rt:l', 0, 1), ['c', 'b']);
  await kv.ltrim('rt:l', 0, 0);
  assert.deepEqual(await kv.lrange('rt:l', 0, -1), ['c']);
});

test('zset：zadd/zincrby/zrange（rev、withScores）/zrem', async () => {
  const kv = kvFor(createFakeD1());
  await kv.zadd('rt:z', { score: 10, member: '甲' });
  await kv.zadd('rt:z', { score: 30, member: '乙' });
  assert.equal(await kv.zincrby('rt:z', 5, '甲'), 15);
  assert.deepEqual(await kv.zrange('rt:z', 0, -1, { rev: true }), ['乙', '甲']);
  assert.deepEqual(await kv.zrange('rt:z', 0, -1, { rev: true, withScores: true }), ['乙', 30, '甲', 15]);
  await kv.zrem('rt:z', '甲');
  assert.deepEqual(await kv.zrange('rt:z', 0, -1), ['乙']);
});
