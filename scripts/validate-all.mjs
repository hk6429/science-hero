#!/usr/bin/env node
// 四科資料硬性關卡：schema、筆數、識別碼、例句、繁體字與誘答池。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECTS = [
  { name: '國小自然', file: 'elementary.json', grades: new Set(['3', '4', '5', '6']) },
  { name: '國中生物', file: 'biology.json', grades: new Set(['7', '8', '9']) },
  { name: '國中理化', file: 'physics-chemistry.json', grades: new Set(['7', '8', '9']) },
  { name: '國中地科', file: 'earth-science.json', grades: new Set(['7', '8', '9']) },
];
const REQUIRED = ['id', 'term', 'unit', 'grade', 'def', 'example', 'category', 'distractor_pool'];
const SIMPLIFIED_BLACKLIST = /[们体现应对国学习为经济时间过发现问题这样实际]/;
const MIN_TOTAL = 180;
const MAX_TOTAL = 260;
const globalIds = new Map();
const errors = [];
const warnings = [];

for (const subject of SUBJECTS) {
  const filePath = path.join(ROOT, 'data', subject.file);
  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${subject.name}：無法讀取或解析 ${subject.file}（${error.message}）`);
    continue;
  }

  if (!Array.isArray(data)) {
    errors.push(`${subject.name}：頂層必須是陣列`);
    continue;
  }
  if (data.length < MIN_TOTAL || data.length > MAX_TOTAL) {
    errors.push(`${subject.name}：總筆數 ${data.length} 不在 [${MIN_TOTAL}, ${MAX_TOTAL}]`);
  }

  const terms = new Set();
  const units = new Map();
  const pools = new Map();
  data.forEach((entry, index) => {
    const loc = `${subject.name}第 ${index + 1} 筆`;
    REQUIRED.forEach((field) => {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
        errors.push(`${loc}：缺少 ${field}`);
      }
    });
    if (entry.id) {
      if (globalIds.has(entry.id)) errors.push(`${loc}：id ${entry.id} 與 ${globalIds.get(entry.id)} 重複`);
      else globalIds.set(entry.id, loc);
    }
    if (entry.term) {
      if (terms.has(entry.term)) errors.push(`${loc}：term 重複「${entry.term}」`);
      terms.add(entry.term);
    }
    if (entry.grade && !subject.grades.has(String(entry.grade))) {
      errors.push(`${loc}：grade ${entry.grade} 不在允許範圍`);
    }
    if (entry.term && entry.example && !entry.example.includes(entry.term)) {
      errors.push(`${loc}：例句未包含詞條「${entry.term}」`);
    }
    for (const field of ['term', 'def', 'example']) {
      if (typeof entry[field] === 'string' && SIMPLIFIED_BLACKLIST.test(entry[field])) {
        errors.push(`${loc}：${field} 疑似含簡體字`);
      }
    }
    if (entry.unit) units.set(entry.unit, (units.get(entry.unit) || 0) + 1);
    if (entry.distractor_pool) pools.set(entry.distractor_pool, (pools.get(entry.distractor_pool) || 0) + 1);
  });

  for (const [pool, count] of pools) {
    if (count < 4) warnings.push(`${subject.name}：誘答池 ${pool} 只有 ${count} 筆`);
  }
  console.log(`✓ ${subject.name} ${data.length} 筆｜${units.size} 單元｜${pools.size} 誘答池`);
}

warnings.forEach((warning) => console.log(`⚠ ${warning}`));
if (errors.length) {
  console.error(`\n驗證失敗，共 ${errors.length} 項：`);
  errors.forEach((error) => console.error(`✗ ${error}`));
  process.exit(1);
}
console.log(`\n✅ 四科資料全數通過（共 ${globalIds.size} 筆，id 無跨科重複）。`);
