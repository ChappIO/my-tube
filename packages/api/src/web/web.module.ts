import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { AppConfig } from '../config/app-config.js';

/**
 * Serves the built web app (`packages/web/dist`) next to the API: static assets first, then
 * `index.html` for every other GET so the SPA router handles deep links. `/api/*` is handled
 * by the controllers before these handlers run. Nothing is served when the build does not
 * exist (development uses Vite).
 *
 * Registered straight on the Express instance rather than through @nestjs/serve-static or
 * Nest middleware: serve-static's fallback uses `sendFile` with the default `dotfiles:
 * 'ignore'`, which rejects any path containing a dot-directory segment (for example a git
 * worktree under `.claude/`), and Nest middleware is mounted on a sub-path, which rewrites
 * `req.url` and confuses `express.static`.
 */
@Module({})
export class WebModule implements OnModuleInit {
  private readonly logger = new Logger('Web');

  constructor(
    private readonly config: AppConfig,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    const dist = this.config.webDist;
    const index = join(dist, 'index.html');
    if (!existsSync(index)) {
      this.logger.log(`No web build at ${dist}; not serving the web app`);
      return;
    }
    const app = this.adapterHost.httpAdapter.getInstance<Express>();
    app.use(express.static(dist, { index: false, dotfiles: 'allow' }));
    app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.sendFile(index, { dotfiles: 'allow' }, (error) => {
        if (error) next(error);
      });
    });
    this.logger.log(`Serving the web app from ${dist}`);
  }
}
