import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUserInput, hashPassword } from './users';
import bcrypt from 'bcryptjs';

const valid = { email: 'Ana@Example.com ', password: 'secret123', name: '  Ana ' };

test('validateUserInput normalizes a complete, valid body', () => {
  assert.deepEqual(validateUserInput(valid), {
    data: { email: 'ana@example.com', password: 'secret123', name: 'Ana' },
  });
});

test('validateUserInput requires every field on create', () => {
  const result = validateUserInput({ email: 'a@b.co', name: 'A' });
  assert.ok('error' in result);
  assert.match(result.error, /required/);
  assert.ok('error' in validateUserInput(undefined));
});

test('validateUserInput rejects invalid email, short password and empty name', () => {
  assert.ok('error' in validateUserInput({ ...valid, email: 'not-an-email' }));
  assert.ok('error' in validateUserInput({ ...valid, email: 42 }));
  assert.ok('error' in validateUserInput({ ...valid, password: 'short' }));
  assert.ok('error' in validateUserInput({ ...valid, name: '   ' }));
});

test('validateUserInput in partial mode only validates fields that are sent', () => {
  assert.deepEqual(validateUserInput({}, { partial: true }), { data: {} });
  assert.deepEqual(validateUserInput({ name: 'Bob' }, { partial: true }), { data: { name: 'Bob' } });
  assert.ok('error' in validateUserInput({ password: '123' }, { partial: true }));
});

test('validateUserInput ignores unknown fields such as role or companyId', () => {
  const result = validateUserInput({ ...valid, role: 'super_admin', companyId: 99 });
  assert.ok('data' in result);
  assert.deepEqual(Object.keys(result.data).sort(), ['email', 'name', 'password']);
});

test('hashPassword produces a bcrypt hash that verifies', async () => {
  const hash = await hashPassword('secret123');
  assert.notEqual(hash, 'secret123');
  assert.ok(await bcrypt.compare('secret123', hash));
});
