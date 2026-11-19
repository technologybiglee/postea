import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInteractionInput, parseMetricsRange, buildMetrics, buildDailySeries } from './eventMetrics';

test('parseInteractionInput accepts each type with and without visitorId', () => {
  assert.deepEqual(parseInteractionInput({ type: 'impression' }), { data: { type: 'impression', visitorId: null } });
  assert.deepEqual(parseInteractionInput({ type: 'cta_click', visitorId: 'a1b2-c3_d4' }), {
    data: { type: 'cta_click', visitorId: 'a1b2-c3_d4' },
  });
  assert.deepEqual(parseInteractionInput({ type: 'dismiss', visitorId: '' }), { data: { type: 'dismiss', visitorId: null } });
});

test('parseInteractionInput rejects missing/unknown type and bad visitorId', () => {
  assert.ok('error' in parseInteractionInput({}));
  assert.ok('error' in parseInteractionInput(undefined));
  assert.ok('error' in parseInteractionInput({ type: 'click' }));
  assert.ok('error' in parseInteractionInput({ type: 'dismiss', visitorId: 123 }));
  assert.ok('error' in parseInteractionInput({ type: 'dismiss', visitorId: 'has space' }));
  assert.ok('error' in parseInteractionInput({ type: 'dismiss', visitorId: 'x'.repeat(65) }));
});

test('parseMetricsRange defaults to the last 30 days', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const result = parseMetricsRange({}, now);
  assert.ok(!('error' in result));
  assert.equal(result.to.toISOString(), now.toISOString());
  assert.equal(result.from.toISOString(), '2026-10-20T12:00:00.000Z');
});

test('parseMetricsRange validates dates, order and length', () => {
  assert.ok('error' in parseMetricsRange({ from: 'nope' }));
  assert.ok('error' in parseMetricsRange({ from: '2026-11-10', to: '2026-11-01' }));
  assert.ok('error' in parseMetricsRange({ from: '2024-01-01', to: '2026-01-01' }));
  const ok = parseMetricsRange({ from: '2026-11-01', to: '2026-11-10' });
  assert.ok(!('error' in ok));
});

test('buildMetrics computes totals, uniques and rates', () => {
  const metrics = buildMetrics([
    { type: 'impression', total: 200, unique: 120 },
    { type: 'cta_click', total: 15, unique: 12 },
    { type: 'dismiss', total: 30, unique: 28 },
  ]);
  assert.deepEqual(metrics, {
    impressions: 200,
    ctaClicks: 15,
    dismissals: 30,
    uniqueImpressions: 120,
    uniqueCtaClicks: 12,
    uniqueDismissals: 28,
    ctr: 0.075,
    dismissRate: 0.15,
  });
});

test('buildMetrics returns zero rates without impressions', () => {
  const metrics = buildMetrics([{ type: 'cta_click', total: 3, unique: 1 }]);
  assert.equal(metrics.impressions, 0);
  assert.equal(metrics.ctaClicks, 3);
  assert.equal(metrics.ctr, 0);
  assert.equal(metrics.dismissRate, 0);
});

test('buildDailySeries fills every day in the range', () => {
  const series = buildDailySeries(
    [
      { day: new Date('2026-11-02T00:00:00Z'), type: 'impression', total: 10 },
      { day: new Date('2026-11-02T00:00:00Z'), type: 'cta_click', total: 2 },
      { day: new Date('2026-11-03T00:00:00Z'), type: 'dismiss', total: 1 },
    ],
    new Date('2026-11-01T10:00:00Z'),
    new Date('2026-11-04T00:00:00Z'),
  );
  assert.deepEqual(series, [
    { date: '2026-11-01', impressions: 0, ctaClicks: 0, dismissals: 0 },
    { date: '2026-11-02', impressions: 10, ctaClicks: 2, dismissals: 0 },
    { date: '2026-11-03', impressions: 0, ctaClicks: 0, dismissals: 1 },
  ]);
});
