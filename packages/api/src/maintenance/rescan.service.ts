import { stat } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { ItemStatus, Library, LibraryStats } from '@mytube/shared';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { sources, tracks, videos } from '../database/schema.js';
import { listMediaFiles } from '../files/library-walk.js';
import { libraryPath, OutsideLibraryError } from '../files/media-files.js';

/** What a rescan found in one library, after reconciling. */
export interface LibraryRescan extends LibraryStats {
  /** Known items whose file is gone (`missing`). */
  missing: number;
  /** Media files in the mount that no item points at. Counted, never touched. */
  unknown: number;
}

export interface RescanResult {
  music: LibraryRescan;
  video: LibraryRescan;
  /** `on_disk` items whose file was gone: now `missing`. */
  newlyMissing: number;
  /** `missing` items whose file is back: now `on_disk`. */
  restored: number;
  /** `on_disk` items whose file size changed. */
  resized: number;
}

export interface RescanContext {
  /** Fraction of the known items checked so far (0 to 1). */
  progress?: (fraction: number) => void;
  log?: (line: string) => void;
  signal?: AbortSignal;
}

/** One item with a file path, as the rescan checks it. */
interface KnownItem {
  table: 'videos' | 'tracks';
  id: number;
  status: ItemStatus;
  filePath: string;
  fileSizeBytes: number | null;
}

type Change =
  | { kind: 'missing'; item: KnownItem }
  | { kind: 'restored'; item: KnownItem; size: number }
  | { kind: 'resized'; item: KnownItem; size: number };

/** Unknown files listed in the job log by name; the rest are only counted. */
const UNKNOWN_LOG_LIMIT = 200;

const LIBRARIES = [
  { library: 'music', table: 'tracks' },
  { library: 'video', table: 'videos' },
] as const satisfies readonly { library: Library; table: KnownItem['table'] }[];

/**
 * Rescan: reconciles the database with the two library mounts (`MUSIC_DIR`, `VIDEO_DIR`).
 *
 * - Every video and track with a file path that is `on_disk` or `missing` is checked on disk:
 *   a file that is gone makes it `missing` (its `file_path` is kept, so the library can say where
 *   it was), a file that is back makes it `on_disk` again, and a changed size is stored.
 * - Sources get their `size_bytes` (on-disk items they own) and `item_count` (wanted,
 *   downloading and on-disk items) recounted.
 * - Media files in the mounts that no item points at are counted and logged, never touched or
 *   imported. Partial downloads, hidden files and sidecars are not media files (`listMediaFiles`).
 *
 * Nothing is deleted. Each update is guarded by the status it was decided from, so an item a
 * download, a revalidation or Delete file moved in the meantime is left alone.
 */
@Injectable()
export class RescanService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async rescan(ctx: RescanContext = {}): Promise<RescanResult> {
    const log = ctx.log ?? (() => {});
    const roots = { music: this.config.musicDir, video: this.config.videoDir };

    // Walk first, then read the items: a file downloaded during the walk is then known.
    const files = {
      music: await listMediaFiles(roots.music, ctx.signal),
      video: await listMediaFiles(roots.video, ctx.signal),
    };
    const items = LIBRARIES.flatMap(({ table }) => this.knownItems(table));

    const changes: Change[] = [];
    for (const [index, item] of items.entries()) {
      ctx.signal?.throwIfAborted();
      const root = item.table === 'tracks' ? roots.music : roots.video;
      const change = await checkItem(root, item, log);
      if (change) changes.push(change);
      ctx.progress?.((index + 1) / items.length);
    }
    const applied = this.apply(changes, log);
    this.recountSources();

    const unknown = {
      music: this.unknownFiles('tracks', files.music),
      video: this.unknownFiles('videos', files.video),
    };
    for (const { library } of LIBRARIES) {
      unknown[library].slice(0, UNKNOWN_LOG_LIMIT).forEach((path) => {
        log(`unknown ${library} file, left alone: ${path}`);
      });
      if (unknown[library].length > UNKNOWN_LOG_LIMIT) {
        log(`… and ${unknown[library].length - UNKNOWN_LOG_LIMIT} more unknown ${library} files`);
      }
    }

