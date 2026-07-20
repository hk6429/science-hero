#!/usr/bin/env node
// 合併 data/raw/shard_*.json → data/biology.json
// 依 unit 出現順序＋shard 內原順序重新編號，去重（依 term 去空白後完全比對）。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const OUT_FILE = path.join(__dirname, '..', 'data', 'biology.json');

const UNIT_ORDER = ['cell', 'body', 'repro_gene', 'evo_classify', 'ecology'];

async function loadShards() {
  const files = (await readdir(RAW_DIR)).filter(
    (f) => f.startsWith('shard_') && f.endsWith('.json')
  );
  const entries = [];
  for (const file of files) {
    const raw = await readFile(path.join(RAW_DIR, file), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${file} 不是合法 JSON：${err.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${file} 頂層必須是陣列`);
    }
    entries.push(...parsed.map((e) => ({ ...e, __srcFile: file })));
  }
  return entries;
}

function main() {
  loadShards().then(async (entries) => {
    entries.sort((a, b) => {
      const ia = UNIT_ORDER.indexOf(a.unit);
      const ib = UNIT_ORDER.indexOf(b.unit);
      if (ia !== ib) return ia - ib;
      return 0;
    });

    const seen = new Map(); // term(trim) -> entry
    const deduped = [];
    let dupCount = 0;
    for (const e of entries) {
      const key = (e.term || '').trim();
      if (!key) continue;
      if (seen.has(key)) {
        dupCount++;
        continue;
      }
      seen.set(key, e);
      deduped.push(e);
    }

    const renumbered = deduped.map((e, idx) => {
      const id = `b${String(idx + 1).padStart(4, '0')}`;
      const { __srcFile, id: _oldId, ...rest } = e;
      return { id, ...rest };
    });

    await writeFile(OUT_FILE, JSON.stringify(renumbered, null, 2) + '\n', 'utf8');
    console.log(`merge 完成：輸入 ${entries.length} 筆，去重 ${dupCount} 筆，輸出 ${renumbered.length} 筆 → ${OUT_FILE}`);
  }).catch((err) => {
    console.error('merge 失敗：', err.message);
    process.exit(1);
  });
}

main();
