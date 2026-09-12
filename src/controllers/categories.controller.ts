import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';

export const getAllCategories = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const categories = await prisma.category.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);

    const category = await prisma.category.findFirst({ where: { id, companyId } });
    if (!category) {
      res.status(404).json({ success: false, error: 'Category not found.' });
      return;
    }
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { name } = req.body as { name: string };

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required.' });
      return;
    }
    const category = await prisma.category.create({ data: { name, companyId } });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);
    const { name } = req.body as { name: string };

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required.' });
      return;
    }

    const existing = await prisma.category.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Category not found.' });
      return;
    }

    const category = await prisma.category.update({ where: { id }, data: { name } });
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const id = Number(req.params.id);

    const existing = await prisma.category.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Category not found.' });
      return;
    }

    await prisma.category.delete({ where: { id } });
    res.json({ success: true, message: 'Category deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
