import { Response, NextFunction } from 'express';
import { EventType, Prisma } from '@prisma/client';
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
