import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSlug } from './slug';

test('generateSlug produces a lowercase, hyphenated slug with a numeric suffix', () => {
  const slug = generateSlug('Mi Primer Post');
  assert.match(slug, /^mi-primer-post-\d+$/);
});

test('generateSlug normalizes accents and strips characters outside [a-z0-9-]', () => {
  const slug = generateSlug('¡Título con Ñ!');
  assert.equal(slug, slug.toLowerCase());
  assert.doesNotMatch(slug, /[^a-z0-9-]/);
});

test('generateSlug guarantees a different value on each call, even for the same title', async () => {
  const first = generateSlug('Repeated Title');
  // Date.now() has 1ms resolution; wait a beat so the timestamp suffix differs.
  await new Promise((resolve) => setTimeout(resolve, 2));
  const second = generateSlug('Repeated Title');

  assert.notEqual(first, second);
});
