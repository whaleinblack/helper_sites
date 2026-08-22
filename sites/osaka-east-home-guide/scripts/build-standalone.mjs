import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const bundleDir = resolve(projectRoot, "standalone-dist");
const outputDir = resolve(projectRoot, "offline");
const outputFile = resolve(outputDir, "osaka-east-home-guide.html");
const publishDir = resolve(projectRoot, "publish");

const cssFile = (await readdir(bundleDir)).find((file) => file.endsWith(".css"));

if (!cssFile) {
  throw new Error("Standalone CSS bundle was not generated.");
}

const [css, javascript] = await Promise.all([
  readFile(resolve(bundleDir, cssFile), "utf8"),
  readFile(resolve(bundleDir, "app.js"), "utf8"),
]);

const safeJavascript = javascript.replaceAll("</script", "<\\/script");

if (/\bprocess\.env\b|\brequire\s*\(/.test(javascript)) {
  throw new Error("Standalone JavaScript contains a server-only runtime reference.");
}

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

function createPublishedHtml({ title, description, configPath }) {
  return html
    .replace("<title>大阪东线置业研究所｜门真市通勤购房地图</title>", `<title>${title}</title>`)
    .replace('content="大阪谷町线与京阪本线购房区域研究：通勤、房价、楼盘与风险。"', `content="${description}"`)
    .replace("<script>", `<script src="${configPath}"></script>\n    <script>`);
}

const catalogPages = [
  ["cielia-moriguchi", "Cielia 守口", "定期借地权、户型、停车、通勤与投资价值研究。"],
  ["city-house-shimmori", "City House 新森", "站距、公园、停车、通勤与投资价值研究。"],
  ["liber-city-moriguchi", "Liber City 守口", "尾盘价格、停车、通勤与投资价值研究。"],
  ["park-homes-lala-kadoma", "Park Homes LaLa 门真", "次新挂牌、商业、停车与投资价值研究。"],
  ["proud-sekime", "Proud 关目", "品牌中古、面积、管理与投资价值研究。"],
  ["geo-sekime-takadono", "Geo 关目高殿", "站前中古、挂牌、管理与投资价值研究。"],
  ["sun-marks-dainichi", "Sun Marks 大日", "大规模塔楼群、修缮与投资价值研究。"],
  ["moriguchi-midsite-tower", "守口 Midsite Tower", "站前塔楼、挂牌、修缮与投资价值研究。"],
  ["river-garden-miyakojima", "River Garden 都岛", "都岛新筑、户型、停车与投资价值研究。"],
  ["cielia-kyobashi", "Cielia 京桥 The Residence", "京桥站前新筑、定期借地权与投资价值研究。"],
];

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, html, "utf8");
await mkdir(resolve(publishDir, "properties/city-tower-furukawabashi"), { recursive: true });
await mkdir(resolve(publishDir, "properties/scenes-sekime-takadono"), { recursive: true });
await mkdir(resolve(publishDir, "properties/wellith-dainichi"), { recursive: true });
for (const [slug] of catalogPages) await mkdir(resolve(publishDir, "properties", slug), { recursive: true });
await cp(resolve(projectRoot, "public/assets"), resolve(publishDir, "assets"), { recursive: true });
await writeFile(resolve(publishDir, "index.html"), createPublishedHtml({
  title: "大阪东线置业研究所｜门真市通勤购房地图",
  description: "大阪谷町线与京阪本线购房区域研究：通勤、房价、楼盘与风险。",
  configPath: "./config.js",
}), "utf8");
await writeFile(resolve(publishDir, "properties/city-tower-furukawabashi/index.html"), createPublishedHtml({
  title: "City Tower 古川桥｜大阪东线置业研究所",
  description: "City Tower 古川桥的户型价格、设计、停车、通勤、体育设施与投资价值研究。",
  configPath: "../../config.js",
}), "utf8");
await writeFile(resolve(publishDir, "properties/scenes-sekime-takadono/index.html"), createPublishedHtml({
  title: "Scenes 关目高殿｜大阪东线置业研究所",
  description: "Scenes 关目高殿的户型价格、设计、停车、通勤、体育设施与投资价值研究。",
  configPath: "../../config.js",
}), "utf8");
await writeFile(resolve(publishDir, "properties/wellith-dainichi/index.html"), createPublishedHtml({
  title: "Wellith 大日｜大阪东线置业研究所",
  description: "Wellith 大日的户型价格、公共空间、停车、通勤、体育设施与投资价值研究。",
  configPath: "../../config.js",
}), "utf8");
for (const [slug, title, description] of catalogPages) {
  await writeFile(resolve(publishDir, "properties", slug, "index.html"), createPublishedHtml({ title: `${title}｜大阪东线置业研究所`, description, configPath: "../../config.js" }), "utf8");
}

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
console.log(`Created publishable site in ${publishDir}`);
