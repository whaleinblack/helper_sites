import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourceFile = process.argv[2];
if (!sourceFile) {
  throw new Error("Usage: node scripts/sync-map-config.mjs <source-env-file>");
}

const envText = await readFile(resolve(sourceFile), "utf8");
const values = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")]),
);

if (!values.VITE_GOOGLE_MAPS_API_KEY) {
  throw new Error("VITE_GOOGLE_MAPS_API_KEY is missing from the source env file.");
}

const config = {
  googleMapsApiKey: values.VITE_GOOGLE_MAPS_API_KEY,
  googleMapId: values.VITE_GOOGLE_MAP_ID ?? "",
};
const javascript = `window.__OSAKA_HOME_GUIDE_CONFIG__ = ${JSON.stringify(config)};\n`;
const projectRoot = resolve(import.meta.dirname, "..");

await mkdir(resolve(projectRoot, "public"), { recursive: true });
await writeFile(resolve(projectRoot, "public/config.js"), javascript, { encoding: "utf8", mode: 0o600 });

try {
  await access(resolve(projectRoot, "publish"));
  await writeFile(resolve(projectRoot, "publish/config.js"), javascript, { encoding: "utf8", mode: 0o600 });
} catch {
  // The publish directory is created by build:offline; public/config.js is enough for local development.
}

console.log("Google Maps runtime config synchronized without printing credentials.");
