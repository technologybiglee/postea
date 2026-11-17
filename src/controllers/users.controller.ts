import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { USER_SELECT, validateUserInput, hashPassword } from '../utils/users';
import { parsePagination, buildMeta } from '../utils/pagination';

// ─── Shared guards (also used by the super-admin controller) ──────────────────

/** True when another user (not `exceptId`) already uses this email. */
export const isEmailTaken = async (email: string, exceptId?: number): Promise<boolean> => {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return existing !== null && existing.id !== exceptId;
};

/**
 * Checks whether a user can be deleted. Returns `{ status, error }` when not:
 * you can't delete yourself (avoids locking yourself out), and a user who
 * authored posts can't be removed because `Post.authorId` is required.
 */
export const checkUserDeletable = async (
  id: number,
  requesterId: number,
): Promise<{ status: number; error: string } | null> => {
  if (id === requesterId) {
    return { status: 400, error: 'You cannot delete your own user.' };
  }

  const postCount = await prisma.post.count({ where: { authorId: id } });
  if (postCount > 0) {
    return {
      status: 409,
      error: `User has ${postCount} post(s). Reassign or delete them before deleting the user.`,
    };
  }

  return null;
};

// ─── Company-scoped controllers ──────────────────────────────────────────────

export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const { page, limit, skip } = parsePagination(req.query);

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where: { companyId }, select: USER_SELECT, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.user.count({ where: { companyId } }),
    ]);

    res.json({ success: true, data: users, meta: buildMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const user = await prisma.user.findFirst({ where: { id, companyId }, select: USER_SELECT });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    const result = validateUserInput(req.body);
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    const { email, password, name } = result.data as Required<typeof result.data>;

    if (await isEmailTaken(email)) {
      res.status(409).json({ success: false, error: 'Email already registered.' });
      return;
    }

    // Company users can only create regular users in their own company.
    const user = await prisma.user.create({
      data: { email, name, password: await hashPassword(password), role: 'user', companyId },
      select: USER_SELECT,
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const result = validateUserInput(req.body, { partial: true });
    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    const { email, password, name } = result.data;

    const existing = await prisma.user.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
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
      },
      select: USER_SELECT,
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const existing = await prisma.user.findFirst({ where: { id, companyId }, select: { id: true } });
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
