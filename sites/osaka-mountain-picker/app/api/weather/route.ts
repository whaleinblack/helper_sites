import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { mountainAreas } from '../../mountain-data';

export const dynamic = 'force-dynamic';

type WeatherDay = {
  date: string;
  min: number;
  max: number;
  pop: number;
  rain: number;
  wind: number;
  summary: string;
};

type CacheRow = {
  payload_json: string;
  fetched_at: number;
  expires_at: number;
};

const SOURCE_VERSION = 'openweather-one-call-4.0-normalized-v1';
const TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const localPreview = requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
  if (!localPreview && !(await getChatGPTUser())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rangeId = requestUrl.searchParams.get('rangeId');
  const area = mountainAreas.find((item) => item.id === rangeId);
  if (!area) {
    return Response.json({ error: 'Unknown mountain area' }, { status: 400 });
  }

  const now = Date.now();
  let cached: CacheRow | null = null;
  try {
    await ensureTable();
    cached = await env.DB.prepare(
      'SELECT payload_json, fetched_at, expires_at FROM weather_cache WHERE range_id = ?1',
    )
      .bind(area.id)
      .first<CacheRow>();
  } catch {
    // The site remains usable when the local preview has no D1 binding.
  }

  if (cached && cached.expires_at > now) {
    return weatherResponse('fresh', cached, false);
  }

  const apiKey = env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    if (cached) return weatherResponse('stale', cached, true);
    return Response.json({
      status: 'unconfigured',
      updatedAt: null,
      availableDays: 0,
      days: [],
      stale: false,
      message: '尚未配置 OpenWeather 服务端密钥。月度气候档案仍可使用。',
    });
  }

  try {
    const params = new URLSearchParams({
      lat: String(area.lat),
      lon: String(area.lng),
      units: 'metric',
      lang: 'zh_cn',
      appid: apiKey,
    });
    const upstream = await fetch(`https://api.openweathermap.org/data/4.0/onecall?${params}`, {
      headers: { Accept: 'application/json' },
    });
    let payload: WeatherDay[];
    let sourceVersion = SOURCE_VERSION;
    if (upstream.ok) {
      payload = normalizeForecast(await upstream.json());
    } else {
      const fallbackParams = new URLSearchParams({
        lat: String(area.lat),
        lon: String(area.lng),
        units: 'metric',
        lang: 'zh_cn',
        appid: apiKey,
      });
      const fallback = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${fallbackParams}`, {
        headers: { Accept: 'application/json' },
      });
      if (!fallback.ok) throw new Error('weather upstream unavailable');
      payload = normalizeFiveDayForecast(await fallback.json());
      sourceVersion = 'openweather-forecast-2.5-normalized-v1';
    }
    if (!payload.length) throw new Error('weather payload did not contain daily data');

    const expiresAt = now + TTL_MS;
    try {
      await env.DB.prepare(
        `INSERT INTO weather_cache (range_id, payload_json, fetched_at, expires_at, source_version)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(range_id) DO UPDATE SET payload_json = excluded.payload_json,
           fetched_at = excluded.fetched_at, expires_at = excluded.expires_at,
           source_version = excluded.source_version`,
      )
        .bind(area.id, JSON.stringify(payload), now, expiresAt, sourceVersion)
        .run();
    } catch {
      // Live data can still be returned if caching is temporarily unavailable.
    }

    return Response.json({
      status: 'refreshed',
      updatedAt: new Date(now).toISOString(),
      availableDays: payload.length,
      days: payload,
      stale: false,
    });
  } catch {
    if (cached) return weatherResponse('stale', cached, true);
    return Response.json(
      {
        status: 'stale',
        updatedAt: null,
        availableDays: 0,
        days: [],
        stale: true,
        message: '山地天气暂时无法更新，请稍后重试。',
      },
      { status: 503 },
    );
  }
}

async function ensureTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS weather_cache (
      range_id TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      source_version TEXT NOT NULL
    )`,
  ).run();
}

function weatherResponse(status: 'fresh' | 'stale', cached: CacheRow, stale: boolean) {
  let days: WeatherDay[] = [];
  try {
    days = JSON.parse(cached.payload_json) as WeatherDay[];
  } catch {
    days = [];
  }
  return Response.json({
    status,
    updatedAt: new Date(cached.fetched_at).toISOString(),
    availableDays: days.length,
    days,
    stale,
    message: stale ? '更新失败，正在显示上次成功取得的数据。' : undefined,
  });
}

export function normalizeForecast(input: unknown): WeatherDay[] {
  if (!input || typeof input !== 'object') return [];
  const daily = (input as { daily?: unknown }).daily;
  if (!Array.isArray(daily)) return [];

  return daily.slice(0, 14).flatMap((raw): WeatherDay[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const temp = item.temp as Record<string, unknown> | undefined;
    const weather = Array.isArray(item.weather) ? item.weather[0] : undefined;
    const description =
      weather && typeof weather === 'object' && typeof (weather as Record<string, unknown>).description === 'string'
        ? String((weather as Record<string, unknown>).description)
        : '天气待确认';
    if (typeof item.dt !== 'number' || typeof temp?.min !== 'number' || typeof temp?.max !== 'number') return [];
    return [{
      date: new Date(item.dt * 1000).toISOString().slice(0, 10),
      min: Math.round(temp.min),
      max: Math.round(temp.max),
      pop: Math.round((typeof item.pop === 'number' ? item.pop : 0) * 100),
      rain: roundOne(typeof item.rain === 'number' ? item.rain : 0),
      wind: roundOne(typeof item.wind_speed === 'number' ? item.wind_speed : 0),
      summary: description,
    }];
  });
}

export function normalizeFiveDayForecast(input: unknown): WeatherDay[] {
  if (!input || typeof input !== 'object') return [];
  const list = (input as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  const grouped = new Map<string, WeatherDay>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const main = item.main as Record<string, unknown> | undefined;
    const wind = item.wind as Record<string, unknown> | undefined;
    const rain = item.rain as Record<string, unknown> | undefined;
    const weather = Array.isArray(item.weather) ? item.weather[0] : undefined;
    const timestamp = typeof item.dt === 'number' ? item.dt : null;
    if (timestamp === null || typeof main?.temp_min !== 'number' || typeof main?.temp_max !== 'number') continue;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const current = grouped.get(date);
    const summary = weather && typeof weather === 'object' && typeof (weather as Record<string, unknown>).description === 'string'
      ? String((weather as Record<string, unknown>).description)
      : current?.summary ?? '天气待确认';
    const next: WeatherDay = {
      date,
      min: Math.round(Math.min(current?.min ?? Number.POSITIVE_INFINITY, main.temp_min)),
      max: Math.round(Math.max(current?.max ?? Number.NEGATIVE_INFINITY, main.temp_max)),
      pop: Math.max(current?.pop ?? 0, Math.round((typeof item.pop === 'number' ? item.pop : 0) * 100)),
      rain: roundOne((current?.rain ?? 0) + (typeof rain?.['3h'] === 'number' ? rain['3h'] : 0)),
      wind: roundOne(Math.max(current?.wind ?? 0, typeof wind?.speed === 'number' ? wind.speed : 0)),
      summary,
    };
    grouped.set(date, next);
  }
  return [...grouped.values()].slice(0, 5);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
