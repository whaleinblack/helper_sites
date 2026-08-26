import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeFiveDayForecast,
  normalizeForecast,
} from '../server/weather-api.mjs';

test('normalizes One Call daily weather', () => {
  const days = normalizeForecast({
    daily: [{
      dt: 1_787_673_600,
      temp: { min: 12.4, max: 20.6 },
      pop: 0.42,
      rain: 3.24,
      wind_speed: 4.44,
      weather: [{ description: '小雨' }],
    }],
  });
  assert.deepEqual(days, [{
    date: '2026-08-25',
    min: 12,
    max: 21,
    pop: 42,
    rain: 3.2,
    wind: 4.4,
    summary: '小雨',
  }]);
});

test('aggregates three-hour forecast into daily weather', () => {
  const days = normalizeFiveDayForecast({
    list: [
      {
        dt: 1_787_673_600,
        main: { temp_min: 12.4, temp_max: 18.2 },
        pop: 0.2,
        rain: { '3h': 1.1 },
        wind: { speed: 3.2 },
        weather: [{ description: '多云' }],
      },
      {
        dt: 1_787_684_400,
        main: { temp_min: 10.2, temp_max: 20.7 },
        pop: 0.6,
        rain: { '3h': 2.3 },
        wind: { speed: 5.4 },
        weather: [{ description: '阵雨' }],
      },
    ],
  });
  assert.deepEqual(days, [{
    date: '2026-08-25',
    min: 10,
    max: 21,
    pop: 60,
    rain: 3.4,
    wind: 5.4,
    summary: '阵雨',
  }]);
});
