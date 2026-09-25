import type { MusicSettings } from '@mytube/shared';
import {
  CONFIDENT,
  type EnrichedField,
  type LookupContext,
  type MetadataProvider,
  type ProviderMatch,
  type ProviderResult,
  type TrackLookup,
  changedFields,
  describeSearch,
  describeTags,
  mergeTags,
} from './provider.js';
import type { TagWriteOptions } from './tag-writer.js';
import type { TrackTags } from './ytdlp-tags.js';

/** What the chain needs from the tag writer (a seam for tests). */
export interface TagSink {
  write(file: string, tags: Partial<TrackTags>, options?: TagWriteOptions): Promise<void>;
}

/** The outcome of one enrichment, for tests and the caller. */
export interface ChainResult {
  /** The tags after the merge (the baseline where nobody was confident). */
  tags: TrackTags;
  /** The fields that changed and were written into the file. */
  written: EnrichedField[];
}

/**
 * The music metadata provider chain. yt-dlp's tags (the baseline) are embedded while the track
 * downloads; afterwards `enrich` asks the enabled providers in order (MusicBrainz, then
 * Discogs), merges their answers (per field, the first confident one wins; see `mergeTags`) and
 * rewrites the file's tags when anything changed. Every provider result is one job log line.
 * A provider that fails (network, timeout, HTTP error) is logged and skipped, and a failed
 * write leaves the file as yt-dlp tagged it: enrichment never fails a download.
 */
export class MetadataChain {
  constructor(
    /** In the order they are asked. */
    readonly providers: readonly MetadataProvider[],
    private readonly writer: TagSink,
  ) {}

  /** The providers that run for these settings (none by default). */
  active(settings: MusicSettings): MetadataProvider[] {
    return this.providers.filter((provider) => provider.enabled(settings));
  }

  /**
   * Enriches a downloaded file. Returns null when no provider is enabled (nothing is looked up
   * or written), else the merged tags and what was written.
   */
  async enrich(
    file: string,
    track: TrackLookup,
    context: LookupContext,
  ): Promise<ChainResult | null> {
    const providers = this.active(context.settings);
    if (providers.length === 0) return null;
    const { log } = context;
    const matches: ProviderMatch[] = [];
    for (const provider of providers) {
      if (context.signal?.aborted) return null;
      try {
        const result = await provider.lookup(track, context);
        log(describeResult(provider, track, result));
        if (result.match) matches.push(result.match);
      } catch (error) {
        if (context.signal?.aborted) return null;
        log(`${provider.label}: lookup failed (${message(error)}); no enrichment`);
      }
    }

    const tags = mergeTags(track.tags, matches);
    const written = changedFields(track.tags, tags);
    if (written.length === 0) {
      log('metadata: tags unchanged');
      return { tags, written };
    }
    try {
      await this.writer.write(file, tags, { signal: context.signal, log });
      log(`metadata: wrote ${describeTags(tags, written)}`);
      return { tags, written };
    } catch (error) {
      log(`metadata: could not write the tags (${message(error)}); yt-dlp's stay`);
      return { tags: track.tags, written: [] };
    }
  }
}

/**
 * One job log line per provider: what it found and for which search, e.g.
 * `MusicBrainz: album "Mood Valiant", track 3 … for "Chivalry Is Not Dead" by Hiatus Kaiyote
 * (confidence 0.95; recording …)` or `MusicBrainz: no match for "Password" by MDK (also tried
 * "MDK x t+pazolite - Password")`.
 */
function describeResult(
  provider: MetadataProvider,
  track: TrackLookup,
  result: ProviderResult,
): string {
  const search = describeSearch(track, result);
  const { match } = result;
  if (!match) return `${provider.label}: no match for ${search}`;
  const found = describeTags(match.tags);
  if (match.confidence < CONFIDENT || !found) {
    return `${provider.label}: no confident match for ${search} (${match.summary})`;
  }
  return `${provider.label}: ${found} for ${search} (confidence ${match.confidence.toFixed(2)}; ${match.summary})`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
