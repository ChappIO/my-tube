import { describe, expect, it } from 'vitest';
import { AppConfig } from './app-config.js';

describe('AppConfig', () => {
  it('applies container defaults', () => {
    const config = new AppConfig({});
    expect(config.port).toBe(8080);
    expect(config.configDir).toBe('/config');
    expect(config.musicDir).toBe('/media/music');
    expect(config.videoDir).toBe('/media/video');
    expect(config.version).toBe('dev');
  });

  it('reads and coerces environment variables', () => {
    const config = new AppConfig({ PORT: '3000', CONFIG_DIR: '/tmp/cfg', APP_VERSION: '1.2.3' });
    expect(config.port).toBe(3000);
    expect(config.configDir).toBe('/tmp/cfg');
    expect(config.version).toBe('1.2.3');
  });

  it('rejects an invalid port', () => {
    expect(() => new AppConfig({ PORT: 'nope' })).toThrow();
  });
});
