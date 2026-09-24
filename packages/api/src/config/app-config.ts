import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment-driven configuration. Only paths, ports and build metadata live here;
 * everything a user can change in Settings lives in the database.
 */
const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CONFIG_DIR: z.string().default('/config'),
  MUSIC_DIR: z.string().default('/media/music'),
  VIDEO_DIR: z.string().default('/media/video'),
  WEB_DIST: z.string().optional(),
  APP_VERSION: z.string().default('dev'),
});

// Both src/config and dist/config sit three levels below packages/, so this resolves
// to packages/web/dist in development and in the container alike.
const defaultWebDist = resolve(import.meta.dirname, '../../../web/dist');

export class AppConfig {
  readonly host: string;
  readonly port: number;
  readonly configDir: string;
  readonly musicDir: string;
  readonly videoDir: string;
  readonly webDist: string;
  readonly version: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const parsed = envSchema.parse(env);
    this.host = parsed.HOST;
    this.port = parsed.PORT;
    this.configDir = resolve(parsed.CONFIG_DIR);
    this.musicDir = resolve(parsed.MUSIC_DIR);
    this.videoDir = resolve(parsed.VIDEO_DIR);
    this.webDist = resolve(parsed.WEB_DIST ?? defaultWebDist);
    this.version = parsed.APP_VERSION;
  }
}
