import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const envPath = path.resolve(process.argv[2] ?? path.join(projectRoot, ".env"));

const sportsFacilities = [
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
];

const commonTransitTargets = [
  { id: "kadomashi", provider: "ekispert", name: "门真市", lat: 34.7383, lng: 135.5833 },
  { id: "kyobashi", provider: "ekispert", name: "京桥", lat: 34.696923, lng: 135.5333072 },
  { id: "osaka", provider: "ekispert", name: "梅田 / 大阪站", lat: 34.7024854, lng: 135.4959506 },
  { id: "honmachi", provider: "ekispert", name: "本町", lat: 34.681971, lng: 135.500447 },
  { id: "namba", provider: "ekispert", name: "难波", lat: 34.666136, lng: 135.500267 },
  { id: "shin-osaka", provider: "ekispert", name: "新大阪", lat: 34.7334658, lng: 135.5002547 },
  { id: "itami", provider: "ekispert", name: "大阪伊丹机场", lat: 34.7913957, lng: 135.4420095 },
  { id: "kansai", provider: "ekispert", name: "关西机场", lat: 34.435897, lng: 135.2438775 },
];

const properties = [
  {
    slug: "scenes-sekime-takadono",
    name: "Scenes 关目高殿 Square Garden",
    originQuery: "シーンズ関目高殿スクエアガーデン",
    facilities: [
      { id: "sekime-takadono-station", name: "关目高殿站", label: "关目高殿站", iconType: "station", query: "関目高殿駅", category: "transit" },
      { id: "sekime-seiiku-station", name: "关目成育站", label: "关目成育站", iconType: "station", query: "関目成育駅", category: "transit" },
      { id: "sekime-station", name: "关目站", label: "关目站", iconType: "station", query: "京阪関目駅", category: "transit" },
      { id: "jr-noe-station", name: "JR野江站", label: "JR野江站", iconType: "station", query: "JR野江駅", category: "transit" },
      { id: "tsurumi-ryokuchi", name: "花博纪念公园鹤见绿地", label: "鹤见绿地", iconType: "park", query: "花博記念公園 鶴見緑地", category: "life" },
      { id: "aeon-tsurumi", name: "AEON Mall 鹤见绿地", label: "AEON鹤见", iconType: "mall", query: "イオンモール鶴見緑地", category: "life" },
    ],
    routes: [
      { id: "sekime-takadono", provider: "google", name: "关目高殿站", query: "関目高殿駅", mode: "walking" },
      ...commonTransitTargets,
      { id: "asahi-gym", provider: "google", name: "旭体育中心", query: "大阪市立旭スポーツセンター", mode: "driving" },
      { id: "tsurumi-gym", provider: "google", name: "鹤见体育中心", query: "大阪市立鶴見スポーツセンター", mode: "driving" },
      { id: "kadoma-gym", provider: "google", name: "门真综合体育馆", query: "門真市立総合体育館", mode: "driving" },
    ],
  },
  {
    slug: "wellith-dainichi",
    name: "Wellith 大日",
    originQuery: "ウエリス大日 守口市梶町1丁目",
    facilities: [
      { id: "dainichi-station", name: "大日站", label: "大日站", iconType: "station", query: "大日駅", category: "transit" },
      { id: "kadomashi-station", name: "门真市站", label: "门真市站", iconType: "station", query: "門真市駅", category: "transit" },
      { id: "furukawabashi-station", name: "古川桥站", label: "古川桥站", iconType: "station", query: "古川橋駅", category: "transit" },
      { id: "aeon-dainichi", name: "AEON Mall 大日", label: "AEON大日", iconType: "mall", query: "イオンモール大日", category: "life" },
      { id: "lalaport", name: "LaLaport / Outlet 门真", label: "LaLaport门真", iconType: "mall", query: "ららぽーと門真", category: "life" },
      { id: "costco", name: "Costco 门真", label: "Costco门真", iconType: "supermarket", query: "コストコホールセール 門真倉庫店", category: "life" },
    ],
    routes: [
      { id: "dainichi", provider: "google", name: "大日站", query: "大日駅", mode: "walking" },
      ...commonTransitTargets,
      { id: "kadoma-gym", provider: "google", name: "门真综合体育馆", query: "門真市立総合体育館", mode: "driving" },
      { id: "ractab", provider: "google", name: "RACTAB Dome", query: "東和薬品RACTABドーム", mode: "driving" },
      { id: "moriguchi-gym", provider: "google", name: "守口体育馆", query: "守口市民体育館", mode: "driving" },
    ],
  },
];

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/gu, "")]] : [];
  }));
}

