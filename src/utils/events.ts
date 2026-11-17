import type { EventPosition, EventType, Prisma } from '@prisma/client';

export const EVENT_TYPES: EventType[] = ['banner', 'bar', 'circular'];
export const EVENT_STATES = ['paused', 'upcoming', 'active', 'expired'] as const;
export type EventState = (typeof EVENT_STATES)[number];

const TITLE_MAX = 120;
const CTA_TEXT_MAX = 60;

/** Per-type rules: what content is required and where it can be placed. */
const TYPE_RULES: Record<EventType, {
  requiresImage: boolean;
  requiresContent: boolean;
  contentMax: number;
  positions: EventPosition[];
  defaultPosition: EventPosition | null;
}> = {
  banner:   { requiresImage: true,  requiresContent: false, contentMax: 1000, positions: [], defaultPosition: null },
  bar:      { requiresImage: false, requiresContent: true,  contentMax: 200,  positions: ['top', 'bottom'], defaultPosition: 'top' },
  circular: {
    requiresImage: false,
    requiresContent: true,
    // The text has to fit around the circle.
    contentMax: 80,
    positions: ['top_left', 'top_right', 'bottom_left', 'bottom_right'],
    defaultPosition: 'bottom_right',
  },
};

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// Absolute http(s) URL, or a site-relative path ("/promo"); "//host" is rejected.
const CTA_URL_RE = /^(?:https?:\/\/\S+|\/(?!\/)\S*)$/i;

/** Every persisted field of an event except ids, company and timestamps. */
export interface EventData {
  title: string;
  content: string | null;
  image: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  ctaNewTab: boolean;
  type: EventType;
  position: EventPosition | null;
  backgroundColor: string | null;
  textColor: string | null;
  dismissible: boolean;
  isActive: boolean;
  priority: number;
  startsAt: Date;
  endsAt: Date | null;
}

class InputError extends Error {}

// ─── Field parsers (multipart sends everything as strings) ──────────────────

/** `undefined` = not sent (keep), `null` = clear, otherwise a trimmed string. */
const optionalString = (value: unknown, name: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InputError(`${name} must be a string.`);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const parseBoolean = (value: unknown, name: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new InputError(`${name} must be a boolean.`);
};

const parseInteger = (value: unknown, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new InputError(`${name} must be an integer.`);
  return n;
};

const parseDate = (value: unknown, name: string): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new InputError(`${name} must be a valid ISO 8601 date.`);
  return date;
};

const pick = <T>(sent: T | undefined, stored: T | undefined, fallback: T): T =>
  sent !== undefined ? sent : stored !== undefined ? stored : fallback;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses an event from a request body and validates the result.
 *
 * On updates pass the stored event as `existing`: fields not sent keep their
 * stored value, and the rules are checked on the merged result (e.g. switching
 * `type` to `banner` requires an image to exist). Set `imageUploaded` when a
 * file came with the request; the caller replaces `image` with its URL.
 */
