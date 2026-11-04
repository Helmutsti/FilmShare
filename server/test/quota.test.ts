import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodStart, periodEnd, decide, type Usage } from '../src/quota.js';

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

const usage = (used: number): Usage => ({
  quota: 400 * GB, period: 'week', periodStart: '', resetAt: '', upload: used, download: 0, inProgress: 0, used, remaining: 400 * GB - used,
});

test('unica regola: dentro la quota parte subito, oltre va in approvazione', () => {
  assert.equal(decide(5 * GB, usage(0)).outcome, 'approved');
  assert.equal(decide(150 * GB, usage(0)).outcome, 'approved', 'nessuna soglia per file grandi');
  assert.equal(decide(2 * GB, usage(398 * GB)).outcome, 'approved', 'fino all\'ultimo byte della quota');
  assert.deepEqual(decide(5 * GB, usage(398 * GB)), { outcome: 'pending', reason: 'over_quota' });
});
