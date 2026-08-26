import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const AREAS = Object.freeze({
  rokko: { lat: 34.778, lng: 135.263 },
  'kongo-katsuragi': { lat: 34.421, lng: 135.678 },
  ikoma: { lat: 34.684, lng: 135.678 },
  hokusetsu: { lat: 34.955, lng: 135.444 },
  izumi: { lat: 34.36, lng: 135.42 },
  kyoto: { lat: 35.105, lng: 135.74 },
  hira: { lat: 35.265, lng: 135.885 },
  'suzuka-ibuki': { lat: 35.072, lng: 136.418 },
  omine: { lat: 34.174, lng: 135.907 },
  'daiko-odai': { lat: 34.185, lng: 136.11 },
  tajima: { lat: 35.354, lng: 134.513 },
  daisen: { lat: 35.371, lng: 133.546 },
  tsurugi: { lat: 33.855, lng: 134.095 },
  arashima: { lat: 35.934, lng: 136.602 },
});

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * TTL_MS;
const ONE_CALL_RETRY_MS = 6 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 120;
const REQUEST_TIMEOUT_MS = 12 * 1000;

const port = parsePort(process.env.PORT);
const cacheFile =
  process.env.CACHE_FILE ||
  '/srv/helper_sites/services/osaka-mountain-weather/cache/weather.json';
const apiKey = process.env.OPENWEATHER_API_KEY?.trim() || '';

const cache = new Map();
const inFlight = new Map();
const rateBuckets = new Map();
let persistQueue = Promise.resolve();
let oneCallDisabledUntil = 0;

export function normalizeForecast(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.daily)) return [];
  return input.daily.slice(0, 14).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const weather = Array.isArray(raw.weather) ? raw.weather[0] : undefined;
    const description =
      weather && typeof weather.description === 'string'
        ? weather.description
        : '天气待确认';
    if (
      typeof raw.dt !== 'number' ||
      typeof raw.temp?.min !== 'number' ||
      typeof raw.temp?.max !== 'number'
    ) {
      return [];
    }
    return [{
      date: new Date(raw.dt * 1000).toISOString().slice(0, 10),
      min: Math.round(raw.temp.min),
      max: Math.round(raw.temp.max),
      pop: Math.round((typeof raw.pop === 'number' ? raw.pop : 0) * 100),
      rain: roundOne(typeof raw.rain === 'number' ? raw.rain : 0),
      wind: roundOne(typeof raw.wind_speed === 'number' ? raw.wind_speed : 0),
      summary: description,
    }];
  });
}

export function normalizeFiveDayForecast(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.list)) return [];
  const grouped = new Map();
  for (const raw of input.list) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.dt !== 'number' ||
      typeof raw.main?.temp_min !== 'number' ||
      typeof raw.main?.temp_max !== 'number'
    ) {
      continue;
    }
    const date = new Date(raw.dt * 1000).toISOString().slice(0, 10);
    const current = grouped.get(date);
    const weather = Array.isArray(raw.weather) ? raw.weather[0] : undefined;
    const summary =
      weather && typeof weather.description === 'string'
        ? weather.description
        : current?.summary ?? '天气待确认';
    grouped.set(date, {
      date,
      min: Math.round(Math.min(current?.min ?? Number.POSITIVE_INFINITY, raw.main.temp_min)),
      max: Math.round(Math.max(current?.max ?? Number.NEGATIVE_INFINITY, raw.main.temp_max)),
      pop: Math.max(
        current?.pop ?? 0,
        Math.round((typeof raw.pop === 'number' ? raw.pop : 0) * 100),
      ),
      rain: roundOne(
        (current?.rain ?? 0) +
          (typeof raw.rain?.['3h'] === 'number' ? raw.rain['3h'] : 0),
      ),
      wind: roundOne(
        Math.max(
          current?.wind ?? 0,
          typeof raw.wind?.speed === 'number' ? raw.wind.speed : 0,
        ),
      ),
      summary,
    });
  }
  return [...grouped.values()].slice(0, 5);
}

