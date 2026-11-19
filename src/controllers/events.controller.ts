import { Response, NextFunction } from 'express';
import { EventInteractionType, EventType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { parsePagination, parseList, buildMeta } from '../utils/pagination';
import { uploadCoverToStorage, deleteCoverFromStorage } from '../utils/storage';
import {
  EVENT_TYPES,
  EVENT_STATES,
  EventState,
  parseEventInput,
  getEventState,
  eventStateWhere,
} from '../utils/events';
import {
  InteractionCount,
  parseMetricsRange,
  buildMetrics,
  buildDailySeries,
} from '../utils/eventMetrics';

type StoredEvent = Prisma.EventGetPayload<object>;

/** Adds the derived `state` (paused | upcoming | active | expired). */
const withState = (event: StoredEvent, now: Date = new Date()) => ({ ...event, state: getEventState(event, now) });

/**
 * Reads the `type` query filter. Returns undefined when absent, or an error
 * message when it contains an unknown type.
 */
export const parseTypeFilter = (value: unknown): { types?: EventType[] } | { error: string } => {
  const types = parseList(value);
  if (types && types.some((t) => !EVENT_TYPES.includes(t as EventType))) {
    return { error: `type must be one of: ${EVENT_TYPES.join(', ')}.` };
  }
  return { types: types as EventType[] | undefined };
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/events
 *
 * Optional query params: page, limit, type (banner,bar,circular),
 * state (paused,upcoming,active,expired). Lists accept comma-separated values.
 */
export const getAllEvents = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const { page, limit, skip } = parsePagination(req.query);

    const typeFilter = parseTypeFilter(req.query.type);
    if ('error' in typeFilter) {
      res.status(400).json({ success: false, error: typeFilter.error });
      return;
    }

    const states = parseList(req.query.state);
    if (states && states.some((s) => !EVENT_STATES.includes(s as EventState))) {
      res.status(400).json({ success: false, error: `state must be one of: ${EVENT_STATES.join(', ')}.` });
      return;
    }

    const now = new Date();
    const where: Prisma.EventWhereInput = {
      companyId,
      ...(typeFilter.types && { type: { in: typeFilter.types } }),
      ...(states && { AND: [{ OR: states.map((s) => eventStateWhere(s as EventState, now)) }] }),
    };

    const [events, total] = await Promise.all([
      prisma.event.findMany({ where, orderBy: [{ startsAt: 'desc' }, { id: 'desc' }], skip, take: limit }),
      prisma.event.count({ where }),
    ]);

    res.json({ success: true, data: events.map((e) => withState(e, now)), meta: buildMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const event = await prisma.event.findFirst({ where: { id, companyId } });
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found.' });
      return;
    }

    res.json({ success: true, data: withState(event) });
  } catch (error) {
    next(error);
  }
};

export const createEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    // Validate before uploading so a rejected request never leaves an orphan file.
    const result = parseEventInput(req.body, { imageUploaded: Boolean(req.file) });
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    const data = result.data;
    if (req.file) data.image = await uploadCoverToStorage(companyId, req.file);

    const event = await prisma.event.create({
      data: { ...data, company: { connect: { id: companyId } } },
    });

    res.status(201).json({ success: true, data: withState(event) });
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const existing = await prisma.event.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Event not found.' });
      return;
    }

    const result = parseEventInput(req.body, { existing, imageUploaded: Boolean(req.file) });
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    const data = result.data;
    if (req.file) data.image = await uploadCoverToStorage(companyId, req.file);

    const event = await prisma.event.update({ where: { id }, data });

    // Best-effort cleanup of a replaced or removed image; never blocks the response.
    if (existing.image && existing.image !== event.image) {
      await deleteCoverFromStorage(existing.image);
    }

    res.json({ success: true, data: withState(event) });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const existing = await prisma.event.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Event not found.' });
      return;
    }

    await prisma.event.delete({ where: { id } });
    if (existing.image) await deleteCoverFromStorage(existing.image);

    res.json({ success: true, message: 'Event deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// ─── Metrics ──────────────────────────────────────────────────────────────────

/** Totals and distinct visitors per (event, type) within [from, to). */
const countInteractions = async (
  companyId: number,
  from: Date,
  to: Date,
  eventIds?: number[],
): Promise<Map<number, InteractionCount[]>> => {
  const rows = await prisma.$queryRaw<{ eventId: number; type: EventInteractionType; total: bigint; unique: bigint }[]>`
    SELECT event_id AS "eventId", type::text AS type,
           COUNT(*) AS total, COUNT(DISTINCT visitor_id) AS "unique"
    FROM event_interactions
    WHERE company_id = ${companyId}
      AND created_at >= ${from} AND created_at < ${to}
      ${eventIds ? Prisma.sql`AND event_id IN (${Prisma.join(eventIds)})` : Prisma.empty}
    GROUP BY event_id, type`;

  const byEvent = new Map<number, InteractionCount[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push({ type: row.type, total: Number(row.total), unique: Number(row.unique) });
    byEvent.set(row.eventId, list);
  }
  return byEvent;
};

/**
 * GET /api/events/metrics
 *
 * Interaction metrics for every event of the company within the range.
 * Optional query params: from, to (ISO 8601; default last 30 days), type.
 */
export const getEventsMetrics = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    const range = parseMetricsRange(req.query);
    if ('error' in range) {
      res.status(400).json({ success: false, error: range.error });
      return;
    }
    const typeFilter = parseTypeFilter(req.query.type);
    if ('error' in typeFilter) {
      res.status(400).json({ success: false, error: typeFilter.error });
      return;
    }

    const events = await prisma.event.findMany({
      where: { companyId, ...(typeFilter.types && { type: { in: typeFilter.types } }) },
      select: { id: true, title: true, type: true, isActive: true, startsAt: true, endsAt: true },
    });
    const counts = events.length
      ? await countInteractions(companyId, range.from, range.to, events.map((e) => e.id))
      : new Map<number, InteractionCount[]>();

    const now = new Date();
    const data = events
      .map((e) => ({
        eventId: e.id,
        title: e.title,
        type: e.type,
        state: getEventState(e, now),
        ...buildMetrics(counts.get(e.id) ?? []),
      }))
      .sort((a, b) => b.impressions - a.impressions || b.ctaClicks - a.ctaClicks || b.eventId - a.eventId);

    res.json({ success: true, data, meta: { from: range.from, to: range.to } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/events/:id/metrics
 *
 * Totals, unique visitors, rates and a daily (UTC) series for one event.
 * Optional query params: from, to (ISO 8601; default last 30 days).
 */
export const getEventMetrics = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const range = parseMetricsRange(req.query);
    if ('error' in range) {
      res.status(400).json({ success: false, error: range.error });
      return;
    }

    const event = await prisma.event.findFirst({ where: { id, companyId } });
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found.' });
      return;
    }

    const [counts, dailyRows] = await Promise.all([
      countInteractions(companyId, range.from, range.to, [id]),
      prisma.$queryRaw<{ day: Date; type: EventInteractionType; total: bigint }[]>`
        SELECT date_trunc('day', created_at) AS day, type::text AS type, COUNT(*) AS total
        FROM event_interactions
        WHERE event_id = ${id} AND created_at >= ${range.from} AND created_at < ${range.to}
        GROUP BY 1, 2`,
    ]);

    res.json({
      success: true,
      data: {
        event: withState(event),
        range: { from: range.from, to: range.to },
        totals: buildMetrics(counts.get(id) ?? []),
        daily: buildDailySeries(
          dailyRows.map((r) => ({ day: r.day, type: r.type, total: Number(r.total) })),
          range.from,
          range.to,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
};
