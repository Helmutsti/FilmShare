import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStart, periodEnd, inNightWindow, decide, downloadRateBytes, type Limits, type Usage } from '../src/quota.js';
import type { Settings } from '../src/db/settings.js';

const GB = 1024 ** 3;

test('periodi: la settimana parte il lunedì, il mese il giorno 1', () => {
  const wed = new Date(2026, 10, 4, 15, 30); // mercoledì 4 novembre 2026
  assert.deepEqual(periodStart('week', wed), new Date(2026, 10, 2));
  assert.deepEqual(periodEnd('week', wed), new Date(2026, 10, 9));
  const sun = new Date(2026, 10, 8, 23, 0);
  assert.deepEqual(periodStart('week', sun), new Date(2026, 10, 2));
  assert.deepEqual(periodStart('month', wed), new Date(2026, 10, 1));
  assert.deepEqual(periodEnd('month', wed), new Date(2026, 11, 1));
  assert.deepEqual(periodStart('day', wed), new Date(2026, 10, 4));
});

const s = {
  block_on_quota_exhausted: true, require_approval_over_threshold: true, slowdown_over_80: true,
  upload_approval_threshold: 10 * GB, download_approval_threshold: 50 * GB,
  night_window: { start: '00:00', end: '07:00' },
} as Settings;
const limits: Limits = { quota_bytes: 400 * GB, period: 'week', max_speed_kbps: 50_000, max_concurrent: 2, approval: 'over_threshold' };
const usage = (used: number): Usage => ({
  quota: 400 * GB, period: 'week', periodStart: '', resetAt: '', upload: used, download: 0, inProgress: 0, used, remaining: 400 * GB - used,
});

test('decisione: soglie, quota, "sempre" e "mai"', () => {
  assert.equal(decide('upload', 5 * GB, limits, usage(0), s).outcome, 'approved');
  assert.deepEqual(decide('upload', 11 * GB, limits, usage(0), s), { outcome: 'pending', reason: 'over_threshold' });
  assert.equal(decide('download', 40 * GB, limits, usage(0), s).outcome, 'approved');
  assert.deepEqual(decide('download', 5 * GB, limits, usage(398 * GB), s), { outcome: 'pending', reason: 'over_quota' });
  assert.equal(decide('upload', 100 * GB, { ...limits, approval: 'never' }, usage(0), s).outcome, 'approved');
  assert.deepEqual(decide('upload', 1, { ...limits, approval: 'always' }, usage(0), s), { outcome: 'pending', reason: 'always' });
});

test('velocità: notte senza limiti, oltre 80% rallenta a 10 Mbps', () => {
  assert.equal(inNightWindow(s, new Date(2026, 0, 1, 3, 0)), true);
  assert.equal(inNightWindow(s, new Date(2026, 0, 1, 7, 0)), false);
  assert.equal(inNightWindow({ ...s, night_window: { start: '23:00', end: '02:00' } }, new Date(2026, 0, 1, 1, 0)), true);
  const day = new Date(2026, 0, 1, 12, 0);
  assert.equal(downloadRateBytes(limits, usage(0), s, day), 50_000_000 / 8);
  assert.equal(downloadRateBytes(limits, usage(350 * GB), s, day), 10_000_000 / 8);
  assert.equal(downloadRateBytes(limits, usage(0), s, new Date(2026, 0, 1, 2, 0)), 0);
});
