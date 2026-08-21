import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const bundleDir = resolve(projectRoot, "standalone-dist");
const outputDir = resolve(projectRoot, "offline");
const outputFile = resolve(outputDir, "osaka-east-home-guide.html");

const cssFile = (await readdir(bundleDir)).find((file) => file.endsWith(".css"));

if (!cssFile) {
  throw new Error("Standalone CSS bundle was not generated.");
}

const [css, javascript] = await Promise.all([
  readFile(resolve(bundleDir, cssFile), "utf8"),
  readFile(resolve(bundleDir, "app.js"), "utf8"),
]);

const safeJavascript = javascript.replaceAll("</script", "<\\/script");
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>大阪东线置业研究所｜门真市通勤购房地图</title>
    <meta name="description" content="大阪谷町线与京阪本线购房区域研究：通勤、房价、楼盘与风险。">
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${safeJavascript}</script>
  </body>
</html>
`;

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, html, "utf8");

const forbiddenReferences = [
  /<script[^>]+src=/i,
  /<link[^>]+rel=["']stylesheet["']/i,
  /(?:src|href)=["']\/(?!\/)/i,
];

const documentShell = html.replace(/<script>[\s\S]*<\/script>/i, "<script></script>");

for (const pattern of forbiddenReferences) {
  if (pattern.test(documentShell)) {
    throw new Error(`Standalone output contains a local dependency: ${pattern}`);
  }
}

console.log(`Created ${outputFile}`);
