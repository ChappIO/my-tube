-- Bookkeeping for the artwork cache (`CONFIG_DIR/cache/artwork/<kind>/<id>.<ext>`): which
-- remote image each cached file came from, so a changed avatar or thumbnail URL is fetched
-- again, and when it was last served, so the cache can be pruned to 500 MB, least recently
-- used first. The files are the cache; a row without its file is fetched again.
CREATE TABLE artwork_cache (
  -- `<kind>/<row id>`, the same as the URL path after /api/artwork/.
  key TEXT PRIMARY KEY,
  -- The remote URL the file was downloaded from.
  source_url TEXT NOT NULL,
  -- File name relative to cache/artwork (`video/12.jpg`).
  file TEXT NOT NULL,
  content_type TEXT NOT NULL,
  -- The remote server's ETag, when it sent one.
  etag TEXT,
  size INTEGER NOT NULL CHECK (size >= 0),
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX artwork_cache_used_at ON artwork_cache (used_at);
