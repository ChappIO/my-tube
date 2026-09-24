// Runs before every test file. The test suite never touches the network: booting AppModule
// starts the yt-dlp binary manager, which would otherwise download yt-dlp from GitHub. Tests
// that need `fetch` stub it with `vi.stubGlobal('fetch', ...)`.
globalThis.fetch = (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return Promise.reject(new Error(`Network access is disabled in tests (${url})`));
};