export function createWeatherServer() {
  return createServer(async (request, response) => {
    applyHeaders(response);
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return json(response, 405, { error: 'Method not allowed' });
    }

    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/health') {
      return json(response, 200, {
        status: 'ok',
        configured: Boolean(apiKey),
        cacheEntries: cache.size,
      });
    }
    if (requestUrl.pathname !== '/weather') {
      return json(response, 404, { error: 'Not found' });
    }
    if (!consumeRateLimit(clientAddress(request))) {
      response.setHeader('Retry-After', '60');
      return json(response, 429, { error: 'Too many requests' });
    }

    const rangeId = requestUrl.searchParams.get('rangeId') || '';
    const area = AREAS[rangeId];
    if (!area) return json(response, 400, { error: 'Unknown mountain area' });

    const now = Date.now();
    const cached = cache.get(rangeId);
    if (cached?.expiresAt > now) {
      return json(response, 200, cachedResponse('fresh', cached, false));
    }
    if (!apiKey) {
      return json(response, 200, {
        status: 'unconfigured',
        updatedAt: null,
        availableDays: 0,
        days: [],
        stale: false,
        message: '尚未配置 OpenWeather 服务端密钥。月度气候档案仍可使用。',
      });
    }

    try {
      const refreshed = await refreshRange(rangeId, area);
      return json(response, 200, cachedResponse('refreshed', refreshed, false));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'weather-refresh-failed',
          rangeId,
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      );
      if (cached && cached.fetchedAt > now - MAX_STALE_MS) {
        return json(response, 200, cachedResponse('stale', cached, true));
      }
      return json(response, 503, {
        status: 'stale',
        updatedAt: null,
        availableDays: 0,
        days: [],
        stale: true,
        message: '山地天气暂时无法更新，请稍后重试。',
      });
    }
  });
}

async function refreshRange(rangeId, area) {
  const existing = inFlight.get(rangeId);
  if (existing) return existing;

  const pending = fetchWeather(area)
    .then(async ({ days, sourceVersion }) => {
      if (!days.length) throw new Error('weather payload did not contain daily data');
      const now = Date.now();
      const entry = {
        days,
        fetchedAt: now,
        expiresAt: now + TTL_MS,
        sourceVersion,
      };
      cache.set(rangeId, entry);
      await persistCache();
      return entry;
    })
    .finally(() => inFlight.delete(rangeId));

  inFlight.set(rangeId, pending);
  return pending;
}

async function fetchWeather(area) {
  const params = new URLSearchParams({
    lat: String(area.lat),
    lon: String(area.lng),
    units: 'metric',
    lang: 'zh_cn',
    appid: apiKey,
  });

  if (Date.now() >= oneCallDisabledUntil) {
    const oneCall = await fetch(
      `https://api.openweathermap.org/data/4.0/onecall?${params}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (oneCall.ok) {
      return {
        days: normalizeForecast(await oneCall.json()),
        sourceVersion: 'openweather-one-call-4.0-normalized-v1',
      };
    }
    if ([401, 403, 404].includes(oneCall.status)) {
      oneCallDisabledUntil = Date.now() + ONE_CALL_RETRY_MS;
    }
  }

  const fallback = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?${params}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!fallback.ok) throw new Error(`OpenWeather fallback returned ${fallback.status}`);
  return {
    days: normalizeFiveDayForecast(await fallback.json()),
    sourceVersion: 'openweather-forecast-2.5-normalized-v1',
  };
}

async function loadCache() {
  try {
    const stored = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (!stored || typeof stored !== 'object') return;
    for (const [rangeId, entry] of Object.entries(stored)) {
      if (
        AREAS[rangeId] &&
        entry &&
        typeof entry === 'object' &&
        Array.isArray(entry.days) &&
        typeof entry.fetchedAt === 'number' &&
        typeof entry.expiresAt === 'number'
      ) {
        cache.set(rangeId, entry);
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error(JSON.stringify({ event: 'cache-load-failed', message: String(error) }));
    }
  }
}

function persistCache() {
  const snapshot = JSON.stringify(Object.fromEntries(cache), null, 2);
  persistQueue = persistQueue
    .then(async () => {
      await mkdir(dirname(cacheFile), { recursive: true });
      const temporary = `${cacheFile}.tmp`;
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, cacheFile);
    })
    .catch((error) => {
      console.error(JSON.stringify({ event: 'cache-save-failed', message: String(error) }));
    });
  return persistQueue;
}

function cachedResponse(status, entry, stale) {
  return {
    status,
    updatedAt: new Date(entry.fetchedAt).toISOString(),
    availableDays: entry.days.length,
    days: entry.days,
    stale,
    message: stale ? '更新失败，正在显示上次成功取得的数据。' : undefined,
  };
}

function applyHeaders(response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function json(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function clientAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return request.socket.remoteAddress || 'unknown';
}

function consumeRateLimit(address) {
  const now = Date.now();
  const current = rateBuckets.get(address);
  if (!current || current.startedAt <= now - RATE_WINDOW_MS) {
    rateBuckets.set(address, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_MAX;
}

function parsePort(value) {
  const parsed = Number(value || 4188);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return parsed;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

const isMain =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;

if (isMain) {
  await loadCache();
  const server = createWeatherServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({ event: 'weather-service-ready', port }));
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
