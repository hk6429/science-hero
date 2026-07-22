import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeD1 } from '../fake-d1.mjs';
import { onRequestGet, onRequestPost } from '../../functions/api/classboard.js';

const origin = 'https://science-hero.pages.dev';
const makeEnv = () => ({ SCIENCE_HERO_DB: createFakeD1() });

function submit(env, body, ip = '1.2.3.4') {
  return onRequestPost({
    request: new Request('http://x/api/classboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, origin },
      body: JSON.stringify({ op: 'submit', ...body }),
    }),
    env,
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

function board(env, params, ip = '1.2.3.4') {
  const url = new URL('http://x/api/classboard');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return onRequestGet({
    request: new Request(url, { headers: { 'cf-connecting-ip': ip, origin } }),
    env,
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

test('同一暱稱重複提交只保留最高精通數', async () => {
  const env = makeEnv();
  assert.equal((await submit(env, { classCode: '701A', subject: 'biology', nick: '好奇的電子01', mastered: 12 })).body.ok, 1);
  assert.equal((await submit(env, { classCode: '701A', subject: 'biology', nick: '好奇的電子01', mastered: 7 })).body.ok, 1);
  assert.equal((await submit(env, { classCode: '701A', subject: 'biology', nick: '好奇的電子01', mastered: 19 })).body.ok, 1);

  assert.deepEqual((await board(env, { classCode: '701A', subject: 'biology' })).body, {
    ok: 1,
    total: 19,
    members: [{ nick: '好奇的電子01', mastered: 19 }],
  });
});

test('班級總精通量是全班成員和，個人貢獻依精通數降序', async () => {
  const env = makeEnv();
  await submit(env, { classCode: '802B', subject: 'earth', nick: '勇敢的火山', mastered: 8 });
  await submit(env, { classCode: '802B', subject: 'earth', nick: '沉穩的石英', mastered: 21 });
  await submit(env, { classCode: '802B', subject: 'earth', nick: '敏銳的光子', mastered: 13 });

  const result = await board(env, { classCode: '802B', subject: 'earth' });
  assert.equal(result.body.total, 42);
  assert.deepEqual(result.body.members, [
    { nick: '沉穩的石英', mastered: 21 },
    { nick: '敏銳的光子', mastered: 13 },
    { nick: '勇敢的火山', mastered: 8 },
  ]);
});

test('Round4-14：班級榜接受 nature 與三個國中科目，其他科目仍拒絕', async () => {
  const env = makeEnv();
  for (const subject of ['nature', 'biology', 'chemphys', 'earth']) {
    const submitted = await submit(env, { classCode: '701A', subject, nick: '好奇的電子', mastered: 5 });
    assert.equal(submitted.body.ok, 1, `${subject} 應可加入班級榜`);
  }
  for (const subject of ['math', '']) {
    const submitted = await submit(env, { classCode: '701A', subject, nick: '好奇的電子', mastered: 5 });
    assert.deepEqual([submitted.status, submitted.body.ok, submitted.body.error], [400, 0, '參數不合法']);
    const loaded = await board(env, { classCode: '701A', subject });
    assert.deepEqual([loaded.status, loaded.body.ok, loaded.body.error], [400, 0, '參數不合法']);
  }
});

test('暱稱必須通過既有形容詞加名詞白名單，班級碼必須是短英數碼', async () => {
  const env = makeEnv();
  for (const nick of ['', '王小明', '好奇的量子', '好奇的電子123']) {
    const result = await submit(env, { classCode: '701A', subject: 'biology', nick, mastered: 5 });
    assert.deepEqual([result.status, result.body.ok, result.body.error], [400, 0, '參數不合法']);
  }
  for (const classCode of ['', 'A2', '七年一班', 'CLASS-CODE-TOO-LONG']) {
    const result = await submit(env, { classCode, subject: 'biology', nick: '好奇的電子', mastered: 5 });
    assert.deepEqual([result.status, result.body.ok, result.body.error], [400, 0, '參數不合法']);
  }
});

test('mastered 會取整數並 clamp 在 0 到 999，非數值則拒絕', async () => {
  const env = makeEnv();
  await submit(env, { classCode: '903C', subject: 'chemphys', nick: '冷靜的磁鐵', mastered: -12 });
  await submit(env, { classCode: '903C', subject: 'chemphys', nick: '熱血的火山', mastered: 5000 });
  await submit(env, { classCode: '903C', subject: 'chemphys', nick: '機智的彗星', mastered: 7.9 });
  const invalid = await submit(env, { classCode: '903C', subject: 'chemphys', nick: '閃亮的恐龍', mastered: '不是數字' });
  assert.equal(invalid.status, 400);

  const result = await board(env, { classCode: '903C', subject: 'chemphys' });
  assert.deepEqual(result.body.members, [
    { nick: '熱血的火山', mastered: 999 },
    { nick: '機智的彗星', mastered: 7 },
    { nick: '冷靜的磁鐵', mastered: 0 },
  ]);
  assert.equal(result.body.total, 1006);
});

test('submit 與 board 都有獨立的每 IP 每分鐘限流', async () => {
  const submitEnv = makeEnv();
  let submitted;
  for (let index = 0; index < 31; index += 1) {
    submitted = await submit(submitEnv, {
      classCode: '701A', subject: 'biology', nick: '好奇的電子', mastered: index,
    }, '10.0.0.1');
  }
  assert.deepEqual([submitted.status, submitted.body.ok, submitted.body.error], [429, 0, '操作太頻繁，請稍候再試']);

  const boardEnv = makeEnv();
  let loaded;
  for (let index = 0; index < 61; index += 1) {
    loaded = await board(boardEnv, { classCode: '701A', subject: 'biology' }, '10.0.0.2');
  }
  assert.deepEqual([loaded.status, loaded.body.ok, loaded.body.error], [429, 0, '操作太頻繁，請稍候再試']);
});

test('個人列表最多 50 人，但班級總量包含所有自願加入的成員', async () => {
  const env = makeEnv();
  for (let index = 0; index < 51; index += 1) {
    const nick = `好奇的電子${String(index).padStart(2, '0')}`;
    const result = await submit(env, {
      classCode: '701A', subject: 'biology', nick, mastered: index + 1,
    }, `10.1.0.${index}`);
    assert.equal(result.body.ok, 1);
  }
  const result = await board(env, { classCode: '701A', subject: 'biology' }, '10.2.0.1');
  assert.equal(result.body.members.length, 50);
  assert.equal(result.body.total, 1326);
  assert.equal(result.body.members[0].mastered, 51);
});

test('內部失敗只回傳通用錯誤，不外洩例外細節', async () => {
  const internalDetail = 'secret-internal-detail';
  const brokenEnv = {
    SCIENCE_HERO_DB: { prepare() { throw new Error(internalDetail); } },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await board(brokenEnv, { classCode: '701A', subject: 'biology' });
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { ok: 0, error: '服務暫時無法使用' });
    assert.equal(JSON.stringify(result.body).includes(internalDetail), false);
  } finally {
    console.error = originalError;
  }
});
