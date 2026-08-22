import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const envPath = path.resolve(process.argv[2] ?? path.join(projectRoot, ".env"));
const outputPath = path.join(projectRoot, "app", "properties", "city-tower-furukawabashi", "map-cache.json");
const origin = { name: "City Tower 古川桥", lat: 34.741652, lng: 135.5905763 };

const curatedFacilities = [
  { id: "furukawabashi-station", name: "古川桥站", label: "古川桥站", iconType: "station", query: "京阪古川橋駅", category: "transit" },
  { id: "kadomashi-station", name: "门真市站", label: "门真市站", iconType: "station", query: "京阪門真市駅", category: "transit" },
  { id: "moriguchishi-station", name: "守口市站", label: "守口市站", iconType: "station", query: "京阪守口市駅", category: "transit" },
  { id: "owada-station", name: "大和田站", label: "大和田站", iconType: "station", query: "京阪大和田駅 大阪", category: "transit" },
  { id: "soyora", name: "そよら古川桥站前", label: "Soyora", iconType: "mall", query: "そよら古川橋駅前", category: "life" },
  { id: "satake", name: "Foods Market Satake", label: "Satake", iconType: "supermarket", query: "Foods Market satake コア古川橋店", category: "life" },
  { id: "lalaport", name: "LaLaport / Outlet 门真", label: "LaLaport门真", iconType: "mall", query: "ららぽーと門真", category: "life" },
  { id: "costco", name: "Costco 门真", label: "Costco门真", iconType: "supermarket", query: "コストコホールセール 門真倉庫店", category: "life" },
  { id: "kadomado", name: "KADOMADO 文化创造图书馆", label: "KADOMADO", iconType: "library", query: "門真市立文化創造図書館 KADOMADO", category: "life" },
  { id: "kadoma-gym", name: "门真市立综合体育馆", label: "门真综合体育馆", iconType: "gym", query: "門真市立総合体育館", category: "sports" },
  { id: "ractab", name: "RACTAB Dome", label: "RACTAB Dome", iconType: "pool", query: "東和薬品RACTABドーム", category: "sports" },
  { id: "moriguchi-gym", name: "守口市民体育馆", label: "守口体育馆", iconType: "gym", query: "守口市民体育館", category: "sports" },
  { id: "tsurumi-gym", name: "鹤见体育中心", label: "鹤见体育中心", iconType: "gym", query: "大阪市立鶴見スポーツセンター", category: "sports" },
  { id: "asahi-gym", name: "旭体育中心", label: "旭体育中心", iconType: "gym", query: "大阪市立旭スポーツセンター", category: "sports" },
  { id: "joto-gym", name: "城东体育中心", label: "城东体育中心", iconType: "gym", query: "大阪市立城東スポーツセンター", category: "sports" },
  { id: "miyakojima-gym", name: "都岛体育中心", label: "都岛体育中心", iconType: "gym", query: "大阪市立都島スポーツセンター", category: "sports" },
  { id: "higashiyodogawa-gym", name: "东淀川体育中心", label: "东淀川体育中心", iconType: "gym", query: "大阪市立東淀川スポーツセンター", category: "sports" },
  { id: "kita-gym", name: "北体育中心", label: "北体育中心", iconType: "gym", query: "大阪市立北スポーツセンター", category: "sports" },
  { id: "chuo-gym", name: "中央体育中心", label: "中央体育中心", iconType: "gym", query: "大阪市立中央スポーツセンター", category: "sports" },
  { id: "neyagawa-gym", name: "寝屋川市立市民体育馆", label: "寝屋川体育馆", iconType: "gym", query: "寝屋川市立市民体育館", category: "sports" },
  { id: "daito-gym", name: "大东市立市民体育馆", label: "大东市民体育馆", iconType: "gym", query: "大東市立市民体育館", category: "sports" },
  { id: "shijonawate-gym", name: "四条畷市立市民综合体育馆", label: "四条畷体育馆", iconType: "gym", query: "四條畷市立市民総合体育館", category: "sports" },
  { id: "hirakata-gym", name: "枚方市立综合体育馆", label: "枚方综合体育馆", iconType: "gym", query: "枚方市立総合体育館", category: "sports" },
];

const nearbyPlaceSpecs = [
  { id: "convenience", type: "convenience_store", iconType: "convenience", category: "life", limit: 7 },
  { id: "supermarket", type: "supermarket", iconType: "supermarket", category: "life", limit: 8 },
];

