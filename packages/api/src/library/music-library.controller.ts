import { Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import {
  AlbumListQuery,
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
import { MusicLibraryService } from './music-library.service.js';

/** The Music tabs (artists, albums, playlists) and Preview's track endpoints. */
@Controller('library')
export class MusicLibraryController {
  constructor(private readonly music: MusicLibraryService) {}

  /** Artists with tracks in the library or added as sources, by name. */
  @Get('artists')
  artists(): ArtistListItem[] {
    return this.music.listArtists();
  }

  /** Albums with tracks in the library, optionally of one artist. */
  @Get('albums')
  albums(@Query(new ZodValidationPipe(AlbumListQuery)) query: AlbumListQuery): AlbumListItem[] {
    return this.music.listAlbums(query);
  }

  /** The Music library's synced playlists (`?library=music`, the default and only value). */
  @Get('playlists')
  playlists(
    @Query(new ZodValidationPipe(PlaylistListQuery)) _query: PlaylistListQuery,
  ): PlaylistListItem[] {
    return this.music.listPlaylists();
  }

  /** The Tracks tab: filter, text match, sort and cursor pages with the two totals. */
  @Get('tracks')
  tracks(@Query(new ZodValidationPipe(TrackListQuery)) query: TrackListQuery): TrackPage {
    return this.music.listTracks(query);
  }

  /** One track with its artist and album (Preview). */
  @Get('tracks/:id')
  track(@Param('id', ParseIntPipe) id: number): TrackListItem {
    return this.music.getTrack(id);
  }

  /** The audio file for Preview, with HTTP Range support. 404 when not on disk. */
  @Get('tracks/:id/stream')
  async stream(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const target = this.music.streamTarget(id);
    await sendFile(res, target.path, { contentType: target.contentType });
  }

  /** Delete file: removes the file and its sidecars; the track stays known as deleted. */
  @Delete('tracks/:id/file')
  @HttpCode(204)
  deleteFile(@Param('id', ParseIntPipe) id: number): void {
    this.music.deleteFile(id);
  }
}
