import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { history, type HistoryKind } from '../database/schema.js';

export interface HistoryEntryInput {
  kind: HistoryKind;
  /** What happened to what: `yt-dlp 2026.09.22 installed`, a video title. */
  title: string;
  /** Short outcome shown in the result column: `done`, `installed`, `updated`, `failed`. */
  result: string;
  /** Free text such as an error message. */
  details?: string | null;
}

export interface HistoryEntry {
  id: number;
  at: string;
  kind: HistoryKind;
  title: string;
  result: string;
  details: string | null;
}

/** The `history` table: an append-only audit trail for the Activity screen. */
@Injectable()
export class HistoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  record(entry: HistoryEntryInput): HistoryEntry {
    return this.db
      .insert(history)
      .values({
        kind: entry.kind,
        title: entry.title,
        result: entry.result,
        details: entry.details ?? null,
      })
      .returning()
      .get();
  }

  /** The newest entries first. */
  recent(limit = 50): HistoryEntry[] {
    return this.db
      .select()
      .from(history)
      .orderBy(desc(history.at), desc(history.id))
      .limit(limit)
      .all();
  }
}
