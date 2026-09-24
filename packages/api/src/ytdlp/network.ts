import type { NetworkSettings } from '@mytube/shared';
import type { NetworkOptions } from './args.js';

/** Maps the Settings → Advanced → Network card to the runner's per-call `NetworkOptions`. */
export function networkOptions(network: NetworkSettings): NetworkOptions {
  return {
    ...(network.rateLimit !== null && { rateLimit: network.rateLimit }),
    ...(network.proxy !== null && { proxy: network.proxy }),
    ...(network.cookiesFile !== null && { cookiesFile: network.cookiesFile }),
  };
}
