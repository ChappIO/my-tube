import type { NetworkOptions } from '../ytdlp/args.js';
import type { SourceMetadata } from '../ytdlp/metadata.js';
import { isYtdlpFailure } from '../ytdlp/ytdlp-error.js';
import type { YtdlpLogSink, YtdlpRunner, YtdlpSession } from '../ytdlp/ytdlp-runner.js';

export interface ProbeResult {
  /** The item's own metadata; null when no probe got through (the download goes ahead). */
  info: SourceMetadata | null;
  /** Whether `info` was read with the download's `-f`, so its `expectedStreams` are the ones fetched. */
  sized: boolean;
}

/**
 * The metadata call a download makes first, with the download's format selector so yt-dlp
 * reports the streams it will fetch and their sizes. It must not fail the job on its own:
 *
 * - `Requested format is not available` with `-f` → once more without `-f` (the metadata, sizes
 *   unknown: the progress tracker handles that).
 * - Still `Requested format is not available` (after the runner's cookie fallback) → no
 *   metadata; the download goes ahead and its own failure is the one that counts.
 *
 * Any other failure is rethrown, as before.
 */
export async function probeForDownload(
  runner: YtdlpRunner,
  url: string,
  options: {
    format: string;
    network: NetworkOptions;
    session: YtdlpSession;
    signal: AbortSignal;
    log: YtdlpLogSink;
  },
): Promise<ProbeResult> {
  const { format, network, session, signal, log } = options;
  try {
    return {
      info: await runner.metadata(url, { format, network, session, signal, log }),
      sized: true,
    };
  } catch (error) {
    if (!isYtdlpFailure(error, 'format_unavailable')) throw error;
  }
  log(`size probe: no format matches -f ${format}; probing again without -f (sizes unknown)`);
  try {
    return { info: await runner.metadata(url, { network, session, signal, log }), sized: false };
  } catch (error) {
    if (!isYtdlpFailure(error, 'format_unavailable')) throw error;
  }
  log('size probe: no format without -f either; downloading without the metadata');
  return { info: null, sized: false };
}

/** The job error of an item with no downloadable format (`noDownloadableFormat`). */
export const NO_DOWNLOADABLE_FORMAT = 'no downloadable format';
