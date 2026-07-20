-- 科學英雄 Redis-over-D1 shim 四表（即時對戰 rt: / 科學市集 mkt: 共用）
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  exp INTEGER
);

CREATE TABLE IF NOT EXISTS hash (
  k TEXT NOT NULL,
  f TEXT NOT NULL,
  v TEXT NOT NULL,
  exp INTEGER,
  PRIMARY KEY (k, f)
);

CREATE TABLE IF NOT EXISTS list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  exp INTEGER
);
CREATE INDEX IF NOT EXISTS idx_list_k ON list(k, id);

CREATE TABLE IF NOT EXISTS zset (
  k TEXT NOT NULL,
  member TEXT NOT NULL,
  score REAL NOT NULL,
  exp INTEGER,
  PRIMARY KEY (k, member)
);
CREATE INDEX IF NOT EXISTS idx_zset_score ON zset(k, score);