    const count = (kind: Change['kind']) => applied.filter((change) => change.kind === kind).length;
    return {
      music: { ...this.totals('tracks'), unknown: unknown.music.length },
      video: { ...this.totals('videos'), unknown: unknown.video.length },
      newlyMissing: count('missing'),
      restored: count('restored'),
      resized: count('resized'),
    };
  }

  /** One library's on-disk totals (the Settings Library → Size row). */
  stats(library: Library): LibraryStats {
    const { sizeBytes, itemCount } = this.totals(library === 'music' ? 'tracks' : 'videos');
    return { sizeBytes, itemCount };
  }

  private knownItems(tableName: KnownItem['table']): KnownItem[] {
    const table = tableName === 'tracks' ? tracks : videos;
    return this.db
      .select({
        id: table.id,
        status: table.status,
        filePath: table.filePath,
        fileSizeBytes: table.fileSizeBytes,
      })
      .from(table)
      .where(and(isNotNull(table.filePath), inArray(table.status, ['on_disk', 'missing'])))
      .orderBy(table.id)
      .all()
      .map((row) => ({ ...row, table: tableName, filePath: row.filePath! }));
  }

  /** Files of the walk that no item of the library points at, whatever its status. */
  private unknownFiles(tableName: KnownItem['table'], files: string[]): string[] {
    const table = tableName === 'tracks' ? tracks : videos;
    const known = new Set(
      this.db
        .select({ filePath: table.filePath })
        .from(table)
        .where(isNotNull(table.filePath))
        .all()
        .map((row) => row.filePath!.normalize('NFC')),
    );
    // Some filesystems (HFS+) hand names back decomposed; stored paths are NFC.
    return files.filter((path) => !known.has(path.normalize('NFC')));
  }

  /** Writes the changes still valid (see the class note); returns those it made. */
  private apply(changes: Change[], log: (line: string) => void): Change[] {
    const stamp = new Date().toISOString();
    return this.db.transaction((tx) =>
      changes.filter((change) => {
        const { item } = change;
        const table = item.table === 'tracks' ? tracks : videos;
        const where = (status: ItemStatus) =>
          and(eq(table.id, item.id), eq(table.status, status), eq(table.filePath, item.filePath));
        let applied: boolean;
        if (change.kind === 'missing') {
          applied =
            tx
              .update(table)
              .set({ status: 'missing', updatedAt: stamp })
              .where(where('on_disk'))
              .run().changes > 0;
          if (applied) log(`missing: ${item.filePath}`);
        } else if (change.kind === 'restored') {
          applied =
            tx
              .update(table)
              .set({ status: 'on_disk', fileSizeBytes: change.size, updatedAt: stamp })
              .where(where('missing'))
              .run().changes > 0;
          if (applied) log(`back on disk: ${item.filePath}`);
        } else {
          applied =
            tx
              .update(table)
              .set({ fileSizeBytes: change.size, updatedAt: stamp })
              .where(where('on_disk'))
              .run().changes > 0;
          if (applied) {
            log(
              `size changed: ${item.filePath} (${item.fileSizeBytes ?? 0} → ${change.size} bytes)`,
            );
          }
        }
        return applied;
      }),
    );
  }

  /**
   * Every source's `size_bytes` (its on-disk items) and `item_count` (wanted, downloading and
   * on-disk items, as the sync counts them) from the items it owns. Only changed rows are written.
   */
  private recountSources(): void {
    const stamp = new Date().toISOString();
    for (const { library, table: tableName } of LIBRARIES) {
      const table = tableName === 'tracks' ? tracks : videos;
      const size = sql<number>`coalesce((select sum(${table.fileSizeBytes}) from ${table}
        where ${table.sourceId} = ${sources.id} and ${table.status} = 'on_disk'), 0)`;
      const count = sql<number>`(select count(*) from ${table}
        where ${table.sourceId} = ${sources.id}
          and ${table.status} in ('wanted', 'downloading', 'on_disk'))`;
      this.db
        .update(sources)
        .set({ sizeBytes: size, itemCount: count, updatedAt: stamp })
        .where(
          and(
            eq(sources.library, library),
            sql`(${sources.sizeBytes} != ${size} or ${sources.itemCount} != ${count})`,
          ),
        )
        .run();
    }
  }

  private totals(tableName: KnownItem['table']): Omit<LibraryRescan, 'unknown'> {
    const table = tableName === 'tracks' ? tracks : videos;
    const row = this.db
      .select({
        sizeBytes: sql<number>`coalesce(sum(case when ${table.status} = 'on_disk'
          then ${table.fileSizeBytes} else 0 end), 0)`,
        itemCount: sql<number>`coalesce(sum(${table.status} = 'on_disk'), 0)`,
        missing: sql<number>`coalesce(sum(${table.status} = 'missing'), 0)`,
      })
      .from(table)
      .get();
    return {
      sizeBytes: row?.sizeBytes ?? 0,
      itemCount: row?.itemCount ?? 0,
      missing: row?.missing ?? 0,
    };
  }
}

/** Compares one item with its file; null when nothing changes. */
async function checkItem(
  root: string,
  item: KnownItem,
  log: (line: string) => void,
): Promise<Change | null> {
  let path: string;
  try {
    path = libraryPath(root, item.filePath);
  } catch (error) {
    if (!(error instanceof OutsideLibraryError)) throw error;
    log(`skipped, outside the library: ${item.filePath}`);
    return null;
  }
  const size = await fileSize(path);
  if (size === null) return item.status === 'on_disk' ? { kind: 'missing', item } : null;
  if (item.status === 'missing') return { kind: 'restored', item, size };
  return size === item.fileSizeBytes ? null : { kind: 'resized', item, size };
}

/** The size of a regular file, or null when there is none at `path`. */
async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}
