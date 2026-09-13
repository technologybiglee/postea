import { Response, NextFunction } from 'express';
import { PostStatus } from '@prisma/client';
import slugify from 'slugify';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';

const VALID_STATUSES: PostStatus[] = ['draft', 'pending', 'published'];

/**
 * POST /api/companies  (super admin only)
 */
export const createCompany = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, slug: rawSlug } = req.body as { name: string; slug?: string };

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required.' });
      return;
    }

    const slug = rawSlug
      ? slugify(rawSlug, { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

    if (!slug) {
      res.status(400).json({ success: false, error: 'Could not generate a valid slug from the provided name.' });
      return;
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        settings: { create: {} },
      },
      include: { settings: true },
    });

    res.status(201).json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/me  (auth required)
 */
export const getMyCompany = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { settings: true },
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

/**
 * PUT /api/companies/me  (auth required)
 */
export const updateMyCompany = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const { name } = req.body as { name?: string };

    const company = await prisma.company.update({
      where: { id: companyId },
      data: { ...(name && { name }) },
      include: { settings: true },
    });

    res.json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/me/settings  (auth required)
 */
export const getMyCompanySettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    const settings = await prisma.companySettings.findUnique({ where: { companyId } });

    if (!settings) {
      res.status(404).json({ success: false, error: 'Company settings not found.' });
      return;
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/companies/me/settings  (auth required)
 */
export const updateMyCompanySettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const { allowedOrigins, defaultPostStatus } = req.body as {
      allowedOrigins?: string[];
      defaultPostStatus?: PostStatus;
    };

    if (defaultPostStatus !== undefined && !VALID_STATUSES.includes(defaultPostStatus)) {
      res.status(400).json({
        success: false,
        error: `defaultPostStatus must be one of: ${VALID_STATUSES.join(', ')}.`,
      });
      return;
    }

    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      update: {
        ...(allowedOrigins !== undefined && { allowedOrigins }),
        ...(defaultPostStatus !== undefined && { defaultPostStatus }),
      },
      create: {
        companyId,
        ...(allowedOrigins !== undefined && { allowedOrigins }),
        ...(defaultPostStatus !== undefined && { defaultPostStatus }),
      },
    });

    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};
