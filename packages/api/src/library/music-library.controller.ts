import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  AlbumListQuery,
  type AlbumDetail,
  type ArtistDetail,
  type DownloadMissingResult,
  PlaylistListQuery,
  TrackListQuery,
  type TrackPage,
  type AlbumListItem,
  type ArtistListItem,
  type PlaylistListItem,
  type TrackListItem,
} from '@mytube/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { sendFile } from '../files/send-file.js';
import { AlbumService } from './album.service.js';
import { ArtistService } from './artist.service.js';
import { MusicLibraryService } from './music-library.service.js';

/**
 * The Music tabs (artists, albums, playlists), the artist and album pages (with Download missing
 * and the pin), the player's queues (a playlist's and an artist's tracks) and the track stream.
 */
@Controller('library')
export class MusicLibraryController {
  constructor(
    private readonly music: MusicLibraryService,
    private readonly albumPage: AlbumService,
    private readonly artistPage: ArtistService,
  ) {}

  /** Artists with tracks in the library or added as sources, by name. */
  @Get('artists')
  artists(): ArtistListItem[] {
    return this.music.listArtists();
  }

  /** The artist page: the artist, its subscription, its albums in the library and the others. */
  @Get('artists/:id')
  artist(@Param('id', ParseIntPipe) id: number): ArtistDetail {
    return this.artistPage.getArtist(id);
  }

  /** The artist's tracks on disk in library order (the player's queue for Play all). */
  @Get('artists/:id/tracks')
  artistTracks(@Param('id', ParseIntPipe) id: number): TrackListItem[] {
    return this.music.artistTracks(id);
  }

  /** Download missing on the artist page: a download job per track of it not on disk. 202. */
  @Post('artists/:id/download-missing')
  @HttpCode(202)
  downloadArtistMissing(@Param('id', ParseIntPipe) id: number): DownloadMissingResult {
    return this.artistPage.downloadMissing(id);
  }

  /** Albums with tracks in the library, optionally of one artist. */
  @Get('albums')
  albums(@Query(new ZodValidationPipe(AlbumListQuery)) query: AlbumListQuery): AlbumListItem[] {
    return this.music.listAlbums(query);
  }

  /** The album page: the album, its artist, its tracks in the library and the totals. */
  @Get('albums/:id')
  album(@Param('id', ParseIntPipe) id: number): AlbumDetail {
    return this.albumPage.getAlbum(id);
  }

  /** Download missing on the album page: a download job per track not on disk. 202. */
  @Post('albums/:id/download-missing')
  @HttpCode(202)
  downloadMissing(@Param('id', ParseIntPipe) id: number): DownloadMissingResult {
    return this.albumPage.downloadMissing(id);
  }

  /** Download a whole release the rules skip: pins the album and queues its tracks. 202. */
  @Post('albums/:id/download')
  @HttpCode(202)
  downloadAlbum(@Param('id', ParseIntPipe) id: number): DownloadMissingResult {
    return this.albumPage.download(id);
  }

  /** Unpin: the album's tracks follow the rules again; a revalidation is queued. 204. */
  @Delete('albums/:id/pin')
  @HttpCode(204)
  unpinAlbum(@Param('id', ParseIntPipe) id: number): void {
    this.albumPage.unpin(id);
  }

  /** The Music library's synced playlists (`?library=music`, the default and only value). */
  @Get('playlists')
  playlists(
    @Query(new ZodValidationPipe(PlaylistListQuery)) _query: PlaylistListQuery,
  ): PlaylistListItem[] {
    return this.music.listPlaylists();
  }

  /** A playlist's tracks on disk in playlist order (the player's queue for a playlist tile). */
  @Get('playlists/:id/tracks')
  playlistTracks(@Param('id', ParseIntPipe) id: number): TrackListItem[] {
    return this.music.playlistTracks(id);
  }

  /** The Tracks tab: filter, text match, sort and cursor pages with the two totals. */
  @Get('tracks')
  tracks(@Query(new ZodValidationPipe(TrackListQuery)) query: TrackListQuery): TrackPage {
    return this.music.listTracks(query);
  }

  /** One track with its artist and album. */
  @Get('tracks/:id')
  track(@Param('id', ParseIntPipe) id: number): TrackListItem {
    return this.music.getTrack(id);
  }

  /** The audio file for the player, with HTTP Range support. 404 when not on disk. */
  @Get('tracks/:id/stream')
  async stream(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const target = this.music.streamTarget(id);
    await sendFile(res, target.path, { contentType: target.contentType });
  }
}
