#!/usr/bin/env node
// 驗證 data/biology.json：schema、內容邏輯、誘答池健全度。
// 任何一項失敗都會讓 process exit code = 1，供 CI / 手動跑當硬性關卡。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'biology.json');

const REQUIRED_FIELDS = ['id', 'term', 'unit', 'grade', 'def', 'example', 'category', 'distractor_pool'];
const VALID_UNITS = new Set(['cell', 'body', 'repro_gene', 'evo_classify', 'ecology']);
const VALID_GRADES = new Set(['7', '8', '9']);
const MIN_TOTAL = 180;
const MAX_TOTAL = 220;
const MIN_POOL_SIZE = 4; // 四選一題型至少要有 3 個誘答同伴

// 簡體字殘留檢查：常見簡體專用字（繁體不會用到的字形）
const SIMPLIFIED_BLACKLIST = /[们体现应对国学习为经济时间过发现问题这样实际]/;

function fail(errors, msg) {
  errors.push(msg);
}

async function main() {
  const errors = [];
  const warnings = [];

  let raw;
  try {
    raw = await readFile(DATA_FILE, 'utf8');
  } catch (err) {
    console.error(`讀不到 ${DATA_FILE}：${err.message}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`biology.json 不是合法 JSON：${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data)) {
    console.error('biology.json 頂層必須是陣列');
    process.exit(1);
  }

  // 1. 總筆數區間
  if (data.length < MIN_TOTAL || data.length > MAX_TOTAL) {
    fail(errors, `總筆數 ${data.length} 不在合理區間 [${MIN_TOTAL}, ${MAX_TOTAL}]`);
  } else {
    console.log(`✓ 總筆數 ${data.length}，落在區間 [${MIN_TOTAL}, ${MAX_TOTAL}]`);
  }

  // 2. 必填欄位 + 3. 枚舉合法值 + 4. 例句含詞條 + 5. 無簡體字
  const seenIds = new Set();
  const seenTerms = new Set();
  const poolCount = new Map();

  for (const [idx, entry] of data.entries()) {
    const loc = `第 ${idx + 1} 筆 (id=${entry.id ?? '?'}, term=${entry.term ?? '?'})`;

    for (const field of REQUIRED_FIELDS) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
        fail(errors, `${loc} 缺少必填欄位 "${field}"`);
      }
    }

    if (entry.id) {
      if (seenIds.has(entry.id)) fail(errors, `${loc} id 重複`);
      seenIds.add(entry.id);
    }

    if (entry.term) {
      if (seenTerms.has(entry.term)) fail(errors, `${loc} term 重複：「${entry.term}」`);
      seenTerms.add(entry.term);
    }

    if (entry.unit && !VALID_UNITS.has(entry.unit)) {
      fail(errors, `${loc} unit 不合法：「${entry.unit}」（合法值：${[...VALID_UNITS].join(', ')}）`);
    }

    if (entry.grade && !VALID_GRADES.has(String(entry.grade))) {
      fail(errors, `${loc} grade 不合法：「${entry.grade}」（合法值：7/8/9）`);
    }

    if (entry.term && entry.example && !entry.example.includes(entry.term)) {
      fail(errors, `${loc} 例句未包含詞條字面：例句「${entry.example}」不含「${entry.term}」`);
    }

    for (const field of ['term', 'def', 'example']) {
      const val = entry[field];
      if (typeof val === 'string' && SIMPLIFIED_BLACKLIST.test(val)) {
        fail(errors, `${loc} 欄位 "${field}" 疑似含簡體字殘留：「${val}」`);
      }
    }

    if (entry.distractor_pool) {
      poolCount.set(entry.distractor_pool, (poolCount.get(entry.distractor_pool) || 0) + 1);
    }
  }

  // 6. 誘答池健全度
  for (const [pool, count] of poolCount.entries()) {
    if (count < MIN_POOL_SIZE) {
      warnings.push(`誘答池 "${pool}" 只有 ${count} 筆，少於建議下限 ${MIN_POOL_SIZE}（四選一出題時誘答選項會不足）`);
    }
  }
  console.log(`✓ 共 ${poolCount.size} 個誘答池，各池筆數：${[...poolCount.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // 7. unit 分布
  const unitCount = new Map();
  for (const e of data) {
    if (e.unit) unitCount.set(e.unit, (unitCount.get(e.unit) || 0) + 1);
  }
  console.log(`✓ 五大單元分布：${[...unitCount.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);

  if (errors.length === 0) {
    console.log(`\n✓ 必填欄位、枚舉值、無重複 id/term、例句含詞條字面、無簡體字殘留：全數通過（${data.length} 筆）`);
  }

  if (warnings.length) {
    console.log('\n--- 警告（不擋關但建議留意）---');
    warnings.forEach((w) => console.log('⚠ ' + w));
  }

  if (errors.length) {
    console.log('\n--- 驗證失敗 ---');
    errors.forEach((e) => console.log('✗ ' + e));
    console.log(`\n共 ${errors.length} 項錯誤，validate 未通過。`);
    process.exit(1);
  }

  console.log('\n✅ validate 全數通過。');
}

main();
