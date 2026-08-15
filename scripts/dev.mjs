/**
 * Runs the API and Vite together with one command.
 * No `concurrently` dependency — Node can spawn both perfectly well.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const children = [];

/**
 * Both processes are launched through Node itself — never through a shell.
 * On Windows `process.execPath` lives under "C:\Program Files\…", and a shell
 * would split that path at the space; going through the .cmd shims has the
 * same problem. Pointing Node straight at Vite's JS entry avoids both.
 */
function start(name, args, color) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const tag = `\x1b[${color}m${name.padEnd(3)}\x1b[0m`;
  const relay = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) console.log(`${tag} ${line}`);
      }
    });
  };
  relay(child.stdout);
  relay(child.stderr);

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`${tag} exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill(); } catch { /* already gone */ }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('\n  Routine — starting API and web dev servers\n');

start('api', ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.mjs'], 36);
start('web', [join(root, 'node_modules', 'vite', 'bin', 'vite.js')], 35);
