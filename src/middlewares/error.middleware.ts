import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Global error handler. Must be registered LAST in the Express middleware chain
 * (after all routes) and must have exactly 4 parameters for Express to recognize it.
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  console.error('[ErrorHandler]', err);

  // Prisma: unique constraint violation (e.g. duplicate slug or email)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const field = (err.meta?.target as string[])?.join(', ') ?? 'field';
      res.status(409).json({ success: false, error: `A record with this ${field} already exists.` });
      return;
    }
    // Record not found (e.g. invalid foreign key)
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Related record not found.' });
      return;
    }
  }

  // Prisma: validation error (wrong types passed to ORM)
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ success: false, error: 'Invalid data format.' });
    return;
  }

  res.status(500).json({ success: false, error: 'Internal server error.' });
};

/**
 * Catches requests to undefined routes.
 */
export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found.` });
};
