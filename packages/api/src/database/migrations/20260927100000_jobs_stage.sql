-- What a running download is doing once its bytes are in: the yt-dlp post-processor name
-- (`Merger`, `FFmpegVideoRemuxer`, `MoveFiles`, …), shown in the queue as `processing · merging`.
-- Null while downloading and once the job leaves `running`.
ALTER TABLE jobs ADD COLUMN stage TEXT;
