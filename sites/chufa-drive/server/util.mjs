import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1), { mode: 0o600 });
  await rename(tmp, file);
}

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const bad = (code, message, extra) => new HttpError(400, code, message, extra);
