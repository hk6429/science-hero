import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url));

function statement(db, sql, args = []) {
  return {
    bind(...nextArgs) { return statement(db, sql, nextArgs); },
    async first(column) {
      const row = db.prepare(sql).get(...args);
      if (!row) return null;
      return column ? (row[column] ?? null) : { ...row };
    },
    async all() {
      return { results: db.prepare(sql).all(...args).map((row) => ({ ...row })) };
    },
    async run() {
      const result = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
  };
}

export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return {
    prepare(sql) { return statement(db, sql); },
    async batch(statements) {
      const results = [];
      for (const item of statements) results.push(await item.run());
      return results;
    },
  };
}
