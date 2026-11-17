import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventInput, getEventState, eventStateWhere, EventData } from './events';

const bar = { title: 'Black Friday', type: 'bar', content: '50% off', startsAt: '2026-11-20T00:00:00Z' };

const ok = (result: ReturnType<typeof parseEventInput>): EventData => {
  if ('error' in result) throw new Error(`expected data, got error: ${result.error}`);
  return result.data;
};
const err = (result: ReturnType<typeof parseEventInput>): string => {
  assert.ok('error' in result, 'expected an error');
  return result.error;
};

test('parses a minimal bar and applies defaults', () => {
  const data = ok(parseEventInput(bar));
  assert.equal(data.position, 'top');
  assert.equal(data.isActive, true);
  assert.equal(data.dismissible, true);
  assert.equal(data.ctaNewTab, false);
  assert.equal(data.priority, 0);
  assert.equal(data.endsAt, null);
  assert.equal(data.startsAt.toISOString(), '2026-11-20T00:00:00.000Z');
});

test('requires type, title and startsAt', () => {
  assert.match(err(parseEventInput({ ...bar, type: undefined })), /type is required/);
  assert.match(err(parseEventInput({ ...bar, type: 'popup' })), /type must be one of/);
  assert.match(err(parseEventInput({ ...bar, title: '  ' })), /title is required/);
  assert.match(err(parseEventInput({ ...bar, startsAt: undefined })), /startsAt is required/);
  assert.match(err(parseEventInput({ ...bar, startsAt: 'tomorrow' })), /valid ISO 8601/);
});

test('enforces per-type content and image rules', () => {
  assert.match(err(parseEventInput({ ...bar, content: '' })), /content is required for type "bar"/);
  assert.match(err(parseEventInput({ ...bar, type: 'circular', content: 'x'.repeat(201) })), /at most 200/);
  assert.match(err(parseEventInput({ title: 'Promo', type: 'banner', startsAt: bar.startsAt })), /image is required/);
  ok(parseEventInput({ title: 'Promo', type: 'banner', startsAt: bar.startsAt }, { imageUploaded: true }));
  ok(parseEventInput({ title: 'Promo', type: 'banner', startsAt: bar.startsAt, image: 'https://cdn/x.png' }));
});

test('validates and defaults position per type', () => {
  assert.equal(ok(parseEventInput({ ...bar, type: 'circular' })).position, 'top');
  assert.match(err(parseEventInput({ ...bar, type: 'circular', position: 'bottom_right' })), /must be one of: top, bottom/);
  assert.equal(ok(parseEventInput({ ...bar, position: 'bottom' })).position, 'bottom');
  assert.match(err(parseEventInput({ ...bar, position: 'top_left' })), /must be one of: top, bottom/);
  assert.match(
    err(parseEventInput({ title: 'P', type: 'banner', image: 'https://cdn/x.png', startsAt: bar.startsAt, position: 'top' })),
    /does not apply/,
  );
});

test('requires endsAt to be after startsAt', () => {
  assert.match(err(parseEventInput({ ...bar, endsAt: bar.startsAt })), /endsAt must be after startsAt/);
  ok(parseEventInput({ ...bar, endsAt: '2026-11-30T00:00:00Z' }));
});

test('validates CTA and colors', () => {
  assert.match(err(parseEventInput({ ...bar, ctaText: 'Buy' })), /ctaUrl is required/);
  assert.match(err(parseEventInput({ ...bar, ctaUrl: 'javascript:alert(1)' })), /ctaUrl must be/);
  assert.match(err(parseEventInput({ ...bar, ctaUrl: '//evil.com' })), /ctaUrl must be/);
  ok(parseEventInput({ ...bar, ctaText: 'Buy', ctaUrl: '/promo' }));
  ok(parseEventInput({ ...bar, ctaUrl: 'https://shop.example.com/sale' }));
  assert.match(err(parseEventInput({ ...bar, backgroundColor: 'red' })), /backgroundColor must be a hex/);
  ok(parseEventInput({ ...bar, backgroundColor: '#f00', textColor: '#FFFFFF' }));
});

test('parses booleans and integers sent as multipart strings', () => {
  const data = ok(parseEventInput({ ...bar, isActive: 'false', dismissible: '0', ctaNewTab: 'true', priority: '5' }));
  assert.equal(data.isActive, false);
  assert.equal(data.dismissible, false);
  assert.equal(data.ctaNewTab, true);
  assert.equal(data.priority, 5);
  assert.match(err(parseEventInput({ ...bar, isActive: 'yes' })), /isActive must be a boolean/);
  assert.match(err(parseEventInput({ ...bar, priority: '1.5' })), /priority must be an integer/);
});

test('on update, merges with the stored event and validates the result', () => {
  const existing = ok(parseEventInput({ ...bar, position: 'bottom', ctaText: 'Go', ctaUrl: '/go' }));

  // Only the title changes; everything else is kept.
  const renamed = ok(parseEventInput({ title: 'Cyber Monday' }, { existing }));
  assert.equal(renamed.title, 'Cyber Monday');
  assert.equal(renamed.position, 'bottom');
  assert.equal(renamed.content, '50% off');

  // Switching to banner needs an image, and the bar position no longer applies.
  assert.match(err(parseEventInput({ type: 'banner' }, { existing })), /image is required/);
  assert.equal(ok(parseEventInput({ type: 'banner', image: 'https://cdn/x.png' }, { existing })).position, null);

  // Switching to circular (a marquee bar) keeps the bar position.
  assert.equal(ok(parseEventInput({ type: 'circular' }, { existing })).position, 'bottom');

  // Clearing the URL while ctaText remains is rejected; null clears endsAt.
  assert.match(err(parseEventInput({ ctaUrl: '' }, { existing })), /ctaUrl is required/);
  const withEnd = ok(parseEventInput({ endsAt: '2026-12-01T00:00:00Z' }, { existing }));
  assert.equal(ok(parseEventInput({ endsAt: null }, { existing: withEnd })).endsAt, null);
});

test('getEventState covers the four states', () => {
  const now = new Date('2026-11-25T00:00:00Z');
  const base = { isActive: true, startsAt: new Date('2026-11-20T00:00:00Z'), endsAt: null };
  assert.equal(getEventState({ ...base, isActive: false }, now), 'paused');
  assert.equal(getEventState({ ...base, startsAt: new Date('2026-11-30T00:00:00Z') }, now), 'upcoming');
  assert.equal(getEventState({ ...base, endsAt: new Date('2026-11-24T00:00:00Z') }, now), 'expired');
  assert.equal(getEventState(base, now), 'active');
  assert.equal(getEventState({ ...base, endsAt: new Date('2026-11-30T00:00:00Z') }, now), 'active');
});

test('eventStateWhere builds the matching filters', () => {
  const now = new Date('2026-11-25T00:00:00Z');
  assert.deepEqual(eventStateWhere('paused', now), { isActive: false });
  assert.deepEqual(eventStateWhere('active', now), {
    isActive: true,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  });
});
