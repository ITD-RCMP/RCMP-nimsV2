CREATE TABLE IF NOT EXISTS embedding_chunk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  asset_kind TEXT,
  asset_id TEXT,
  request_id INTEGER,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector BLOB NOT NULL,
  occurred_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_embedding_source ON embedding_chunk (source_type);
CREATE INDEX IF NOT EXISTS idx_embedding_asset ON embedding_chunk (asset_kind, asset_id);
CREATE INDEX IF NOT EXISTS idx_embedding_request ON embedding_chunk (request_id);
CREATE INDEX IF NOT EXISTS idx_embedding_hash ON embedding_chunk (content_hash);
