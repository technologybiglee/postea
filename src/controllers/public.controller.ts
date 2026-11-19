import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { publishDuePosts } from '../utils/scheduler';
import { parsePagination, buildMeta } from '../utils/pagination';
import { eventStateWhere } from '../utils/events';
import { parseTypeFilter } from './events.controller';
import { parseInteractionInput } from '../utils/eventMetrics';

type PublicPostPayload = Prisma.PostGetPayload<{
  include: {
    category: { select: { id: true; name: true } };
    author:   { select: { id: true; name: true } };
    tags:     { select: { tag: { select: { id: true; name: true } } } };
  };
}>;

type PublicPost = Omit<PublicPostPayload, 'tags'> & {
  tags: { id: number; name: string }[];
};

const flattenTags = (post: PublicPostPayload): PublicPost => ({
  ...post,
  tags: post.tags.map((pt) => pt.tag),
});

const include = {
  category: { select: { id: true as const, name: true as const } },
  author:   { select: { id: true as const, name: true as const } },
  tags:     { select: { tag: { select: { id: true as const, name: true as const } } } },
};

/**
 * Middleware: resolves the company from :companySlug and stores its id in res.locals.
 */
export const resolveCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companySlug = String(req.params['companySlug']);
    const company = await prisma.company.findUnique({ where: { slug: companySlug } });

    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found.' });
      return;
    }

    res.locals.companyId = company.id;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/public/companies/:companySlug/posts
 *
 * Optional query params:
 *   - category: category name (e.g. ?category=javascript)
 *   - tag:      tag name      (e.g. ?tag=node)
 *   - page:     page number   (default: 1)
 *   - limit:    items/page    (default: 10, max: 50)
 */
export const getPublicPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = res.locals.companyId as number;

    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const tag      = typeof req.query.tag      === 'string' ? req.query.tag      : undefined;
    const { page, limit, skip } = parsePagination(req.query);

    // The interval scheduler may not have run yet (e.g. the service just woke
    // up), so publish anything due before reading.
    await publishDuePosts(companyId);

    const where: Prisma.PostWhereInput = {
      companyId,
      status: 'published',
      ...(category && { category: { name: { equals: category, mode: 'insensitive' } } }),
      ...(tag      && { tags:     { some: { tag: { name: { equals: tag, mode: 'insensitive' } } } } }),
    };

    const [rawPosts, total] = await Promise.all([
      prisma.post.findMany({ where, include, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
      prisma.post.count({ where }),
    ]);

    const posts = rawPosts as unknown as PublicPostPayload[];

    res.json({
      success: true,
      data: posts.map(flattenTags),
      meta: buildMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/public/companies/:companySlug/posts/:slug
 */
export const getPublicPostBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = res.locals.companyId as number;
    const slug = String(req.params['slug']);

    await publishDuePosts(companyId);

    const raw = await prisma.post.findFirst({
      where: { companyId, slug, status: 'published' },
      include,
    });

    if (!raw) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    const post = raw as unknown as PublicPostPayload;

    res.json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

const PUBLIC_EVENT_SELECT = {
  id: true,
  title: true,
  content: true,
  image: true,
  ctaText: true,
  ctaUrl: true,
  ctaNewTab: true,
  type: true,
  position: true,
  backgroundColor: true,
  textColor: true,
  dismissible: true,
  priority: true,
  startsAt: true,
  endsAt: true,
} as const;

/**
 * GET /api/public/companies/:companySlug/events
 *
 * Events showing right now (active, started, not ended), highest priority
 * first. Optional query param:
 *   - type: banner, bar, circular (comma-separated for several)
 */
export const getPublicEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = res.locals.companyId as number;

    const typeFilter = parseTypeFilter(req.query.type);
    if ('error' in typeFilter) {
      res.status(400).json({ success: false, error: typeFilter.error });
      return;
    }

    const events = await prisma.event.findMany({
      where: {
        companyId,
        ...eventStateWhere('active'),
        ...(typeFilter.types && { type: { in: typeFilter.types } }),
      },
      select: PUBLIC_EVENT_SELECT,
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }, { id: 'desc' }],
    });

    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/public/companies/:companySlug/events/:id/interactions
 *
 * Records a visitor interaction with an event that is showing right now.
 * Body: { type: impression | cta_click | dismiss, visitorId?: string }
 */
export const trackEventInteraction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = res.locals.companyId as number;
    const id = Number(req.params['id']);

    const result = parseInteractionInput(req.body);
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    const { type, visitorId } = result.data;

    // Only events visible right now can be interacted with; this keeps paused
    // or expired events from collecting stray metrics.
    const event = Number.isInteger(id)
      ? await prisma.event.findFirst({
          where: { id, companyId, ...eventStateWhere('active') },
          select: { id: true, ctaUrl: true, dismissible: true },
        })
      : null;
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found.' });
      return;
    }

    if (type === 'cta_click' && !event.ctaUrl) {
      res.status(400).json({ success: false, error: 'This event has no CTA.' });
      return;
    }
    if (type === 'dismiss' && !event.dismissible) {
      res.status(400).json({ success: false, error: 'This event is not dismissible.' });
      return;
    }

    await prisma.eventInteraction.create({ data: { eventId: event.id, companyId, type, visitorId } });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
