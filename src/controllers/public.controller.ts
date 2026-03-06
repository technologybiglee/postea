import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';

// Inline include avoids Prisma's type inference issues when using variables
const INCLUDE = {
  category: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} as const;

type FlatPost<T extends { tags: { tag: { id: number; name: string } }[] }> = Omit<T, 'tags'> & {
  tags: { id: number; name: string }[];
};

function flattenTags<T extends { tags: { tag: { id: number; name: string } }[] }>(post: T): FlatPost<T> {
  return { ...post, tags: post.tags.map((pt) => pt.tag) };
}

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
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const where = {
      ...(category && { category: { name: { equals: category, mode: 'insensitive' as const } } }),
      ...(tag && { tags: { some: { tag: { name: { equals: tag, mode: 'insensitive' as const } } } } }),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      success: true,
      data: posts.map(flattenTags),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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

    const post = await prisma.post.findUnique({
      where: { slug },
      include: {
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    if (!post) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    res.json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

// Keep unused const to avoid removing the shared object (useful for documentation)
void INCLUDE;
