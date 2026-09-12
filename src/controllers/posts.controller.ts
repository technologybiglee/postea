import { Response, NextFunction } from 'express';
import { PostStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { generateSlug } from '../utils/slug';

const VALID_STATUSES: PostStatus[] = ['draft', 'pending', 'published'];

const POST_INCLUDE = {
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true, email: true } },
  tags: {
    select: {
      tag: { select: { id: true, name: true } },
    },
  },
} as const;

const flattenTags = (post: { tags: { tag: { id: number; name: string } }[] }) => ({
  ...post,
  tags: post.tags.map((pt) => pt.tag),
});

/**
 * Verifies that a category and/or tags belong to the given company, so a
 * user from one company can't link a post to another company's category or
 * tags by guessing IDs. Returns an error message, or null if everything is
 * owned by `companyId`.
 */
const checkOwnership = async (
  companyId: number,
  categoryId: number | undefined,
  tagIds: number[] | undefined,
): Promise<string | null> => {
  if (categoryId !== undefined) {
    const category = await prisma.category.findFirst({ where: { id: Number(categoryId), companyId } });
    if (!category) return 'Invalid categoryId.';
  }

  if (tagIds !== undefined && tagIds.length > 0) {
    const validCount = await prisma.tag.count({ where: { id: { in: tagIds }, companyId } });
    if (validCount !== tagIds.length) return 'One or more tagIds are invalid.';
  }

  return null;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getAllPosts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const posts = await prisma.post.findMany({
      where: { companyId },
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
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);

    const post = await prisma.post.findFirst({
      where: { id, companyId },
      include: POST_INCLUDE,
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

export const createPost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authorId = req.user!.userId;
    const companyId = req.user!.companyId;

    const { title, cover, body, categoryId, tagIds = [], status } = req.body as {
      title: string;
      cover?: string;
      body: string;
      categoryId: number;
      tagIds?: number[];
      status?: PostStatus;
    };

    if (!title || !body || !categoryId) {
      res.status(400).json({ success: false, error: 'title, body and categoryId are required.' });
      return;
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
      return;
    }

    const ownershipError = await checkOwnership(companyId, categoryId, tagIds);
    if (ownershipError) {
      res.status(400).json({ success: false, error: ownershipError });
      return;
    }

    // Fall back to the company's configured default status when the caller
    // doesn't specify one.
    const resolvedStatus =
      status ?? (await prisma.companySettings.findUnique({ where: { companyId } }))?.defaultPostStatus ?? 'draft';

    const slug = generateSlug(title);

    const post = await prisma.post.create({
      data: {
        title,
        slug,
        cover,
        body,
        status: resolvedStatus,
        company:  { connect: { id: companyId } },
        category: { connect: { id: Number(categoryId) } },
        author:   { connect: { id: authorId } },
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
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);
    const { title, cover, body, categoryId, tagIds, status } = req.body as {
      title?: string;
      cover?: string;
      body?: string;
      categoryId?: number;
      tagIds?: number[];
      status?: PostStatus;
    };

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
      return;
    }

    const existing = await prisma.post.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    const ownershipError = await checkOwnership(companyId, categoryId, tagIds);
    if (ownershipError) {
      res.status(400).json({ success: false, error: ownershipError });
      return;
    }

    const slug = title && title !== existing.title ? generateSlug(title) : existing.slug;

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
          ...(status && { status }),
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
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);

    const existing = await prisma.post.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Post not found.' });
      return;
    }

    await prisma.post.delete({ where: { id } });

    res.json({ success: true, message: 'Post deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
