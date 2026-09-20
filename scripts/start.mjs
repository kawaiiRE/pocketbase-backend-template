import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

const binary = path.resolve('bin', `pocketbase${process.platform === 'win32' ? '.exe' : ''}`);
try {
  await access(binary);
} catch {
  throw new Error('PocketBase is not installed. Run corepack yarn setup first.');
}

const port = process.env.PB_PORT ?? '8090';
const portNumber = Number(port);
if (!/^\d+$/.test(port) || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
  throw new Error('PB_PORT must be an integer from 1 through 65535.');
}

if (process.env.PB_ENCRYPTION_KEY && process.env.PB_ENCRYPTION_KEY.length !== 32) {
  throw new Error('PB_ENCRYPTION_KEY must contain exactly 32 characters.');
}

const args = [
  'serve',
  `--http=127.0.0.1:${port}`,
  `--dir=${path.resolve(process.env.PB_DATA_DIRECTORY ?? 'pb_data')}`,
  `--hooksDir=${path.resolve('pb_hooks')}`,
  `--migrationsDir=${path.resolve('pb_migrations')}`,
  '--automigrate=false',
];

if (process.env.PB_ENCRYPTION_KEY) {
  args.push('--encryptionEnv=PB_ENCRYPTION_KEY');
}
const child = spawn(binary, args, {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

/**
 * @param {NodeJS.ReadableStream | null} stream
 * @param {NodeJS.WritableStream} destination
 */
function forwardSafeOutput(stream, destination) {
  if (!stream) return;

  const lines = createInterface({ input: stream });
  lines.on('line', (line) => {
    if (
      !line.includes('pbinstaller') &&
      !line.includes('pbinstall/') &&
      !line.includes('first superuser') &&
      !line.includes('superuser upsert')
    ) {
      destination.write(`${line}\n`);
    }
  });
}

forwardSafeOutput(child.stdout, process.stdout);
forwardSafeOutput(child.stderr, process.stderr);

/** @type {NodeJS.Signals[]} */
const shutdownSignals = ['SIGINT', 'SIGTERM'];
for (const signal of shutdownSignals) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 1));
