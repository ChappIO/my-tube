import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Source,
  guessLibrary,
  parseYoutubeUrl,
  sourceIssues,
  type CreateSource,
  type Library,
  type Matcher,
  type ResolvedSource,
  type SourceIssue,
  type SourceKind,
  type UpdateSource,
} from '@mytube/shared';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { artists, channels, playlists, sources } from '../database/schema.js';
import { SettingsService } from '../settings/settings.service.js';
import type { SourceMetadata } from '../ytdlp/metadata.js';
import { networkOptions } from '../ytdlp/network.js';
import { YtdlpError } from '../ytdlp/ytdlp-error.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import {
  cadence,
  canonicalSourceUrl,
  imageUrl,
  initialRules,
  kindForLibrary,
  mergeOptions,
} from './resolve.js';

/** Entries fetched per level when resolving: enough for the cadence, quick to list. */
export const RESOLVE_LIMIT = 30;

export const UNSUPPORTED_URL_MESSAGE =
  'Not a YouTube channel, artist or playlist link. Paste a link such as ' +
  'https://www.youtube.com/@channel or https://www.youtube.com/playlist?list=…';

type SourceRow = typeof sources.$inferSelect;

/**
 * Sources: resolving pasted links, and the source records with their rules and the
 * subscribe toggle.
 *
 * Nothing here deletes media or enqueues work. Removing a source deletes its row only; the
 * catalog rows (`channels`, `artists`, `playlists`) stay and are unlinked, and files are never
 * touched. Unsubscribing only flips `subscribed`. The sync listens through `onCreated` (check a
 * new source) and `onRulesChanged` (revalidate its files against the new rules).
 */
@Injectable()
export class SourcesService {
  private readonly createdListeners = new Set<(source: Source) => void>();
  private readonly rulesListeners = new Set<(source: Source) => void>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolves a pasted link through yt-dlp. A single video resolves to its channel. Throws 400
   * for links MyTube cannot add and 502 when yt-dlp fails. Nothing is cached or stored.
   */
  async resolve(input: string): Promise<ResolvedSource> {
    const parsed = parseYoutubeUrl(input);
    if (!parsed) throw new BadRequestException(UNSUPPORTED_URL_MESSAGE);

    let metadata = await this.fetchMetadata(parsed.url);
    let resolvedFrom: 'video' | null = null;
    if (metadata.kind === 'video') {
      if (!metadata.channelId) {
        throw new BadGatewayException({
          statusCode: 502,
          message: 'yt-dlp returned no channel for this video',
          reason: null,
        });
      }
      metadata = await this.fetchMetadata(`https://www.youtube.com/channel/${metadata.channelId}`);
      resolvedFrom = 'video';
      if (metadata.kind !== 'channel') {
        throw new BadGatewayException({
          statusCode: 502,
          message: 'yt-dlp did not return a channel for this video',
          reason: null,
        });
      }
    }

    const library = guessLibrary(parsed);
    const kind = kindForLibrary(metadata.kind === 'playlist' ? 'playlist' : 'channel', library);
    const youtubeId = metadata.id;
    return {
      kind,
      library,
      youtubeId,
      url: canonicalSourceUrl(kind, youtubeId, parsed.music),
      name: metadata.title,
      avatarUrl: imageUrl(metadata.thumbnailUrl),
      itemCount: metadata.kind === 'playlist' ? metadata.playlistCount : null,
      ...cadence(metadata),
      resolvedFrom,
      alreadyAdded: this.findExisting(youtubeId, library),
    };
  }

  /** Every source, newest first, optionally of one library. */
  list(library?: Library): Source[] {
    return this.db
      .select()
      .from(sources)
      .where(library ? eq(sources.library, library) : undefined)
      .orderBy(desc(sources.createdAt), desc(sources.id))
      .all()
      .map(toSource);
  }

  /** One source; 404 when it does not exist. */
  get(id: number): Source {
    return toSource(this.row(id));
  }

