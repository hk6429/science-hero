import { kvFor } from '../lib/_kv.js';
import { isValidNick } from '../lib/_nick.js';

const ORIGINS = new Set([
  'https://science-hero.pages.dev',
  'https://science-hero-hk6429.vercel.app',
  'https://science-hero.netlify.app',
  'http://localhost:8788',
  'http://localhost:8765',
]);
const SUBJECTS = new Set(['nature', 'biology', 'chemphys', 'earth']);
const CLASS_CODE = /^[A-Z0-9]{4,12}$/;
const SUBMIT_RATE = 30;
const BOARD_RATE = 60;

function cors(request) {
  const requested = request.headers.get('origin');
  const origin = ORIGINS.has(requested) ? requested : 'https://science-hero.pages.dev';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

const reply = (request, value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: cors(request),
});
const codeOf = (value) => String(value ?? '').trim().toUpperCase();
const validSubject = (value) => SUBJECTS.has(value);
const keyOf = (classCode, subject) => `cb:${classCode}:${subject}`;
const ipOf = (request) => String(
  request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown',
).split(',')[0].trim();

function cleanMastered(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(999, Math.floor(number)));
}

export async function submitBoard(redis, body = {}) {
  const classCode = codeOf(body.classCode);
  const subject = body.subject;
  const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
  const mastered = cleanMastered(body.mastered);
  if (!CLASS_CODE.test(classCode) || !validSubject(subject) || !isValidNick(nick) || mastered === null) {
    return { ok: 0, error: '參數不合法' };
  }

  const key = keyOf(classCode, subject);
  const previous = Math.max(0, Math.floor(Number(await redis.hget(key, nick)) || 0));
  await redis.hset(key, { [nick]: String(Math.max(previous, mastered)) });
  return { ok: 1 };
}

export async function readBoard(redis, input = {}) {
  const classCode = codeOf(input.classCode);
  const subject = input.subject;
  if (!CLASS_CODE.test(classCode) || !validSubject(subject)) return { ok: 0, error: '參數不合法' };

  const stored = await redis.hgetall(keyOf(classCode, subject));
  const allMembers = Object.entries(stored || {})
    .map(([nick, value]) => ({ nick, mastered: Math.max(0, Math.min(999, Math.floor(Number(value) || 0))) }))
    .sort((left, right) => right.mastered - left.mastered || left.nick.localeCompare(right.nick, 'zh-Hant'));
  return {
    ok: 1,
    total: allMembers.reduce((sum, member) => sum + member.mastered, 0),
    members: allMembers.slice(0, 50),
  };
}

async function rateLimited(redis, request, operation, limit) {
  return await redis.incr(`cb:rl:${operation}:${ipOf(request)}`, 60) > limit;
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env }) {
  const redis = kvFor(env.SCIENCE_HERO_DB);
  try {
    if (await rateLimited(redis, request, 'submit', SUBMIT_RATE)) {
      return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
    }
    const body = await request.json().catch(() => ({}));
    if (body.op !== 'submit') return reply(request, { ok: 0, error: '請求不合法' }, 400);
    const result = await submitBoard(redis, body);
    return reply(request, result, result.ok ? 200 : 400);
  } catch (error) {
    console.error('classboard submit failure', error);
    return reply(request, { ok: 0, error: '服務暫時無法使用' }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  const redis = kvFor(env.SCIENCE_HERO_DB);
  try {
    if (await rateLimited(redis, request, 'board', BOARD_RATE)) {
      return reply(request, { ok: 0, error: '操作太頻繁，請稍候再試' }, 429);
    }
    const query = new URL(request.url).searchParams;
    const result = await readBoard(redis, {
      classCode: query.get('classCode'),
      subject: query.get('subject'),
    });
    return reply(request, result, result.ok ? 200 : 400);
  } catch (error) {
    console.error('classboard board failure', error);
    return reply(request, { ok: 0, error: '服務暫時無法使用' }, 500);
  }
}
