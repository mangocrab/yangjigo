import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'sejong-e2e-')),
  env = {
    ...process.env,
    XDG_CONFIG_HOME: join(dir, 'config'),
    WRANGLER_SEND_METRICS: 'false',
  };
let child,
  stopping = false;
function run(command, args) {
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 || stopping
        ? resolve()
        : reject(new Error(`테스트 서버 실패 ${code ?? signal}`)),
    );
  });
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.on(s, () => {
    stopping = true;
    child?.kill(s);
  });
try {
  await run('npm', ['run', 'build']);
  if (!stopping)
    await run(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'migrations',
      'apply',
      'sejong-db',
      '--local',
      '--persist-to',
      dir,
    ]);
  if (!stopping)
    await run(process.execPath, [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      '8788',
      '--persist-to',
      dir,
    ]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
