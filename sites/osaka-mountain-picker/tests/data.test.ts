import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areaMetrics,
  bodyGrade,
  calculateCourseConstant,
  isJapanHundredPeak,
  mountainAreas,
  peaks,
  routes,
} from '../app/mountain-data.ts';
import { matchesMountainSearch } from '../app/mountain-search.ts';
import { getMonthInsight } from '../app/month-insights.ts';

test('catalog has the planned breadth and valid relationships', () => {
  assert.equal(mountainAreas.length, 14);
  assert.equal(peaks.length, 64);
  assert.ok(routes.length >= 45);
  assert.ok(routes.filter((route) => route.contentStatus !== 'index').length >= 45);

  const areaIds = new Set(mountainAreas.map((area) => area.id));
  const peakIds = new Set(peaks.map((peak) => peak.id));
  assert.equal(areaIds.size, mountainAreas.length);
  assert.equal(peakIds.size, peaks.length);
  for (const peak of peaks) {
    assert.ok(areaIds.has(peak.areaId), peak.id);
    assert.ok(peak.reading.length > 0, `${peak.id} is missing kana`);
  }
  for (const route of routes) {
    assert.ok(areaIds.has(route.areaId), route.id);
    assert.ok(peakIds.has(route.peakId), route.id);
    assert.ok(route.sources.length > 0, route.id);
    assert.match(route.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['schematic','open-data','official-gpx'].includes(route.geometryStatus));
    if (route.geometryStatus === 'schematic') assert.equal(route.gpxUrl, undefined);
  }
});

test('season insight explains ordinary heat and snow mountain periods', () => {
  const ikoma=mountainAreas.find((area)=>area.id==='ikoma')!;
  const daisen=mountainAreas.find((area)=>area.id==='daisen')!;
  const summerInsight=getMonthInsight(ikoma,7);
  assert.match(summerInsight.items[0].value,/炎热|温暖/);
  const sunlight=summerInsight.items.find((item)=>item.label==='日出・日落与白天活动时间');
  assert.equal(sunlight?.wide,true);
  assert.match(sunlight?.value??'',/^日出 \d{2}:\d{2} · 日落 \d{2}:\d{2} · \d+h \d+m$/);
  assert.equal(getMonthInsight(daisen,0).snowPhase,'严冬期');
  assert.equal(getMonthInsight(daisen,3).snowPhase,'融雪・残雪期');
  assert.equal(getMonthInsight(daisen,10).snowPhase,'初雪・移行期');
});

test('multilingual search matches simplified Chinese, pinyin, kana, and romaji', () => {
  const rokko=mountainAreas.find((area)=>area.id==='rokko')!;
  const areaPeaks=peaks.filter((peak)=>peak.areaId===rokko.id);
  assert.equal(matchesMountainSearch(rokko,areaPeaks,'六甲山系'),true);
  assert.equal(matchesMountainSearch(rokko,areaPeaks,'liu jia shan'),true);
  assert.equal(matchesMountainSearch(rokko,areaPeaks,'ろっこう'),true);
  assert.equal(matchesMountainSearch(rokko,areaPeaks,'rokkou'),true);
});

test('Japan 100 Famous Mountains filter excludes regional, 200, and 300 lists', () => {
  const matchingPeaks=peaks.filter(isJapanHundredPeak);
  assert.ok(matchingPeaks.length > 0);
  assert.ok(matchingPeaks.every((peak)=>peak.lists.includes('日本百名山')));
  assert.equal(isJapanHundredPeak(peaks.find((peak)=>peak.id==='rokko-saikoho')!),false);
  assert.equal(isJapanHundredPeak(peaks.find((peak)=>peak.id==='ibuki')!),true);
});

test('course constant uses the official components and ceiling', () => {
  assert.equal(calculateCourseConstant(10, 5, 800, 800), Math.ceil(10 * 1.8 + 5 * 0.3 + 800 * 10 / 1000 + 800 * 0.6 / 1000));
  assert.equal(bodyGrade(10), 1);
  assert.equal(bodyGrade(22), 3);
  assert.equal(bodyGrade(34), 4);
});

test('monthly scores and aggregate ranges stay valid', () => {
  for (const area of mountainAreas) {
    assert.equal(area.monthScores.length, 12);
    for (const score of area.monthScores) assert.ok(score >= 0 && score <= 100);
    const metrics = areaMetrics(area.id);
    assert.ok(metrics.peakCount > 0);
    assert.ok(metrics.minCourse !== null && metrics.maxCourse !== null && metrics.minCourse <= metrics.maxCourse);
  }
});
