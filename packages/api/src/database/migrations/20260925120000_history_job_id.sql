-- Links a history row to the job that produced it, so the Activity screen can offer the job's
-- yt-dlp log (`CONFIG_DIR/logs/jobs/<job id>.log`). Null for rows not written by a job (yt-dlp
-- installs and updates). Jobs are never deleted, so no foreign key action is needed.
ALTER TABLE history ADD COLUMN job_id INTEGER REFERENCES jobs (id);
