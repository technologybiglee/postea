import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination, buildMeta, parseList, parseIdList } from './pagination';

test('parsePagination uses defaults when params are missing', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10, skip: 0 });
});

test('parsePagination computes skip from page and limit', () => {
  assert.deepEqual(parsePagination({ page: '3', limit: '5' }), { page: 3, limit: 5, skip: 10 });
});

test('parsePagination clamps limit and falls back on invalid values', () => {
  assert.equal(parsePagination({ limit: '500' }).limit, 50);
  assert.equal(parsePagination({ limit: '500' }, { maxLimit: 100 }).limit, 100);
  assert.equal(parsePagination({ limit: '-3' }).limit, 1);
  assert.equal(parsePagination({ page: 'abc' }).page, 1);
  assert.equal(parsePagination({ page: '0' }).page, 1);
  assert.equal(parsePagination({ page: '-2' }).page, 1);
});

test('buildMeta computes totalPages', () => {
  assert.deepEqual(buildMeta(21, 2, 10), { total: 21, page: 2, limit: 10, totalPages: 3 });
  assert.equal(buildMeta(0, 1, 10).totalPages, 0);
});

test('parseList accepts comma-separated strings and repeated params', () => {
  assert.deepEqual(parseList('draft, scheduled'), ['draft', 'scheduled']);
  assert.deepEqual(parseList(['a', 'b,c']), ['a', 'b', 'c']);
  assert.equal(parseList(undefined), undefined);
  assert.equal(parseList(''), undefined);
  assert.equal(parseList(' , '), undefined);
});

test('parseIdList parses positive integers', () => {
  assert.deepEqual(parseIdList('1,2', 'tagId'), [1, 2]);
  assert.deepEqual(parseIdList(['3', '4'], 'tagId'), [3, 4]);
  assert.equal(parseIdList(undefined, 'tagId'), undefined);
});

test('parseIdList throws a named error on invalid ids', () => {
  assert.throws(() => parseIdList('abc', 'tagId'), /tagId must be/);
  assert.throws(() => parseIdList('1,0', 'categoryId'), /categoryId must be/);
  assert.throws(() => parseIdList('1.5', 'tagId'), /tagId must be/);
});