  /**
   * Resolves `url` again, fills the rules (the client's tree, else the library's default tree
   * from Settings) and options, inserts the source subscribed and links or creates its catalog
   * row. 409 with the existing `sourceId` when the library already has it.
   */
  async create(body: CreateSource): Promise<Source> {
    const resolved = await this.resolve(body.url);
    const library = body.library;
    const kind = body.kind ?? kindForLibrary(resolved.kind, library);
    if ((kind === 'playlist') !== (resolved.kind === 'playlist')) {
      throw invalid([
        {
          path: ['kind'],
          message:
            resolved.kind === 'playlist'
              ? 'A playlist link can only be added as a playlist'
              : 'A channel link can only be added as a channel or an artist',
        },
      ]);
    }
    const { matcher, options } = initialRules(library, this.settings.get(), body);
    const issues = sourceIssues({ library, kind, matcher, options });
    if (issues.length > 0) throw invalid(issues);

    const music = library === 'music' || resolved.url.startsWith('https://music.');
    const created = this.db.transaction((tx) => {
      const existing = tx
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.library, library), eq(sources.youtubeId, resolved.youtubeId)))
        .get();
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: `Already in the ${library} library`,
          sourceId: existing.id,
        });
      }
      const row = tx
        .insert(sources)
        .values({
          library,
          kind,
          youtubeId: resolved.youtubeId,
          url: canonicalSourceUrl(kind, resolved.youtubeId, music),
          name: resolved.name,
          avatarUrl: resolved.avatarUrl,
          subscribed: true,
          matcher,
          options,
        })
        .returning()
        .get();
      linkCatalog(tx, row, resolved.itemCount);
      return toSource(row);
    });
    for (const listener of this.createdListeners) listener(created);
    return created;
  }

  /** Called after a source was created (the sync scheduler checks it at once). */
  onCreated(listener: (source: Source) => void): () => void {
    this.createdListeners.add(listener);
    return () => this.createdListeners.delete(listener);
  }

  /** Called after a source's rules (its matcher) were saved (revalidation runs at once). */
  onRulesChanged(listener: (source: Source) => void): () => void {
    this.rulesListeners.add(listener);
    return () => this.rulesListeners.delete(listener);
  }

  /**
   * Replaces the rules (`matcher`), overlays options and changes subscribed and/or name. A
   * changed matcher notifies `onRulesChanged`.
   */
  update(id: number, body: UpdateSource): Source {
    const row = this.row(id);
    const matcher: Matcher = body.matcher ?? row.matcher;
    const options = mergeOptions(row.options, body.options);
    if (body.matcher !== undefined || body.options !== undefined) {
      const issues = sourceIssues({ library: row.library, kind: row.kind, matcher, options });
      if (issues.length > 0) throw invalid(issues);
    }
    const updated = toSource(
      this.db
        .update(sources)
        .set({
          ...(body.matcher !== undefined && { matcher }),
          ...(body.options !== undefined && { options }),
          ...(body.subscribed !== undefined && { subscribed: body.subscribed }),
          ...(body.name !== undefined && { name: body.name }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sources.id, id))
        .returning()
        .get(),
    );
    const changed =
      body.matcher !== undefined && JSON.stringify(body.matcher) !== JSON.stringify(row.matcher);
    if (changed) for (const listener of this.rulesListeners) listener(updated);
    return updated;
  }

  /** The bell. Unsubscribing only stops future checks; nothing is deleted. */
  setSubscribed(id: number, subscribed: boolean): Source {
    return this.update(id, { subscribed });
  }

  /**
   * Removes the source row. Its catalog row stays (unlinked, or relinked to the same YouTube
   * id's source in the other library). Never touches files or items.
   */
  remove(id: number): void {
    this.db.transaction((tx) => {
      const row = tx.select().from(sources).where(eq(sources.id, id)).get();
      if (!row) throw notFound(id);
      tx.delete(sources).where(eq(sources.id, id)).run();
      // ON DELETE SET NULL unlinked the catalog row. If the other library has the same
      // YouTube id as the same kind, point the row there instead.
      const other = tx
        .select()
        .from(sources)
        .where(
          and(eq(sources.youtubeId, row.youtubeId), eq(sources.kind, row.kind), ne(sources.id, id)),
        )
        .get();
      if (other) linkCatalog(tx, other, null);
    });
  }

  private row(id: number): SourceRow {
    const row = this.db.select().from(sources).where(eq(sources.id, id)).get();
    if (!row) throw notFound(id);
    return row;
  }

  private findExisting(youtubeId: string, library: Library): ResolvedSource['alreadyAdded'] {
    const rows = this.db
      .select({ id: sources.id, library: sources.library })
      .from(sources)
      .where(eq(sources.youtubeId, youtubeId))
      .all();
    const match = rows.find((row) => row.library === library) ?? rows[0];
    return match ? { sourceId: match.id, library: match.library } : null;
  }

  private async fetchMetadata(url: string): Promise<SourceMetadata> {
    try {
      return await this.runner.metadata(url, {
        limit: RESOLVE_LIMIT,
        network: networkOptions(this.settings.get().network),
      });
    } catch (error) {
      if (error instanceof YtdlpError) {
        throw new BadGatewayException({
          statusCode: 502,
          message: 'yt-dlp could not read this link',
          reason: error.reason ?? error.message,
        });
      }
      throw error;
    }
  }
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Creates or updates the catalog row for a source's YouTube id and links it to the source
 * when it is not linked yet (the same id may be a source in both libraries; the first one
 * keeps the link).
 */
function linkCatalog(tx: Transaction, source: SourceRow, itemCount: number | null): void {
  const now = new Date().toISOString();
  const link = (table: typeof channels | typeof artists | typeof playlists) =>
    tx
      .update(table)
      .set({ sourceId: source.id, updatedAt: now })
      .where(and(eq(table.youtubeId, source.youtubeId), isNull(table.sourceId)))
      .run();
  const catalog = catalogTable(source.kind);
  if (catalog === 'channels') {
    tx.insert(channels)
      .values({ youtubeId: source.youtubeId, name: source.name, avatarUrl: source.avatarUrl })
      .onConflictDoUpdate({
        target: channels.youtubeId,
        set: { name: source.name, avatarUrl: source.avatarUrl, updatedAt: now },
      })
      .run();
    link(channels);
  } else if (catalog === 'artists') {
    tx.insert(artists)
      .values({ youtubeId: source.youtubeId, name: source.name, avatarUrl: source.avatarUrl })
      .onConflictDoUpdate({
        target: artists.youtubeId,
        set: { name: source.name, avatarUrl: source.avatarUrl, updatedAt: now },
      })
      .run();
    link(artists);
  } else {
    tx.insert(playlists)
      .values({
        library: source.library,
        youtubeId: source.youtubeId,
        name: source.name,
        thumbnailUrl: source.avatarUrl,
        itemCount: itemCount ?? 0,
      })
      .onConflictDoUpdate({
        target: playlists.youtubeId,
        set: {
          name: source.name,
          thumbnailUrl: source.avatarUrl,
          ...(itemCount !== null && { itemCount }),
          updatedAt: now,
        },
      })
      .run();
    link(playlists);
  }
}

function catalogTable(kind: SourceKind): 'channels' | 'artists' | 'playlists' {
  return kind === 'channel' ? 'channels' : kind === 'artist' ? 'artists' : 'playlists';
}

function toSource(row: SourceRow): Source {
  return Source.parse(row);
}

function invalid(issues: SourceIssue[]): BadRequestException {
  return new BadRequestException({ message: 'Validation failed', issues });
}

function notFound(id: number): NotFoundException {
  return new NotFoundException(`Source ${id} not found`);
}
