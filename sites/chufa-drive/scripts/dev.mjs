// Local development: API server on :4191 (plain-HTTP cookie) + Vite on :5190.
import { spawn } from 'node:child_process';

const env = { ...process.env, DRIVE_COOKIE_SECURE: '0', DRIVE_MIN_FREE_MB: process.env.DRIVE_MIN_FREE_MB ?? '512' };
const procs = [
  spawn(process.execPath, ['--watch', 'server/server.mjs'], { stdio: 'inherit', env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
