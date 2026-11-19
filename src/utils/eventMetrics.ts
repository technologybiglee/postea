import type { EventInteractionType } from '@prisma/client';

export const INTERACTION_TYPES: EventInteractionType[] = ['impression', 'cta_click', 'dismiss'];

const VISITOR_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface InteractionInput {
  type: EventInteractionType;
  visitorId: string | null;
}

/** Validates the body of a public tracking request. */
export const parseInteractionInput = (body: unknown): { data: InteractionInput } | { error: string } => {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.type === undefined) return { error: 'type is required.' };
  if (!INTERACTION_TYPES.includes(raw.type as EventInteractionType)) {
    return { error: `type must be one of: ${INTERACTION_TYPES.join(', ')}.` };
  }

  let visitorId: string | null = null;
  if (raw.visitorId !== undefined && raw.visitorId !== null && raw.visitorId !== '') {
    if (typeof raw.visitorId !== 'string' || !VISITOR_ID_RE.test(raw.visitorId)) {
      return { error: 'visitorId must be 1-64 characters: letters, digits, "-" or "_".' };
    }
    visitorId = raw.visitorId;
  }

  return { data: { type: raw.type as EventInteractionType, visitorId } };
};

const parseQueryDate = (value: unknown): Date | null | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Reads `from` / `to` (ISO 8601) from the query: [from, to). Defaults to the
 * last 30 days up to now; the range may span at most 366 days.
 */
export const parseMetricsRange = (
  query: Record<string, unknown>,
  now: Date = new Date(),
): { from: Date; to: Date } | { error: string } => {
  const sentFrom = parseQueryDate(query.from);
  const sentTo = parseQueryDate(query.to);
  if (sentFrom === null) return { error: 'from must be a valid ISO 8601 date.' };
  if (sentTo === null) return { error: 'to must be a valid ISO 8601 date.' };

  const to = sentTo ?? now;
  const from = sentFrom ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  if (from >= to) return { error: 'from must be before to.' };
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    return { error: `The range cannot exceed ${MAX_RANGE_DAYS} days.` };
  }
  return { from, to };
};

/** One aggregated row per interaction type: total rows and distinct visitorIds. */
export interface InteractionCount {
  type: EventInteractionType;
  total: number;
  unique: number;
}

export interface EventMetrics {
  impressions: number;
  ctaClicks: number;
  dismissals: number;
  uniqueImpressions: number;
  uniqueCtaClicks: number;
  uniqueDismissals: number;
  /** ctaClicks / impressions (0 when there are no impressions). */
  ctr: number;
  /** dismissals / impressions (0 when there are no impressions). */
  dismissRate: number;
}

const rate = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0);

export const buildMetrics = (counts: InteractionCount[]): EventMetrics => {
  const get = (type: EventInteractionType) => counts.find((c) => c.type === type) ?? { total: 0, unique: 0 };
  const impression = get('impression');
  const click = get('cta_click');
  const dismiss = get('dismiss');

  return {
    impressions: impression.total,
    ctaClicks: click.total,
    dismissals: dismiss.total,
    uniqueImpressions: impression.unique,
    uniqueCtaClicks: click.unique,
    uniqueDismissals: dismiss.unique,
    ctr: rate(click.total, impression.total),
    dismissRate: rate(dismiss.total, impression.total),
  };
};

export interface DailyRow {
  day: Date;
  type: EventInteractionType;
  total: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  impressions: number;
  ctaClicks: number;
  dismissals: number;
}

const FIELD_BY_TYPE: Record<EventInteractionType, 'impressions' | 'ctaClicks' | 'dismissals'> = {
  impression: 'impressions',
  cta_click: 'ctaClicks',
  dismiss: 'dismissals',
};

const toDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Builds a UTC day-by-day series covering [from, to), filling missing days with zeros. */
export const buildDailySeries = (rows: DailyRow[], from: Date, to: Date): DailyPoint[] => {
  const points = new Map<string, DailyPoint>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor < to) {
    const date = toDay(cursor);
    points.set(date, { date, impressions: 0, ctaClicks: 0, dismissals: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const row of rows) {
    const point = points.get(toDay(row.day));
    if (point) point[FIELD_BY_TYPE[row.type]] += row.total;
  }
  return [...points.values()];
};
