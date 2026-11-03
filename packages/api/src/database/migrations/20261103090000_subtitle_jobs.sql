-- Subtitles become a job of their own (`subtitles` in the jobs type CHECK): a video download
-- queues one once the file is on disk, so YouTube's rate limit on captions (HTTP 429) pauses
-- subtitles, never videos. The video remembers its last run so Settings → Video can list the
-- videos still without one (`subtitles_at` null, or `subtitle_languages` not the current list).
ALTER TABLE videos ADD COLUMN subtitles_at TEXT;
ALTER TABLE videos ADD COLUMN subtitle_languages TEXT;

-- SQLite cannot change a CHECK, so `jobs` is rebuilt as 20260926090000_matcher_rules did:
-- `history.job_id` links are parked while the old table is dropped and restored afterwards.
CREATE TEMP TABLE history_job_links AS
  SELECT id, job_id FROM history WHERE job_id IS NOT NULL;
UPDATE history SET job_id = NULL WHERE job_id IS NOT NULL;

CREATE TABLE jobs_new (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL
    CHECK (type IN ('download', 'subtitles', 'check_source', 'revalidate', 'rescan', 'backup')),
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
  total_bytes INTEGER,
  stage TEXT
);
INSERT INTO jobs_new (
  id, type, status, payload, dedupe_key, priority, attempts, max_attempts, run_after, progress,
  speed_bytes_per_sec, eta_seconds, error, created_at, started_at, finished_at, updated_at,
  total_bytes, stage
)
SELECT
  id, type, status, payload, dedupe_key, priority, attempts, max_attempts, run_after, progress,
  speed_bytes_per_sec, eta_seconds, error, created_at, started_at, finished_at, updated_at,
  total_bytes, stage
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
