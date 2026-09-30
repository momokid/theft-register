import { spawn } from 'node:child_process';

const procs = [
  spawn('node --watch app.js', { stdio: 'inherit', shell: true }),
  spawn('npx vite --config client/vite.config.js', { stdio: 'inherit', shell: true }),
];

for (const p of procs) {
  p.on('exit', (code) => {
    for (const other of procs) other.kill();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => procs.forEach((p) => p.kill()));
