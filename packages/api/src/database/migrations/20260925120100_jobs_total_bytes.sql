-- Expected size of a running download (all streams, as yt-dlp reports it), for the queue's
-- meta line (`NASA · 1080p · 1.2 GB · 4.1 MB/s`). Written with the progress; null when unknown.
ALTER TABLE jobs ADD COLUMN total_bytes INTEGER;
