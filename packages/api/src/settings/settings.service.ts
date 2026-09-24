import { Inject, Injectable, Logger } from '@nestjs/common';
import { Settings, SettingsPatch } from '@mytube/shared';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DATABASE, type Database } from '../database/database.module.js';
import { settings } from '../database/schema.js';

/** Field schemas per group (`general` → `theme` → schema), for validating single rows. */
const fieldSchemas = new Map<string, Map<string, z.ZodType>>(
  Object.entries(Settings.shape).map(([group, schema]) => [
    group,
    new Map<string, z.ZodType>(Object.entries(schema.unwrap().shape)),
  ]),
);

/**
 * Settings over the `settings` table: one row per changed field, keyed by its dotted path
 * (`general.theme`) with the value as JSON. Fields without a row use the shared defaults.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly warned = new Set<string>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Stored values merged over the defaults. A row whose key is unknown (a removed setting) or
   * whose value no longer validates (a narrowed option list) is ignored and its default used.
   */
  get(): Settings {
    const merged: Record<string, Record<string, unknown>> = {};
    for (const row of this.db.select().from(settings).all()) {
      const value = this.readRow(row.key, row.value);
      if (value === undefined) continue;
      const [group, field] = value.path;
      (merged[group] ??= {})[field] = value.value;
    }
    return Settings.parse(merged);
  }

  /** Writes only the given fields, in one transaction, and returns the merged settings. */
  patch(patch: SettingsPatch): Settings {
    const valid = SettingsPatch.parse(patch);
    const rows: { key: string; value: string }[] = [];
    for (const [group, fields] of Object.entries(valid)) {
      for (const [field, value] of Object.entries(fields ?? {})) {
        if (value === undefined) continue;
        rows.push({ key: `${group}.${field}`, value: JSON.stringify(value) });
      }
    }
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(settings)
          .values(row)
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: row.value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` },
          })
          .run();
      }
    });
    return this.get();
  }

  private readRow(
    key: string,
    raw: string,
  ): { path: [string, string]; value: unknown } | undefined {
    const dot = key.indexOf('.');
    const group = key.slice(0, dot);
    const field = key.slice(dot + 1);
    const schema = dot > 0 ? fieldSchemas.get(group)?.get(field) : undefined;
    if (!schema) {
      this.warnOnce(key, `Ignoring unknown setting "${key}"`);
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.warnOnce(key, `Ignoring setting "${key}": stored value is not JSON`);
      return undefined;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      this.warnOnce(key, `Ignoring setting "${key}": stored value is no longer valid`);
      return undefined;
    }
    return { path: [group, field], value: result.data };
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.logger.warn(message);
  }
}
