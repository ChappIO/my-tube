-- Matcher rules (Stage 3b). A source's rules become one expression tree (`matcher`, the shared
-- `Matcher` schema) plus plain options (`options`, `SourceOptions`). `'null'` marks a row the
-- code migration has not converted yet: right after this file, `convertLegacyData` in
-- `legacy-rules.ts` fills both columns from the old `rules` JSON (and converts the old default
-- rule settings); the next file drops `rules`.
ALTER TABLE sources ADD COLUMN matcher TEXT NOT NULL DEFAULT 'null' CHECK (json_valid(matcher));
ALTER TABLE sources ADD COLUMN options TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options));
-- When revalidation last compared the source's files with its rules (every 6 hours).
ALTER TABLE sources ADD COLUMN last_revalidated_at TEXT;

-- Skip reasons of the flat rules become `no_match` (the tree did not match at sync).
UPDATE videos SET skip_reason = 'no_match'
  WHERE skip_reason IN ('short', 'title_filter', 'published_before', 'older_than_keep_days', 'live');
UPDATE tracks SET skip_reason = 'no_match'
  WHERE skip_reason IN ('short', 'title_filter', 'published_before', 'older_than_keep_days', 'live');

-- The `retention` job type becomes `revalidate`. SQLite cannot change a CHECK, so the table is
-- rebuilt. `history.job_id` references jobs: park those links while the old table is dropped
-- (its implicit delete would violate them) and restore them against the new table.
CREATE TEMP TABLE history_job_links AS
  SELECT id, job_id FROM history WHERE job_id IS NOT NULL;
UPDATE history SET job_id = NULL WHERE job_id IS NOT NULL;

CREATE TABLE jobs_new (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL
    CHECK (type IN ('download', 'check_source', 'revalidate', 'rescan', 'backup')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  dedupe_key TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  run_after TEXT,
  progress REAL,
  speed_bytes_per_sec INTEGER,
  eta_seconds INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  total_bytes INTEGER
);
INSERT INTO jobs_new (
  id, type, status, payload, dedupe_key, priority, attempts, max_attempts, run_after, progress,
  speed_bytes_per_sec, eta_seconds, error, created_at, started_at, finished_at, updated_at,
  total_bytes
)
SELECT
  id, CASE type WHEN 'retention' THEN 'revalidate' ELSE type END, status, payload, dedupe_key,
  priority, attempts, max_attempts, run_after, progress, speed_bytes_per_sec, eta_seconds, error,
  created_at, started_at, finished_at, updated_at, total_bytes
FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX jobs_pick ON jobs (status, priority, run_after, id);
CREATE UNIQUE INDEX jobs_active_key ON jobs (type, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

UPDATE history SET job_id = (
  SELECT links.job_id FROM history_job_links AS links WHERE links.id = history.id
) WHERE id IN (SELECT id FROM history_job_links);
DROP TABLE history_job_links;
