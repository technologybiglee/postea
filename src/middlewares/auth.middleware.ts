import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JwtPayload } from '../types';
import { prisma } from '../prisma/client';

/** Current identity of a user as stored in the database. */
export type UserLoader = (userId: number) => Promise<JwtPayload | null>;

const loadUserFromDb: UserLoader = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, companyId: true, role: true },
  });
  return user && { userId: user.id, email: user.email, companyId: user.companyId, role: user.role };
};

/**
 * Builds the auth middleware. The JWT only proves who the caller *was* when
 * the token was issued, so after verifying it we reload the user: a deleted
 * user is rejected immediately, and role/company changes take effect on the
 * next request instead of when the token expires.
 *
 * `loadUser` is injectable so tests don't need a database.
 */
export const createAuthenticate =
  (loadUser: UserLoader) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided. Authorization required.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      res.status(500).json({ success: false, error: 'Server misconfiguration: JWT secret not set.' });
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, secret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ success: false, error: 'Token expired. Please log in again.' });
        return;
      }
      res.status(401).json({ success: false, error: 'Invalid token.' });
      return;
    }

    try {
      const user = Number.isInteger(decoded.userId) ? await loadUser(decoded.userId) : null;
      if (!user) {
        res.status(401).json({ success: false, error: 'User no longer exists. Please log in again.' });
        return;
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Protects private routes by validating the Bearer JWT in the Authorization
 * header and attaching the user's current identity to `req.user`.
 */
export const authenticate = createAuthenticate(loadUserFromDb);
