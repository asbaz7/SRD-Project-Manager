import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInterruption, zoneOffset } from '../src/interruptionText.js';

// 16:00 in the Maldives (UTC+5).
const now = new Date('2026-10-22T11:00:00Z');
const read = (text, assets = []) => readInterruption(text.split(' '), { assets, now, offsetMin: 300 });
const ASSETS = [
  { id: 'g3', kind: 'genset', tag: '3', service: 'electricity', facility_id: 'ph' },
  { id: 'ro1', kind: 'ro_unit', tag: 'RO-1', service: 'water', facility_id: 'ro' },
];

test('a genset named anywhere, and an island-wide cut, read as a critical power outage', () => {
  const x = read('G3 tripped since 14:20, whole island off, about 300 customers', ASSETS);
  assert.equal(x.asset.id, 'g3');
  assert.equal(x.service, 'electricity');
  assert.equal(x.category, 'outage');
  assert.equal(x.severity, 'critical');
  assert.equal(x.started_at.toISOString(), '2026-10-22T09:20:00.000Z');
  assert.equal(x.customers_affected, 300);
  assert.equal(x.resolved_at, null);
});

test('flags first win; service words stay in the title', () => {
  const x = read('water high supply cut to north ward');
  assert.equal(x.title, 'water supply cut to north ward');
  assert.equal(x.service, 'water');
  assert.equal(x.severity, 'high');
  assert.equal(x.category, 'outage');
  assert.equal(read('power cut to the harbour area').title, 'power cut to the harbour area');
  assert.equal(read('power cut to the harbour area').severity, 'medium', 'part of the island');
});

test('a time range is an interruption already over; past midnight it started the day before', () => {
  let x = read('feeder 2 tripped 13:05-13:40');
  assert.equal(x.started_at.toISOString(), '2026-10-22T08:05:00.000Z');
  assert.equal(x.resolved_at.toISOString(), '2026-10-22T08:40:00.000Z');
  x = read('blackout 23:40 to 00:20');
  assert.equal(x.started_at.toISOString(), '2026-10-21T18:40:00.000Z');
  assert.equal(x.resolved_at.toISOString(), '2026-10-21T19:20:00.000Z');
  // A time later than now is yesterday's.
  assert.equal(read('outage since 9pm').started_at.toISOString(), '2026-10-21T16:00:00.000Z');
  // Restored, no time: now.
  assert.equal(read('power cut at 2pm, restored').resolved_at.getTime(), now.getTime());
});

test('the kind of problem: quality, safety, planned work, breakdown', () => {
  assert.deepEqual(((x) => [x.service, x.category, x.severity, x.asset?.id])(read('RO 1 high tds, salty water', ASSETS)), ['water', 'quality', 'medium', 'ro1']);
  assert.deepEqual(((x) => [x.category, x.severity])(read('low voltage in the south ward')), ['quality', 'medium']);
  assert.deepEqual(((x) => [x.category, x.severity])(read('fire at the powerhouse panel')), ['safety', 'critical']);
  assert.deepEqual(((x) => [x.service, x.category])(read('sewage overflow at manhole near school')), ['sewerage', 'breakdown']);
  assert.deepEqual(((x) => [x.category, x.severity])(read('planned shutdown for cable jointing 10:00-12:00')), ['maintenance', 'low']);
  assert.equal(read('genset 9 radiator leak', ASSETS).asset, null, 'no such genset');
  assert.equal(read('200 litres spilled').customers_affected, null);
});

test('the time zone offset', () => {
  assert.equal(zoneOffset('Indian/Maldives', now), 300);
});