const routeTargets = [
  { id: "furukawabashi", provider: "google", name: "古川桥站", query: "京阪古川橋駅", mode: "walking" },
  { id: "kyobashi", provider: "ekispert", name: "京桥", lat: 34.696923, lng: 135.5333072 },
  { id: "yodoyabashi", provider: "ekispert", name: "淀屋桥", lat: 34.692307, lng: 135.501924 },
  { id: "osaka", provider: "ekispert", name: "梅田 / 大阪站", lat: 34.7024854, lng: 135.4959506 },
  { id: "honmachi", provider: "ekispert", name: "本町", lat: 34.681971, lng: 135.500447 },
  { id: "namba", provider: "ekispert", name: "难波", lat: 34.666136, lng: 135.500267 },
  { id: "tennoji", provider: "ekispert", name: "天王寺", lat: 34.646657, lng: 135.51386 },
  { id: "shin-osaka", provider: "ekispert", name: "新大阪", lat: 34.7334658, lng: 135.5002547 },
  { id: "itami", provider: "ekispert", name: "大阪伊丹机场", lat: 34.7913957, lng: 135.4420095 },
  { id: "kansai", provider: "ekispert", name: "关西机场", lat: 34.435897, lng: 135.2438775 },
  { id: "lalaport", provider: "google", name: "LaLaport门真", query: "ららぽーと門真", mode: "driving" },
  { id: "costco", provider: "google", name: "Costco门真", query: "コストコホールセール 門真倉庫店", mode: "driving" },
  { id: "kadoma-gym", provider: "google", name: "门真综合体育馆", query: "門真市立総合体育館", mode: "walking" },
  { id: "ractab", provider: "google", name: "RACTAB Dome", query: "東和薬品RACTABドーム", mode: "driving" },
  { id: "moriguchi-gym", provider: "google", name: "守口体育馆", query: "守口市民体育館", mode: "driving" },
  { id: "tsurumi-gym", provider: "google", name: "鹤见体育中心", query: "大阪市立鶴見スポーツセンター", mode: "driving" },
  { id: "joto-gym", provider: "google", name: "城东体育中心", query: "大阪市立城東スポーツセンター", mode: "driving" },
  { id: "neyagawa-gym", provider: "google", name: "寝屋川体育馆", query: "寝屋川市立市民体育館", mode: "driving" },
];
function shortPlaceLabel(name) {
  return name
    .replace(/セブン[‐－-]イレブン/gu, "7-Eleven")
    .replace(/ファミリーマート/gu, "FamilyMart")
    .replace(/ローソンストア100/gu, "Lawson 100")
    .replace(/ローソン/gu, "Lawson")
    .replace(/デイリーヤマザキ/gu, "Daily Yamazaki")
    .replace(/食品館アプロ/gu, "食品馆 Apro")
    .replace(/万代/gu, "万代")
    .slice(0, 22);
}

async function nearbyPlaces(spec, googleKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.search = new URLSearchParams({
    location: `${origin.lat},${origin.lng}`,
    rankby: "distance",
    type: spec.type,
    language: "ja",
    key: googleKey,
  }).toString();
  const body = await json(url);
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") throw new Error(`Google nearby search failed for ${spec.id}: ${body.status}`);
  return asArray(body.results)
    .filter((place) => place?.geometry?.location && place.business_status !== "CLOSED_PERMANENT")
    .filter((place) => spec.type !== "supermarket" || !/(グラーノ|ドラッグ|薬局|ベーカリー)/u.test(place.name))
    .slice(0, spec.limit)
    .map((place, index) => ({
      id: `${spec.id}-${index + 1}`,
      name: place.name,
      label: shortPlaceLabel(place.name),
      iconType: spec.iconType,
      category: spec.category,
      vicinity: place.vicinity ?? "",
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    }));
}
function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match) return [];
    return [[match[1], match[2].replace(/^['"]|['"]$/gu, "")]];
  }));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tokyoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}${read("month")}${read("day")}`;
}

async function json(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.origin}${url.pathname}`);
  return body;
}

async function geocode(query, googleKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.search = new URLSearchParams({ address: query, region: "jp", language: "ja", key: googleKey }).toString();
  const body = await json(url);
  if (body.status !== "OK" || !body.results?.[0]?.geometry?.location) throw new Error(`Google geocode failed for ${query}: ${body.status}`);
  return body.results[0].geometry.location;
}

function decodePolyline(encoded) {
  const path = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const key of ["lat", "lng"]) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : result >> 1;
      if (key === "lat") lat += delta;
      else lng += delta;
    }
    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}

function stripHtml(value = "") {
  return value.replace(/<[^>]*>/gu, "").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&");
}

async function googleRoute(target, googleKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.search = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: target.query,
    mode: target.mode,
    language: "zh-CN",
    region: "jp",
    key: googleKey,
  }).toString();
  const body = await json(url);
  if (body.status !== "OK" || !body.routes?.[0]?.legs?.[0]) throw new Error(`Google directions failed for ${target.id}: ${body.status}`);
  const route = body.routes[0];
  const leg = route.legs[0];
  return {
    provider: "google",
    mode: target.mode,
    name: target.name,
    durationMinutes: Math.round((leg.duration?.value ?? 0) / 60),
    durationText: leg.duration?.text ?? "",
    distanceMeters: leg.distance?.value ?? 0,
    distanceText: leg.distance?.text ?? "",
    steps: asArray(leg.steps).map((step) => ({ instruction: stripHtml(step.html_instructions), durationText: step.duration?.text ?? "", distanceText: step.distance?.text ?? "" })),
    path: decodePolyline(route.overview_polyline?.points ?? ""),
  };
}