function asArray(value) { return value ? (Array.isArray(value) ? value : [value]) : []; }
function toNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : undefined; }
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

function shortPlaceLabel(name) {
  return name.replace(/セブン[‐－-]イレブン/gu, "7-Eleven").replace(/ファミリーマート/gu, "FamilyMart").replace(/ローソンストア100/gu, "Lawson 100").replace(/ローソン/gu, "Lawson").replace(/デイリーヤマザキ/gu, "Daily Yamazaki").slice(0, 22);
}

async function nearbyPlaces(origin, spec, googleKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.search = new URLSearchParams({ location: `${origin.lat},${origin.lng}`, rankby: "distance", type: spec.type, language: "ja", key: googleKey }).toString();
  const body = await json(url);
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") throw new Error(`Google nearby search failed for ${spec.id}: ${body.status}`);
  return asArray(body.results)
    .filter((place) => place?.geometry?.location && place.business_status !== "CLOSED_PERMANENT")
    .filter((place) => spec.type !== "supermarket" || !/(グラーノ|ドラッグ|薬局|ベーカリー)/u.test(place.name))
    .slice(0, spec.limit)
    .map((place, index) => ({ id: `${spec.id}-${index + 1}`, name: place.name, label: shortPlaceLabel(place.name), iconType: spec.iconType, category: "life", vicinity: place.vicinity ?? "", lat: place.geometry.location.lat, lng: place.geometry.location.lng }));
}

