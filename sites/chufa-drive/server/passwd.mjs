// Create or reset a Drive user.
//   node server/passwd.mjs <username> [--generate <credentials-file>]
// Without --generate the password is read from the DRIVE_NEW_PASSWORD environment variable.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from './auth.mjs';
import { loadConfig } from './app.mjs';
import { readJson, writeJsonAtomic } from './util.mjs';

const args = process.argv.slice(2);
const allowWeak = args.includes('--allow-weak');
const [username, flag, outFile] = args.filter((a) => a !== '--allow-weak');
if (!username || !/^[a-z0-9_.-]{2,32}$/.test(username)) {
  console.error('usage: node server/passwd.mjs <username a-z0-9_.-> [--generate <file>]');
  process.exit(2);
}
let password = process.env.DRIVE_NEW_PASSWORD ?? '';
if (flag === '--generate') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  password = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  password = `${password.slice(0, 5)}-${password.slice(5, 10)}-${password.slice(10, 15)}-${password.slice(15)}`;
}
if (password.length < 10 && !allowWeak) {
  console.error('password must be at least 10 characters (pass --allow-weak to override)');
  process.exit(2);
}
const config = loadConfig();
await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
const file = path.join(config.stateDir, 'users.json');
const data = await readJson(file, { users: {} });
data.users[username] = await hashPassword(password);
await writeJsonAtomic(file, data);
if (flag === '--generate') {
  await writeFile(outFile, `url=https://chufa.wang/drive/\nusername=${username}\npassword=${password}\n`, { mode: 0o600 });
  console.log(`user "${username}" saved; credentials written to ${outFile}`);
} else {
  console.log(`user "${username}" saved`);
}
