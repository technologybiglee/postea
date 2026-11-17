import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createAuthenticate, UserLoader } from './auth.middleware';
import { JwtPayload } from '../types';

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

// In-memory stand-in for the database lookup.
const users = new Map<number, JwtPayload>([
  [1, { userId: 1, email: 'a@b.com', companyId: 7, role: 'user' }],
]);
const loadUser: UserLoader = async (id) => users.get(id) ?? null;
const authenticate = createAuthenticate(loadUser);

const failNext = () => {
  throw new Error('next should not be called');
};

// JWT_SECRET is read at call time inside the middleware, so tests can swap it
// per-case without affecting each other.
const withSecret = async (secret: string | undefined, fn: () => Promise<void>): Promise<void> => {
  const original = process.env.JWT_SECRET;
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;

  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  }
};

const bearer = (payload: object, options: jwt.SignOptions = { expiresIn: '1h' }) => ({
  headers: { authorization: `Bearer ${jwt.sign(payload, 'test-secret', options)}` },
});

test('rejects a request with no Authorization header', async () => {
  const res = makeRes();
  await authenticate({ headers: {} } as any, res, failNext);
  assert.equal(res.statusCode, 401);
});

test('rejects a header that is not a Bearer token', async () => {
  const res = makeRes();
  await authenticate({ headers: { authorization: 'Basic abc123' } } as any, res, failNext);
  assert.equal(res.statusCode, 401);
});

test('responds 500 when JWT_SECRET is not configured', async () => {
  await withSecret(undefined, async () => {
    const res = makeRes();
    await authenticate({ headers: { authorization: 'Bearer sometoken' } } as any, res, failNext);
    assert.equal(res.statusCode, 500);
  });
});

test('rejects an invalid token', async () => {
  await withSecret('test-secret', async () => {
    const res = makeRes();
    await authenticate({ headers: { authorization: 'Bearer not-a-real-token' } } as any, res, failNext);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /invalid token/i);
  });
});

test('rejects an expired token', async () => {
  await withSecret('test-secret', async () => {
    const res = makeRes();
    await authenticate(bearer({ userId: 1 }, { expiresIn: -10 }) as any, res, failNext);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /expired/i);
  });
});

test('rejects a valid token whose user was deleted', async () => {
  await withSecret('test-secret', async () => {
    const res = makeRes();
    await authenticate(bearer({ userId: 999, email: 'gone@b.com', companyId: 7, role: 'user' }) as any, res, failNext);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /no longer exists/i);
  });
});

test('accepts a valid token and attaches the current user to req.user', async () => {
  await withSecret('test-secret', async () => {
    const req: any = bearer({ userId: 1, email: 'a@b.com', companyId: 7, role: 'user' });
    let nextCalled = false;
    await authenticate(req, makeRes(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.user.companyId, 7);
    assert.equal(req.user.email, 'a@b.com');
  });
});

test('uses the stored role and company, not the stale values in the token', async () => {
  await withSecret('test-secret', async () => {
    // Token issued when the user was a super_admin in another company.
    const req: any = bearer({ userId: 1, email: 'old@b.com', companyId: null, role: 'super_admin' });
    await authenticate(req, makeRes(), () => {});
    assert.equal(req.user.role, 'user');
    assert.equal(req.user.companyId, 7);
    assert.equal(req.user.email, 'a@b.com');
  });
});

test('passes database errors to next', async () => {
  await withSecret('test-secret', async () => {
    const failing = createAuthenticate(async () => {
      throw new Error('db down');
    });
    let received: unknown;
    await failing(bearer({ userId: 1 }) as any, makeRes(), (err?: unknown) => {
      received = err;
    });
    assert.match((received as Error).message, /db down/);
  });
});
