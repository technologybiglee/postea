import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { POST_INCLUDE, flattenTags } from './posts.controller';
import { publishDuePosts } from '../utils/scheduler';
import { validateUserInput, hashPassword } from '../utils/users';
import { isEmailTaken, checkUserDeletable } from './users.controller';

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
    await publishDuePosts();

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

    await publishDuePosts();

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

// ─── Users (write) ───────────────────────────────────────────────────────────

const VALID_ROLES: UserRole[] = ['user', 'super_admin'];

/**
 * Resolves the role/company pair a user should end up with, keeping them
 * consistent: a `super_admin` never belongs to a company, a `user` always
 * belongs to an existing one. `current` is the stored user on updates.
 */
const resolveRoleAndCompany = async (
  body: { role?: unknown; companyId?: unknown },
  current?: { role: UserRole; companyId: number | null },
): Promise<{ role: UserRole; companyId: number | null } | { status: number; error: string }> => {
  if (body.role !== undefined && !VALID_ROLES.includes(body.role as UserRole)) {
    return { status: 400, error: `role must be one of: ${VALID_ROLES.join(', ')}.` };
  }
  const role = (body.role as UserRole | undefined) ?? current?.role ?? 'user';

  if (role === 'super_admin') return { role, companyId: null };

  let companyId = current?.role === 'user' ? current.companyId : null;
  if (body.companyId !== undefined && body.companyId !== null) {
    companyId = Number(body.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return { status: 400, error: 'companyId must be a positive integer.' };
    }
  }
  if (companyId === null) {
    return { status: 400, error: 'companyId is required for users with role "user".' };
  }

  if (companyId !== current?.companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return { status: 404, error: 'Company not found.' };
  }

  return { role, companyId };
};

export const createUserAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = validateUserInput(req.body);
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    const { email, password, name } = result.data as Required<typeof result.data>;

    const roleAndCompany = await resolveRoleAndCompany(req.body ?? {});
    if ('error' in roleAndCompany) {
      res.status(roleAndCompany.status).json({ success: false, error: roleAndCompany.error });
      return;
    }

    if (await isEmailTaken(email)) {
      res.status(409).json({ success: false, error: 'Email already registered.' });
      return;
    }

    const user = await prisma.user.create({
      data: { email, name, password: await hashPassword(password), ...roleAndCompany },
      select: ADMIN_USER_SELECT,
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateUserAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const result = validateUserInput(req.body, { partial: true });
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    const { email, password, name } = result.data;

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, companyId: true } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const roleAndCompany = await resolveRoleAndCompany(req.body ?? {}, existing);
    if ('error' in roleAndCompany) {
      res.status(roleAndCompany.status).json({ success: false, error: roleAndCompany.error });
      return;
    }

    // A super admin demoting themselves would lose access to this panel.
    if (id === req.user!.userId && roleAndCompany.role !== existing.role) {
      res.status(400).json({ success: false, error: 'You cannot change your own role.' });
      return;
    }

    // Moving an author to another company would leave their posts with an
    // author from a different tenant.
    if (roleAndCompany.companyId !== existing.companyId) {
      const postCount = await prisma.post.count({ where: { authorId: id } });
      if (postCount > 0) {
        res.status(409).json({
          success: false,
          error: `User has ${postCount} post(s). Reassign or delete them before changing the user's company or role.`,
        });
        return;
      }
    }

    if (email !== undefined && (await isEmailTaken(email, id))) {
      res.status(409).json({ success: false, error: 'Email already registered.' });
      return;
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(email !== undefined && { email }),
        ...(name !== undefined && { name }),
        ...(password !== undefined && { password: await hashPassword(password) }),
        ...roleAndCompany,
      },
      select: ADMIN_USER_SELECT,
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const deleteUserAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const blocked = await checkUserDeletable(id, req.user!.userId);
    if (blocked) {
      res.status(blocked.status).json({ success: false, error: blocked.error });
      return;
    }

    await prisma.user.delete({ where: { id } });

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
