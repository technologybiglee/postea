import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from './rateLimit.middleware';

// Minimal fake Response: just enough of the Express API for this middleware.
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

test('allows requests up to the configured max, then blocks with 429', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 2 });
  const req: any = { ip: '1.1.1.1' };
  let nextCalls = 0;
  const next = () => {
    nextCalls += 1;
  };

  limiter(req, makeRes(), next);
  limiter(req, makeRes(), next);
  assert.equal(nextCalls, 2);

  const blockedRes = makeRes();
  limiter(req, blockedRes, next);

  assert.equal(nextCalls, 2);
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(blockedRes.body.success, false);
});

test('tracks the limit independently per IP', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 1 });
  let nextCalls = 0;
  const next = () => {
    nextCalls += 1;
  };

  limiter({ ip: '2.2.2.2' } as any, makeRes(), next);
  limiter({ ip: '3.3.3.3' } as any, makeRes(), next);

  assert.equal(nextCalls, 2);
});

test('resets the counter once the window elapses', async () => {
  const limiter = rateLimit({ windowMs: 20, max: 1 });
  const req: any = { ip: '4.4.4.4' };
  let nextCalls = 0;
  const next = () => {
    nextCalls += 1;
  };

  limiter(req, makeRes(), next);
  const blockedRes = makeRes();
  limiter(req, blockedRes, next);
  assert.equal(blockedRes.statusCode, 429);

  await new Promise((resolve) => setTimeout(resolve, 30));

  limiter(req, makeRes(), next);
  assert.equal(nextCalls, 2);
});
