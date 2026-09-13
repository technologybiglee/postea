import { Response, NextFunction } from 'express';
import { PostStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { generateSlug } from '../utils/slug';
import { uploadCoverToStorage, deleteCoverFromStorage } from '../utils/storage';

const VALID_STATUSES: PostStatus[] = ['draft', 'pending', 'published'];

/**
 * `tagIds` arrives as a real array over JSON, but as a JSON-encoded string
 * when the request is multipart/form-data (multer only parses text fields
 * as strings). Normalizes both shapes; throws a plain Error with a clear
 * message on malformed input, which the controllers turn into a 400.
 */
const parseTagIds = (tagIds: unknown): number[] | undefined => {
  if (tagIds === undefined) return undefined;
  if (typeof tagIds !== 'string') return tagIds as number[];

  try {
    const parsed = JSON.parse(tagIds);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error('tagIds must be a JSON array of numbers.');
  }
};

export const POST_INCLUDE = {
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true, email: true } },
  tags: {
    select: {
      tag: { select: { id: true, name: true } },
    },
  },
} as const;

export const flattenTags = (post: { tags: { tag: { id: number; name: string } }[] }) => ({
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
    const companyId = req.user!.companyId as number;

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
    const companyId = req.user!.companyId as number;
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
    const companyId = req.user!.companyId as number;

    const { title, cover, body, categoryId, status } = req.body as {
      title: string;
      cover?: string;
      body: string;
      categoryId: number;
      status?: PostStatus;
    };

    let tagIds: number[];
    try {
      tagIds = parseTagIds(req.body.tagIds) ?? [];
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
      return;
    }

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

    // An uploaded file takes priority over a plain `cover` URL string, so
    // existing JSON-based clients keep working unchanged.
    const resolvedCover = req.file ? await uploadCoverToStorage(companyId, req.file) : cover;

    const slug = generateSlug(title);

    const post = await prisma.post.create({
      data: {
        title,
        slug,
        cover: resolvedCover,
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
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);
    const { title, cover, body, categoryId, status } = req.body as {
      title?: string;
      cover?: string;
      body?: string;
      categoryId?: number;
      status?: PostStatus;
    };

    let tagIds: number[] | undefined;
    try {
      tagIds = parseTagIds(req.body.tagIds);
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
      return;
    }

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

    // An uploaded file takes priority over a plain `cover` URL string, so
    // existing JSON-based clients keep working unchanged.
    const resolvedCover = req.file ? await uploadCoverToStorage(companyId, req.file) : cover;

    const post = await prisma.$transaction(async (tx) => {
      if (tagIds !== undefined) {
        await tx.postTag.deleteMany({ where: { postId: id } });
      }

      return tx.post.update({
        where: { id },
        data: {
          ...(title && { title }),
          slug,
          ...(resolvedCover !== undefined && { cover: resolvedCover }),
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

    // Best-effort cleanup of the replaced cover image; never blocks the response.
    if (resolvedCover !== undefined && existing.cover && existing.cover !== resolvedCover) {
      await deleteCoverFromStorage(existing.cover);
    }

    res.json({ success: true, data: flattenTags(post) });
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
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
