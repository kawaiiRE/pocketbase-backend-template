import { spawn } from 'node:child_process';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const runtime = path.resolve('.runtime', 'type-generation');
const emptyHooks = path.join(runtime, 'empty-hooks');
const emptyMigrations = path.join(runtime, 'empty-migrations');
const dataDirectory = path.join(runtime, 'data');
const binary = path.resolve('bin', `pocketbase${process.platform === 'win32' ? '.exe' : ''}`);

await mkdir(emptyHooks, { recursive: true });
await mkdir(emptyMigrations, { recursive: true });
await mkdir(path.resolve('generated'), { recursive: true });

const child = spawn(
  binary,
  [
    'serve',
    '--http=127.0.0.1:0',
    `--dir=${dataDirectory}`,
    `--hooksDir=${emptyHooks}`,
    `--migrationsDir=${emptyMigrations}`,
    '--automigrate=false',
  ],
  { stdio: 'ignore', windowsHide: true },
);

try {
  let generated = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await access(path.join(dataDirectory, 'types.d.ts'));
      generated = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!generated) {
    throw new Error('PocketBase did not generate runtime declarations.');
  }

  await copyFile(path.join(dataDirectory, 'types.d.ts'), path.resolve('generated', 'types.d.ts'));
  console.log('PocketBase runtime declarations generated.');
} finally {
  child.kill();
}
