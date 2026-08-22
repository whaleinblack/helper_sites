import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4187);
const apiKey = process.env.EKISPERT_API_KEY?.trim() ?? "";
const upstream = "https://api.ekispert.jp/v1/json/search/course/plain";
const originPoint = { lat: 34.741652, lng: 135.5905763 };
const destinations = new Map([
  ["kyobashi", { lat: 34.696923, lng: 135.5333072, label: "京桥" }],
  ["osaka", { lat: 34.7024854, lng: 135.4959506, label: "梅田 / 大阪站" }],
  ["shin-osaka", { lat: 34.7334658, lng: 135.5002547, label: "新大阪" }],
  ["itami", { lat: 34.7913957, lng: 135.4420095, label: "大阪伊丹机场" }],
  ["kansai", { lat: 34.435897, lng: 135.2438775, label: "关西机场" }],
]);
const cache = new Map();
const stationCache = new Map();
const clients = new Map();

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tokyoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}${read("month")}${read("day")}`;
}

function messageFromError(error) {
  const message = error?.Message;
  if (typeof message === "string") return message;
  return asArray(message).map((item) => item?.text).filter(Boolean).join(" ");
}

function extractFare(course) {
  const prices = asArray(course?.Price);
  const summary = prices.find((item) => item?.kind === "Summary");
  const total = number(summary?.Oneway);
  if (total && total > 0) return Math.round(total);
  const fare = number(prices.find((item) => item?.kind === "FareSummary")?.Oneway) ?? 0;
  const charge = number(prices.find((item) => item?.kind === "ChargeSummary")?.Oneway)
    ?? prices.filter((item) => item?.kind === "Charge" && item?.selected === "true")
      .reduce((sum, item) => sum + (number(item?.Oneway) ?? 0), 0);
  return fare + charge || undefined;
}

function normalizeCourse(course, destination) {
  const route = course?.Route ?? {};
  const lines = asArray(route.Line);
  const points = asArray(route.Point);
  const durationMinutes = (number(route.timeOnBoard) ?? 0)
    + (number(route.timeWalk) ?? 0)
    + (number(route.timeOther) ?? 0);
  const steps = lines.map((line, index) => ({
    line: line?.Name ?? "公共交通",
    from: points[index]?.Station?.Name ?? "出发站",
    to: points[index + 1]?.Station?.Name ?? "到达站",
    minutes: number(line?.timeOnBoard) ?? 0,
  }));
  const path = points.map((point) => ({
    lat: number(point?.GeoPoint?.lati_d),
    lng: number(point?.GeoPoint?.longi_d),
  })).filter((point) => point.lat != null && point.lng != null);

  return {
    provider: "ekispert",
    origin: "古川桥站",
    destination: destination.label,
    durationMinutes: Math.round(durationMinutes),
    transferCount: Math.max(0, Math.round(number(route.transferCount) ?? Math.max(0, lines.length - 1))),
    walkingMinutes: Math.round(number(route.timeWalk) ?? 0),
    fareYen: extractFare(course),
    steps,
    path,
    isApproximate: true,
    checkedAt: new Date().toISOString(),
  };
}

function allowRequest(request) {
  const forwarded = String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const client = forwarded || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const state = clients.get(client);
  if (!state || now - state.startedAt > 60_000) {
    clients.set(client, { startedAt: now, count: 1 });
    return true;
  }
  state.count += 1;
  return state.count <= 30;
}

async function lookupStation(point) {
  const cacheKey = `${point.lat},${point.lng}`;
  if (stationCache.has(cacheKey)) return stationCache.get(cacheKey);
  const url = new URL("https://api.ekispert.jp/v1/json/geo/station");
  url.search = new URLSearchParams({
    key: apiKey,
    geoPoint: `${point.lat},${point.lng},wgs84,1200`,
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  const providerError = body?.ResultSet?.Error;
  if (!response.ok || providerError) {
    throw new Error(messageFromError(providerError) || `Ekispert station lookup HTTP ${response.status}`);
  }
  const points = asArray(body?.ResultSet?.Point);
  const station = points.find((item) => {
    const type = item?.Station?.Type;
    return (typeof type === "string" ? type : type?.text) === "train";
  })?.Station?.Name;
  if (!station) throw new Error("Ekispert 未找到附近铁路站");
  stationCache.set(cacheKey, station);
  return station;
}

async function fetchRoute(destination) {
  const date = tokyoDate();
  const cacheKey = `${destination.lat},${destination.lng}:${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 5 * 60_000) return cached.payload;
  const [originStation, destinationStation] = await Promise.all([
    lookupStation(originPoint),
    lookupStation(destination),
  ]);

  const url = new URL(upstream);
  url.search = new URLSearchParams({
    key: apiKey,
    from: originStation,
    to: destinationStation,
    date,
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  const providerError = body?.ResultSet?.Error;
  if (!response.ok || providerError) {
    throw new Error(messageFromError(providerError) || `Ekispert HTTP ${response.status}`);
  }
  const course = asArray(body?.ResultSet?.Course)[0];
  if (!course) throw new Error("Ekispert 没有返回可用路线");
  const payload = normalizeCourse(course, destination);
  cache.set(cacheKey, { createdAt: Date.now(), payload });
  return payload;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    send(response, apiKey ? 200 : 503, { ok: Boolean(apiKey), provider: "ekispert" });
    return;
  }
  if (request.method !== "GET" || url.pathname !== "/transit-route") {
    send(response, 404, { error: "not_found" });
    return;
  }
  if (!allowRequest(request)) {
    send(response, 429, { error: "rate_limited", hint: "路线查询过于频繁，请稍后重试。" });
    return;
  }
  if (!apiKey) {
    send(response, 503, { error: "provider_unavailable", hint: "服务器尚未配置 Ekispert。" });
    return;
  }
  const destination = destinations.get(url.searchParams.get("destination") ?? "");
  if (!destination) {
    send(response, 400, { error: "invalid_destination", hint: "不支持这个路线目的地。" });
    return;
  }
  try {
    send(response, 200, await fetchRoute(destination));
  } catch (error) {
    send(response, 502, {
      error: "ekispert_failed",
      hint: error instanceof Error ? error.message : "Ekispert 路线查询失败。",
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Osaka route API listening on 127.0.0.1:${port}`);
});
