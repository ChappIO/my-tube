import { Module } from '@nestjs/common';
import { DiscogsProvider } from './discogs.provider.js';
import { MetadataChain } from './metadata-chain.js';
import { MusicBrainzProvider } from './musicbrainz.provider.js';
import { TagWriter } from './tag-writer.js';

/**
 * The music metadata provider chain: MusicBrainz, then Discogs (the order the chain asks
 * them), after yt-dlp's own tags, and the ffmpeg tag writer. `TrackDownloadRunner` injects
 * `MetadataChain`.
 */
@Module({
  providers: [
    MusicBrainzProvider,
    DiscogsProvider,
    TagWriter,
    {
      provide: MetadataChain,
      inject: [MusicBrainzProvider, DiscogsProvider, TagWriter],
      useFactory: (musicbrainz: MusicBrainzProvider, discogs: DiscogsProvider, writer: TagWriter) =>
        new MetadataChain([musicbrainz, discogs], writer),
    },
  ],
  exports: [MetadataChain],
})
export class MetadataModule {}