async function nearbyStation(point, ekispertKey) {
  const url = new URL("https://api.ekispert.jp/v1/json/geo/station");
  url.search = new URLSearchParams({ key: ekispertKey, geoPoint: `${point.lat},${point.lng},wgs84,1200` }).toString();
  const body = await json(url);
  const providerError = body.ResultSet?.Error;
  if (providerError) throw new Error(`Ekispert station lookup failed: ${providerError.code}`);
  const station = asArray(body.ResultSet?.Point).find((item) => {
    const type = item?.Station?.Type;
    return (typeof type === "string" ? type : type?.text) === "train";
  });
  if (!station?.Station?.Name) throw new Error("Ekispert did not return a nearby train station");
  return station.Station.Name;
}

function extractFare(course) {
  const prices = asArray(course?.Price);
  const summary = toNumber(prices.find((item) => item?.kind === "Summary")?.Oneway);
  if (summary && summary > 0) return Math.round(summary);
  const fare = toNumber(prices.find((item) => item?.kind === "FareSummary")?.Oneway) ?? 0;
  const charge = toNumber(prices.find((item) => item?.kind === "ChargeSummary")?.Oneway) ?? 0;
  return fare + charge || undefined;
}

async function ekispertRoute(target, ekispertKey, originStation) {
  const destinationStation = await nearbyStation(target, ekispertKey);
  const url = new URL("https://api.ekispert.jp/v1/json/search/course/plain");
  url.search = new URLSearchParams({ key: ekispertKey, from: originStation, to: destinationStation, date: tokyoDate() }).toString();
  const body = await json(url);
  const course = asArray(body.ResultSet?.Course)[0];
  if (!course) throw new Error(`Ekispert route failed for ${target.id}`);
  const route = course.Route ?? {};
  const lines = asArray(route.Line);
  const points = asArray(route.Point);
  return {
    provider: "ekispert",
    mode: "transit",
    name: target.name,
    durationMinutes: Math.round((toNumber(route.timeOnBoard) ?? 0) + (toNumber(route.timeWalk) ?? 0) + (toNumber(route.timeOther) ?? 0)),
    transferCount: Math.max(0, Math.round(toNumber(route.transferCount) ?? Math.max(0, lines.length - 1))),
    walkingMinutes: Math.round(toNumber(route.timeWalk) ?? 0),
    fareYen: extractFare(course),
    steps: lines.map((line, index) => ({ line: line?.Name ?? "公共交通", from: points[index]?.Station?.Name ?? "出发站", to: points[index + 1]?.Station?.Name ?? "到达站", minutes: toNumber(line?.timeOnBoard) ?? 0 })),
    path: points.map((point) => ({ lat: toNumber(point?.GeoPoint?.lati_d), lng: toNumber(point?.GeoPoint?.longi_d) })).filter((point) => point.lat != null && point.lng != null),
  };
}

const env = parseEnv(await readFile(envPath, "utf8"));
const googleKey = env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const ekispertKey = (env.EKISPERT_API_KEY ?? env.VITE_EKISPERT_API_KEY)?.trim();
if (!googleKey || !ekispertKey) throw new Error("Google Maps or Ekispert key is missing from the source env.");

const cachedCuratedFacilities = await Promise.all(curatedFacilities.map(async (facility) => ({ ...facility, ...await geocode(facility.query, googleKey) })));
const cachedNearbyFacilities = (await Promise.all(nearbyPlaceSpecs.map((spec) => nearbyPlaces(spec, googleKey)))).flat();
const cachedFacilities = [...cachedCuratedFacilities, ...cachedNearbyFacilities];
const originStation = await nearbyStation(origin, ekispertKey);
const routeEntries = await Promise.all(routeTargets.map(async (target) => [
  target.id,
  target.provider === "ekispert" ? await ekispertRoute(target, ekispertKey, originStation) : await googleRoute(target, googleKey),
]));
const output = {
  generatedAt: new Date().toISOString(),
  cachePolicy: "开发时生成；页面点击不调用路线或地点 API。建议至少每30天刷新一次。",
  origin,
  facilitySummary: {
    total: cachedFacilities.length,
    convenienceStores: cachedFacilities.filter((item) => item.iconType === "convenience").length,
    supermarkets: cachedFacilities.filter((item) => item.iconType === "supermarket").length,
    sports: cachedFacilities.filter((item) => item.category === "sports").length,
    transit: cachedFacilities.filter((item) => item.category === "transit").length,
  },
  facilities: cachedFacilities,
  routes: Object.fromEntries(routeEntries),
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Property map cache generated: ${cachedFacilities.length} facilities, ${routeEntries.length} routes. No credentials were written.`);
