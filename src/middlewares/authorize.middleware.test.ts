import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireSuperAdmin, requireCompanyUser } from './authorize.middleware';

const makeRes = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res;
};

test('requireSuperAdmin rejects a request with no user', () => {
  const req: any = {};
  const res = makeRes();

  requireSuperAdmin(req, res, () => {
    throw new Error('next should not be called');
  });

  assert.equal(res.statusCode, 403);
});

test('requireSuperAdmin rejects a regular company user', () => {
  const req: any = { user: { userId: 1, email: 'a@b.com', companyId: 1, role: 'user' } };
  const res = makeRes();

  requireSuperAdmin(req, res, () => {
    throw new Error('next should not be called');
  });

  assert.equal(res.statusCode, 403);
});

test('requireSuperAdmin calls next for a super admin', () => {
  const req: any = { user: { userId: 1, email: 'a@b.com', companyId: null, role: 'super_admin' } };
  const res = makeRes();
  let nextCalled = false;

  requireSuperAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('requireCompanyUser rejects a user with no companyId (e.g. a super admin)', () => {
  const req: any = { user: { userId: 1, email: 'a@b.com', companyId: null, role: 'super_admin' } };
  const res = makeRes();

  requireCompanyUser(req, res, () => {
    throw new Error('next should not be called');
  });

  assert.equal(res.statusCode, 403);
});

test('requireCompanyUser calls next for a user with a companyId', () => {
  const req: any = { user: { userId: 1, email: 'a@b.com', companyId: 7, role: 'user' } };
  const res = makeRes();
  let nextCalled = false;

  requireCompanyUser(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
