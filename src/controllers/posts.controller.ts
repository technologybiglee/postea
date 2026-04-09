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
    const authorId = req.user!.userId;

    const { title, cover, body, categoryId, tagIds = [], status = 'draft' } = req.body as {
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

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}.` });
      return;
    }

    const slug = generateSlug(title);

    const post = await prisma.post.create({
      data: {
        title,
        slug,
        cover,
        body,
        status,
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

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Post not found.' });
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
    const id = Number(req.params.id);

    const existing = await prisma.post.findUnique({ where: { id } });
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
