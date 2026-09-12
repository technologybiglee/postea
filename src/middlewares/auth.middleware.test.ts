import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate } from './auth.middleware';

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

// JWT_SECRET is read at call time inside the middleware, so tests can swap it
// per-case without affecting each other.
const withSecret = (secret: string | undefined, fn: () => void): void => {
  const original = process.env.JWT_SECRET;
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;

  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  }
};

test('rejects a request with no Authorization header', () => {
  const req: any = { headers: {} };
  const res = makeRes();

  authenticate(req, res, () => {
    throw new Error('next should not be called');
  });

  assert.equal(res.statusCode, 401);
});

test('rejects a header that is not a Bearer token', () => {
  const req: any = { headers: { authorization: 'Basic abc123' } };
  const res = makeRes();

  authenticate(req, res, () => {
    throw new Error('next should not be called');
  });

  assert.equal(res.statusCode, 401);
});

test('responds 500 when JWT_SECRET is not configured', () => {
  withSecret(undefined, () => {
    const req: any = { headers: { authorization: 'Bearer sometoken' } };
    const res = makeRes();

    authenticate(req, res, () => {
      throw new Error('next should not be called');
    });

    assert.equal(res.statusCode, 500);
  });
});

test('rejects an invalid token', () => {
  withSecret('test-secret', () => {
    const req: any = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = makeRes();

    authenticate(req, res, () => {
      throw new Error('next should not be called');
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /invalid token/i);
  });
});

test('rejects an expired token', () => {
  withSecret('test-secret', () => {
    const expired = jwt.sign({ userId: 1, email: 'a@b.com', companyId: 1 }, 'test-secret', { expiresIn: -10 });
    const req: any = { headers: { authorization: `Bearer ${expired}` } };
    const res = makeRes();

    authenticate(req, res, () => {
      throw new Error('next should not be called');
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /expired/i);
  });
});

test('accepts a valid token and attaches its payload to req.user', () => {
  withSecret('test-secret', () => {
    const payload = { userId: 1, email: 'a@b.com', companyId: 7 };
    const token = jwt.sign(payload, 'test-secret', { expiresIn: '1h' });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    let nextCalled = false;

    authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.companyId, 7);
    assert.equal(req.user.email, 'a@b.com');
  });
});
