import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

/**
 * Restricts a route to super admin users. Must run after `authenticate`.
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ success: false, error: 'Super admin access required.' });
    return;
  }
  next();
};

/**
 * Restricts a route to users that belong to a company (i.e. not a super admin).
 * Must run after `authenticate`. Lets tenant-scoped controllers safely treat
 * `req.user.companyId` as non-null.
 */
export const requireCompanyUser = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.companyId == null) {
    res.status(403).json({ success: false, error: 'This action requires a user associated with a company.' });
    return;
  }
  next();
};
