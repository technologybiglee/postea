import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { POST_INCLUDE, flattenTags } from './posts.controller';

const ADMIN_POST_INCLUDE = {
  ...POST_INCLUDE,
  company: { select: { id: true, name: true, slug: true } },
} as const;

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  companyId: true,
  company: { select: { id: true, name: true, slug: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// ─── Companies ────────────────────────────────────────────────────────────────

export const getAllCompaniesAdmin = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companies = await prisma.company.findMany({
      include: { settings: true, _count: { select: { users: true, posts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: companies });
  } catch (error) {
    next(error);
  }
};

export const getCompanyByIdAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const company = await prisma.company.findUnique({
      where: { id },
      include: { settings: true, _count: { select: { users: true, posts: true } } },
    });
    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found.' });
      return;
    }

    res.json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

// ─── Users ──────────────────────────────────────────────────────────────────

export const getAllUsersAdmin = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: ADMIN_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export const getUserByIdAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id },
      select: ADMIN_USER_SELECT,
    });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ─── Posts ──────────────────────────────────────────────────────────────────

export const getAllPostsAdmin = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const posts = await prisma.post.findMany({
      include: ADMIN_POST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: posts.map(flattenTags) });
  } catch (error) {
    next(error);
  }
};

export const getPostByIdAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const post = await prisma.post.findUnique({
      where: { id },
      include: ADMIN_POST_INCLUDE,
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
