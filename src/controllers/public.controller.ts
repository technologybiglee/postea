import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

// Explicit payload type — avoids relying on TS server cache of the generated include types
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
 * GET /api/public/posts
 *
 * Optional query params:
 *   - category: category name (e.g. ?category=javascript)
 *   - tag:      tag name      (e.g. ?tag=node)
 *   - page:     page number   (default: 1)
 *   - limit:    items/page    (default: 10, max: 50)
 */
export const getPublicPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const tag      = typeof req.query.tag      === 'string' ? req.query.tag      : undefined;
    const page     = Math.max(1, Number(req.query.page)  || 1);
    const limit    = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip     = (page - 1) * limit;

    const where: Prisma.PostWhereInput = {
      ...(category && { category: { name: { equals: category, mode: 'insensitive' } } }),
      ...(tag      && { tags:     { some: { tag: { name: { equals: tag, mode: 'insensitive' } } } } }),
    };

    const [rawPosts, total] = await Promise.all([
      prisma.post.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.post.count({ where }),
    ]);

    const posts = rawPosts as unknown as PublicPostPayload[];

    res.json({
      success: true,
      data: posts.map(flattenTags),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/public/posts/:slug
 *
 * Returns the full detail of a single post identified by its slug.
 */
export const getPublicPostBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = String(req.params['slug']);

    const raw = await prisma.post.findUnique({ where: { slug }, include });

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
