import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';

export const getAllTags = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    const tags = await prisma.tag.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
};

export const getTagById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const tag = await prisma.tag.findFirst({ where: { id, companyId } });
    if (!tag) {
      res.status(404).json({ success: false, error: 'Tag not found.' });
      return;
    }
    res.json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

export const createTag = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const { name } = req.body as { name: string };

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required.' });
      return;
    }
    const tag = await prisma.tag.create({ data: { name, companyId } });
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

export const updateTag = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);
    const { name } = req.body as { name: string };

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required.' });
      return;
    }

    const existing = await prisma.tag.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Tag not found.' });
      return;
    }

    const tag = await prisma.tag.update({ where: { id }, data: { name } });
    res.json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

export const deleteTag = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;
    const id = Number(req.params.id);

    const existing = await prisma.tag.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Tag not found.' });
      return;
    }

    await prisma.tag.delete({ where: { id } });
    res.json({ success: true, message: 'Tag deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