function decodePolyline(encoded) {
  const output = [];
  let index = 0; let lat = 0; let lng = 0;
  while (index < encoded.length) {
    for (const key of ["lat", "lng"]) {
      let result = 0; let shift = 0; let byte;
      do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : result >> 1;
      if (key === "lat") lat += delta; else lng += delta;
    }
    output.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return output;
}

function stripHtml(value = "") { return value.replace(/<[^>]*>/gu, "").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&"); }

async function googleRoute(origin, target, googleKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.search = new URLSearchParams({ origin: `${origin.lat},${origin.lng}`, destination: target.query, mode: target.mode, language: "zh-CN", region: "jp", key: googleKey }).toString();
  const body = await json(url);
  const route = body.routes?.[0]; const leg = route?.legs?.[0];
  if (body.status !== "OK" || !leg) throw new Error(`Google directions failed for ${target.id}: ${body.status}`);
  return { provider: "google", mode: target.mode, name: target.name, durationMinutes: Math.round((leg.duration?.value ?? 0) / 60), durationText: leg.duration?.text ?? "", distanceMeters: leg.distance?.value ?? 0, distanceText: leg.distance?.text ?? "", steps: asArray(leg.steps).map((step) => ({ instruction: stripHtml(step.html_instructions), durationText: step.duration?.text ?? "", distanceText: step.distance?.text ?? "" })), path: decodePolyline(route.overview_polyline?.points ?? "") };
}

async function nearbyStation(point, ekispertKey) {
  const url = new URL("https://api.ekispert.jp/v1/json/geo/station");
  url.search = new URLSearchParams({ key: ekispertKey, geoPoint: `${point.lat},${point.lng},wgs84,1500` }).toString();
  const body = await json(url);
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
  return (toNumber(prices.find((item) => item?.kind === "FareSummary")?.Oneway) ?? 0) + (toNumber(prices.find((item) => item?.kind === "ChargeSummary")?.Oneway) ?? 0) || undefined;
}

async function ekispertRoute(target, ekispertKey, originStation) {
  const destinationStation = await nearbyStation(target, ekispertKey);
  const url = new URL("https://api.ekispert.jp/v1/json/search/course/plain");
  url.search = new URLSearchParams({ key: ekispertKey, from: originStation, to: destinationStation, date: tokyoDate() }).toString();
  const body = await json(url);
  const course = asArray(body.ResultSet?.Course)[0];
  if (!course) throw new Error(`Ekispert route failed for ${target.id}`);
  const route = course.Route ?? {}; const lines = asArray(route.Line); const points = asArray(route.Point);
  return { provider: "ekispert", mode: "transit", name: target.name, durationMinutes: Math.round((toNumber(route.timeOnBoard) ?? 0) + (toNumber(route.timeWalk) ?? 0) + (toNumber(route.timeOther) ?? 0)), transferCount: Math.max(0, Math.round(toNumber(route.transferCount) ?? Math.max(0, lines.length - 1))), walkingMinutes: Math.round(toNumber(route.timeWalk) ?? 0), fareYen: extractFare(course), steps: lines.map((line, index) => ({ line: line?.Name ?? "公共交通", from: points[index]?.Station?.Name ?? "出发站", to: points[index + 1]?.Station?.Name ?? "到达站", minutes: toNumber(line?.timeOnBoard) ?? 0 })), path: points.map((point) => ({ lat: toNumber(point?.GeoPoint?.lati_d), lng: toNumber(point?.GeoPoint?.longi_d) })).filter((point) => point.lat != null && point.lng != null) };
}

const env = parseEnv(await readFile(envPath, "utf8"));
const googleKey = env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const ekispertKey = (env.EKISPERT_API_KEY ?? env.VITE_EKISPERT_API_KEY)?.trim();
if (!googleKey || !ekispertKey) throw new Error("Google Maps or Ekispert key is missing from the source env.");

for (const property of properties) {
  const originPoint = await geocode(property.originQuery, googleKey);
  const origin = { name: property.name, ...originPoint };
  const curated = [...property.facilities, ...sportsFacilities];
  const cachedCurated = await Promise.all(curated.map(async (facility) => ({ ...facility, ...await geocode(facility.query, googleKey) })));
  const cachedNearby = (await Promise.all([
    nearbyPlaces(origin, { id: "convenience", type: "convenience_store", iconType: "convenience", limit: 7 }, googleKey),
    nearbyPlaces(origin, { id: "supermarket", type: "supermarket", iconType: "supermarket", limit: 8 }, googleKey),
  ])).flat();
  const facilities = [...cachedCurated, ...cachedNearby];
  const originStation = await nearbyStation(origin, ekispertKey);
  const routeEntries = await Promise.all(property.routes.map(async (target) => [target.id, target.provider === "ekispert" ? await ekispertRoute(target, ekispertKey, originStation) : await googleRoute(origin, target, googleKey)]));
  const output = {
    generatedAt: new Date().toISOString(),
    cachePolicy: "开发时生成；页面点击不调用路线或地点 API。建议至少每30天刷新一次。",
    origin,
    facilitySummary: { total: facilities.length, convenienceStores: facilities.filter((item) => item.iconType === "convenience").length, supermarkets: facilities.filter((item) => item.iconType === "supermarket").length, sports: facilities.filter((item) => item.category === "sports").length, transit: facilities.filter((item) => item.category === "transit").length },
    facilities,
    routes: Object.fromEntries(routeEntries),
  };
  const destination = path.join(projectRoot, "app", "properties", property.slug);
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "map-cache.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`${property.slug}: ${facilities.length} facilities, ${routeEntries.length} routes. No credentials were written.`);
}
