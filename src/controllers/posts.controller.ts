import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { generateSlug } from '../utils/slug';

// ─── Shared include config ────────────────────────────────────────────────────
// Centralise the relations we always want to load with a post so that every
// controller action returns a consistent shape.
const POST_INCLUDE = {
  category: { select: { id: true, name: true } },
  tags: {
    select: {
      tag: { select: { id: true, name: true } },
    },
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Transforms the raw PostTag[] join records into a flat array of tag objects.
 * Before: [{ tag: { id: 1, name: 'node' } }]
 * After:  [{ id: 1, name: 'node' }]
 */
const flattenTags = (post: { tags: { tag: { id: number; name: string } }[] }) => ({
  ...post,
  tags: post.tags.map((pt) => pt.tag),
});

/**
 * Resolves tag IDs from the request body.
 * Accepts either an array of IDs (numbers) or an empty array.
 * Returns the Prisma `set` syntax to replace the post's current tags.
 */
const buildTagsConnect = (tagIds: number[]) =>
  tagIds.map((id) => ({ postId_tagId: { postId: 0, tagId: id } })); // placeholder, see usage below

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getAllPosts = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const posts = await prisma.post.findMany({
      include: POST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: posts.map(flattenTags) });
  } catch (error) {
    next(error);
  }
};

export const getPostById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const post = await prisma.post.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!post) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    res.json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { title, cover, body, categoryId, tagIds = [] } = req.body as {
      title: string;
      cover?: string;
      body: string;
      categoryId: number;
      tagIds?: number[];
    };

    if (!title || !body || !categoryId) {
      res.status(400).json({ success: false, error: 'title, body and categoryId are required.' });
      return;
    }

    const slug = generateSlug(title);

    // We use a Prisma nested write to create the Post and the PostTag join rows
    // in a single atomic transaction — no need for prisma.$transaction here.
    const post = await prisma.post.create({
      data: {
        title,
        slug,
        cover,
        body,
        category: { connect: { id: Number(categoryId) } },
        // Nested create on the explicit join table
        tags: {
          create: tagIds.map((tagId) => ({
            tag: { connect: { id: tagId } },
          })),
        },
      },
      include: POST_INCLUDE,
    });

    res.status(201).json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

export const updatePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { title, cover, body, categoryId, tagIds } = req.body as {
      title?: string;
      cover?: string;
      body?: string;
      categoryId?: number;
      tagIds?: number[];
    };

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    // Regenerate slug only if the title actually changed
    const slug = title && title !== existing.title ? generateSlug(title) : existing.slug;

    // When tagIds are provided we do a full replacement:
    //   1. Delete all current PostTag rows for this post.
    //   2. Create the new ones.
    // This is wrapped in a transaction to keep the DB consistent.
    const post = await prisma.$transaction(async (tx) => {
      if (tagIds !== undefined) {
        await tx.postTag.deleteMany({ where: { postId: id } });
      }

      return tx.post.update({
        where: { id },
        data: {
          ...(title && { title }),
          slug,
          ...(cover !== undefined && { cover }),
          ...(body && { body }),
          ...(categoryId && { category: { connect: { id: Number(categoryId) } } }),
          ...(tagIds !== undefined && {
            tags: {
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            },
          }),
        },
        include: POST_INCLUDE,
      });
    });

    res.json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    // PostTag rows are deleted automatically via the onDelete: Cascade rule in schema.prisma
    await prisma.post.delete({ where: { id } });

    res.json({ success: true, message: 'Post deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// Suppress unused variable warning for unused helper
void buildTagsConnect;