export const parseEventInput = (
  body: unknown,
  { existing, imageUploaded = false }: { existing?: EventData; imageUploaded?: boolean } = {},
): { data: EventData } | { error: string } => {
  const raw = (body ?? {}) as Record<string, unknown>;

  try {
    if (raw.type !== undefined && !EVENT_TYPES.includes(raw.type as EventType)) {
      throw new InputError(`type must be one of: ${EVENT_TYPES.join(', ')}.`);
    }
    const type = pick(raw.type as EventType | undefined, existing?.type, undefined as unknown as EventType);
    if (!type) throw new InputError('type is required.');
    const rules = TYPE_RULES[type];

    const title = pick(optionalString(raw.title, 'title'), existing?.title, null);
    if (!title) throw new InputError('title is required.');
    if (title.length > TITLE_MAX) throw new InputError(`title must be at most ${TITLE_MAX} characters.`);

    const content = pick(optionalString(raw.content, 'content'), existing?.content, null);
    if (rules.requiresContent && !content) throw new InputError(`content is required for type "${type}".`);
    if (content && content.length > rules.contentMax) {
      throw new InputError(`content must be at most ${rules.contentMax} characters for type "${type}".`);
    }

    const image = pick(optionalString(raw.image, 'image'), existing?.image, null);
    if (rules.requiresImage && !image && !imageUploaded) throw new InputError(`image is required for type "${type}".`);

    const ctaText = pick(optionalString(raw.ctaText, 'ctaText'), existing?.ctaText, null);
    const ctaUrl  = pick(optionalString(raw.ctaUrl, 'ctaUrl'), existing?.ctaUrl, null);
    if (ctaText && ctaText.length > CTA_TEXT_MAX) throw new InputError(`ctaText must be at most ${CTA_TEXT_MAX} characters.`);
    if (ctaText && !ctaUrl) throw new InputError('ctaUrl is required when ctaText is set.');
    if (ctaUrl && !CTA_URL_RE.test(ctaUrl)) {
      throw new InputError('ctaUrl must be an http(s) URL or a path starting with "/".');
    }

    // Position: an explicit value must fit the type; otherwise keep the stored
    // one if it still fits (the type may have changed), else the type default.
    const sentPosition = optionalString(raw.position, 'position') as EventPosition | null | undefined;
    let position: EventPosition | null;
    if (sentPosition) {
      if (!rules.positions.includes(sentPosition)) {
        throw new InputError(
          rules.positions.length === 0
            ? `position does not apply to type "${type}".`
            : `position for type "${type}" must be one of: ${rules.positions.join(', ')}.`,
        );
      }
      position = sentPosition;
    } else if (sentPosition === undefined && existing?.position && rules.positions.includes(existing.position)) {
      position = existing.position;
    } else {
      position = rules.defaultPosition;
    }

    const backgroundColor = pick(optionalString(raw.backgroundColor, 'backgroundColor'), existing?.backgroundColor, null);
    const textColor       = pick(optionalString(raw.textColor, 'textColor'), existing?.textColor, null);
    for (const [name, color] of [['backgroundColor', backgroundColor], ['textColor', textColor]] as const) {
      if (color && !HEX_COLOR_RE.test(color)) throw new InputError(`${name} must be a hex color like #FF0000.`);
    }

    const sentStartsAt = parseDate(raw.startsAt, 'startsAt');
    if (sentStartsAt === null) throw new InputError('startsAt cannot be empty.');
    const startsAt = pick(sentStartsAt, existing?.startsAt, null);
    if (!startsAt) throw new InputError('startsAt is required.');
    const endsAt = pick(parseDate(raw.endsAt, 'endsAt'), existing?.endsAt, null);
    if (endsAt && endsAt <= startsAt) throw new InputError('endsAt must be after startsAt.');

    return {
      data: {
        title,
        content,
        image,
        ctaText,
        ctaUrl,
        ctaNewTab:   pick(parseBoolean(raw.ctaNewTab, 'ctaNewTab'), existing?.ctaNewTab, false),
        type,
        position,
        backgroundColor,
        textColor,
        dismissible: pick(parseBoolean(raw.dismissible, 'dismissible'), existing?.dismissible, true),
        isActive:    pick(parseBoolean(raw.isActive, 'isActive'), existing?.isActive, true),
        priority:    pick(parseInteger(raw.priority, 'priority'), existing?.priority, 0),
        startsAt,
        endsAt,
      },
    };
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }
};

/** Derived, never stored: whether the event is showing right now. */
export const getEventState = (
  event: { isActive: boolean; startsAt: Date; endsAt: Date | null },
  now: Date = new Date(),
): EventState => {
  if (!event.isActive) return 'paused';
  if (event.startsAt > now) return 'upcoming';
  if (event.endsAt && event.endsAt <= now) return 'expired';
  return 'active';
};

/** Prisma filter equivalent to `getEventState(event, now) === state`. */
export const eventStateWhere = (state: EventState, now: Date = new Date()): Prisma.EventWhereInput => {
  switch (state) {
    case 'paused':
      return { isActive: false };
    case 'upcoming':
      return { isActive: true, startsAt: { gt: now } };
    case 'expired':
      return { isActive: true, startsAt: { lte: now }, endsAt: { lte: now } };
    case 'active':
      return { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  }
};
