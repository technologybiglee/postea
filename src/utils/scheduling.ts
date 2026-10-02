import { PostStatus } from '@prisma/client';

/**
 * `scheduledAt` arrives as an ISO string (both over JSON and multipart).
 * `null` or an empty string clear it. Throws a plain Error with a clear
 * message on malformed input, which the controllers turn into a 400.
 */
export const parseScheduledAt = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new Error('scheduledAt must be a valid ISO 8601 date.');
  }
  return date;
};

type SchedulingFields = {
  status: PostStatus;
  scheduledAt: Date | null;
  publishedAt?: Date | null;
};

type ExistingPost = {
  status: PostStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
};

/**
 * Applies the scheduling rules to the status/scheduledAt a client sent and
 * returns the fields to persist, or an error message for a 400.
 *
 * - `scheduled` needs a future `scheduledAt` (sent now, or already stored).
 * - `scheduledAt` can't be set on any other status.
 * - Leaving `scheduled` clears `scheduledAt`; becoming `published` stamps
 *   `publishedAt` unless the post was already published before.
 *
 * `status` is the target status, already resolved by the caller; `existing`
 * is undefined when creating a post.
 */
export const resolveScheduling = (
  status: PostStatus,
  scheduledAt: Date | null | undefined,
  existing?: ExistingPost,
  now: Date = new Date(),
): { error: string } | { data: SchedulingFields } => {
  if (status === 'scheduled') {
    const target = scheduledAt !== undefined ? scheduledAt : (existing?.scheduledAt ?? null);
    if (!target) {
      return { error: 'scheduledAt is required when status is scheduled.' };
    }

    // Only re-check the date when it changes or the post enters `scheduled`,
    // so editing the title of a post that is about to be published still works.
    const changed = scheduledAt !== undefined || existing?.status !== 'scheduled';
    if (changed && target <= now) {
      return { error: 'scheduledAt must be in the future.' };
    }

    return { data: { status, scheduledAt: target } };
  }

  if (scheduledAt) {
    return { error: 'scheduledAt can only be set when status is scheduled.' };
  }

  if (status === 'published') {
    return { data: { status, scheduledAt: null, publishedAt: existing?.publishedAt ?? now } };
  }

  return { data: { status, scheduledAt: null } };
};
