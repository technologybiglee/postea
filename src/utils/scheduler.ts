import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

/**
 * Publishes every `scheduled` post whose `scheduledAt` has passed, keeping the
 * scheduled date as `publishedAt`. Pass `companyId` to limit it to one tenant.
 *
 * Raw SQL because `updateMany` can't copy one column into another. A single
 * conditional UPDATE is atomic, so concurrent calls never double-publish.
 * Returns the number of posts published.
 *
 * `now` is passed from JS rather than using SQL NOW(): the columns are
 * timezone-less timestamps that Prisma writes in UTC, so comparing against
 * NOW() would depend on the session's TimeZone setting.
 */
export const publishDuePosts = (companyId?: number): Promise<number> => {
  const now = new Date();
  return prisma.$executeRaw`
    UPDATE "posts"
    SET "status" = 'published', "published_at" = "scheduled_at", "updated_at" = ${now}
    WHERE "status" = 'scheduled'
      AND "scheduled_at" <= ${now}
      ${companyId !== undefined ? Prisma.sql`AND "company_id" = ${companyId}` : Prisma.empty}
  `;
};

let timer: NodeJS.Timeout | undefined;

const tick = async () => {
  try {
    const count = await publishDuePosts();
    if (count > 0) console.log(`⏰  Published ${count} scheduled post(s).`);
  } catch (error) {
    console.error('Scheduler failed to publish due posts:', error);
  }
};

/**
 * Runs `publishDuePosts` now (to catch up on anything that came due while the
 * service was asleep) and then every `intervalMs`. Public reads also call
 * `publishDuePosts` before querying, so posts show up on time even if this
 * timer hasn't fired yet.
 */
export const startScheduler = (intervalMs = 60_000): void => {
  if (timer) return;
  void tick();
  timer = setInterval(tick, intervalMs);
  timer.unref();
};

export const stopScheduler = (): void => {
  if (timer) clearInterval(timer);
  timer = undefined;
};
