import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduledAt, resolveScheduling } from './scheduling';

const NOW = new Date('2026-10-02T12:00:00Z');
const FUTURE = new Date('2026-10-03T12:00:00Z');
const PAST = new Date('2026-10-01T12:00:00Z');

test('parseScheduledAt parses ISO strings and treats null/empty as clearing', () => {
  assert.equal(parseScheduledAt(undefined), undefined);
  assert.equal(parseScheduledAt(null), null);
  assert.equal(parseScheduledAt(''), null);
  assert.deepEqual(parseScheduledAt('2026-10-03T12:00:00Z'), FUTURE);
});

test('parseScheduledAt rejects malformed dates', () => {
  assert.throws(() => parseScheduledAt('mañana'), /valid ISO 8601/);
  assert.throws(() => parseScheduledAt({}), /valid ISO 8601/);
});

test('scheduled requires a future scheduledAt', () => {
  assert.deepEqual(resolveScheduling('scheduled', undefined, undefined, NOW), {
    error: 'scheduledAt is required when status is scheduled.',
  });
  assert.deepEqual(resolveScheduling('scheduled', PAST, undefined, NOW), {
    error: 'scheduledAt must be in the future.',
  });
  assert.deepEqual(resolveScheduling('scheduled', FUTURE, undefined, NOW), {
    data: { status: 'scheduled', scheduledAt: FUTURE },
  });
});

test('editing an already scheduled post keeps its stored date without re-validating it', () => {
  const existing = { status: 'scheduled' as const, scheduledAt: PAST, publishedAt: null };
  assert.deepEqual(resolveScheduling('scheduled', undefined, existing, NOW), {
    data: { status: 'scheduled', scheduledAt: PAST },
  });
});

test('scheduledAt is rejected on non-scheduled statuses', () => {
  assert.deepEqual(resolveScheduling('draft', FUTURE, undefined, NOW), {
    error: 'scheduledAt can only be set when status is scheduled.',
  });
});

test('publishing stamps publishedAt once and clears scheduledAt', () => {
  assert.deepEqual(resolveScheduling('published', undefined, undefined, NOW), {
    data: { status: 'published', scheduledAt: null, publishedAt: NOW },
  });

  const existing = { status: 'draft' as const, scheduledAt: null, publishedAt: PAST };
  assert.deepEqual(resolveScheduling('published', undefined, existing, NOW), {
    data: { status: 'published', scheduledAt: null, publishedAt: PAST },
  });
});

test('moving a scheduled post back to draft cancels the schedule', () => {
  const existing = { status: 'scheduled' as const, scheduledAt: FUTURE, publishedAt: null };
  assert.deepEqual(resolveScheduling('draft', undefined, existing, NOW), {
    data: { status: 'draft', scheduledAt: null },
  });
});
