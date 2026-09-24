// Starts one development stack for this checkout: shared (tsc --watch), api (Nest watch)
// and web (Vite). Ports and data directories come from the environment so several
// checkouts (worktrees) can run side by side:
//
//   API_PORT    api port, also what the Vite proxy targets (default 8080; PORT is accepted)
//   WEB_PORT    Vite port, strict: fails instead of picking another (default 5173)
//   CONFIG_DIR  database and settings (default <checkout>/.local/config)
//   MUSIC_DIR   music library (default <checkout>/.local/music)
//   VIDEO_DIR   video library (default <checkout>/.local/video)
//
// Example: API_PORT=8082 WEB_PORT=5175 pnpm dev
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = resolve(import.meta.dirname, '..');
const color = process.stdout.isTTY === true;

function port(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`[dev] ${name} must be a port number, got "${value}"`);
    process.exit(1);
  }
  return String(parsed);
}

function dir(value, fallback) {
  return value ? resolve(value) : resolve(root, fallback);
}

const apiPort = port('API_PORT', process.env.API_PORT ?? process.env.PORT ?? '8080');
const webPort = port('WEB_PORT', process.env.WEB_PORT ?? '5173');

const env = {
  ...process.env,
  API_PORT: apiPort,
  WEB_PORT: webPort,
  CONFIG_DIR: dir(process.env.CONFIG_DIR, '.local/config'),
  MUSIC_DIR: dir(process.env.MUSIC_DIR, '.local/music'),
  VIDEO_DIR: dir(process.env.VIDEO_DIR, '.local/video'),
  ...(color ? { FORCE_COLOR: '1' } : {}),
};
// The api reads PORT; its dev script derives it from API_PORT.
delete env.PORT;

// A port counts as taken when anything accepts a connection on it over IPv4 or IPv6
// loopback. Probing by listening is unreliable on macOS, where a wildcard listen can
// succeed next to an existing 0.0.0.0 or ::1 listener.
function accepts(host, value) {
  return new Promise((done) => {
    const socket = connect({ host, port: Number(value) });
    const settle = (taken) => {
      socket.destroy();
      done(taken);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

async function isFree(value) {
  const taken = await Promise.all(['127.0.0.1', '::1'].map((host) => accepts(host, value)));
  return !taken.includes(true);
}

for (const [name, value] of [
  ['API_PORT', apiPort],
  ['WEB_PORT', webPort],
]) {
  if (!(await isFree(value))) {
    console.error(`[dev] ${name} ${value} is already in use. Pick another, e.g. ${name}=...`);
    process.exit(1);
  }
}

const initial = spawnSync('pnpm', ['--filter', '@mytube/shared', 'build'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (initial.status !== 0) process.exit(initial.status ?? 1);

const processes = [
  { name: 'shared', dir: 'packages/shared', tint: 35 },
  { name: 'api', dir: 'packages/api', tint: 36 },
  { name: 'web', dir: 'packages/web', tint: 33 },
];
const width = Math.max(...processes.map((p) => p.name.length));
let stopping = false;
let exitCode = 0;

function prefix(name, tint) {
  const label = `[${name.padEnd(width)}]`;
  return color ? `\u001b[${tint}m${label}\u001b[0m ` : `${label} `;
}

function pipe(stream, target, label) {
  createInterface({ input: stream }).on('line', (line) => target.write(`${label}${line}\n`));
}

const children = processes.map(({ name, dir: cwd, tint }) => {
  // detached puts each child in its own process group, so shutdown can signal the
  // whole tree (pnpm, the package script and the watcher it starts).
  const child = spawn('pnpm', ['run', 'dev'], {
    cwd: resolve(root, cwd),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const label = prefix(name, tint);
  pipe(child.stdout, process.stdout, label);
  pipe(child.stderr, process.stderr, label);
  child.on('exit', (code, signal) => {
    child.exited = true;
    if (!stopping) {
      console.error(`${label}exited (${signal ?? code}), stopping the stack`);
      exitCode = code || 1;
      stop();
    }
    if (children.every((c) => c.exited)) process.exit(exitCode);
  });
  return child;
});

function signalAll(signal) {
  for (const child of children) {
    if (child.exited) continue;
    try {
      process.kill(-child.pid, signal);
    } catch {
      // Already gone.
    }
  }
}

function stop() {
  if (stopping) return;
  stopping = true;
  signalAll('SIGTERM');
  setTimeout(() => signalAll('SIGKILL'), 5000).unref();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);

console.log(
  [
    '',
    `[dev] web     http://localhost:${webPort}`,
    `[dev] api     http://localhost:${apiPort}/api/health`,
    `[dev] config  ${env.CONFIG_DIR}`,
    `[dev] music   ${env.MUSIC_DIR}`,
    `[dev] video   ${env.VIDEO_DIR}`,
    '',
  ].join('\n'),
);
