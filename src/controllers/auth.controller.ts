import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

const SALT_ROUNDS = 12;

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, name, companyId } = req.body as {
      email: string;
      password: string;
      name: string;
      companyId: number;
    };

    if (!email || !password || !name || !companyId) {
      res.status(400).json({ success: false, error: 'email, password, name and companyId are required.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
      return;
    }

    const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, companyId: company.id },
      select: { id: true, email: true, name: true, role: true, companyId: true, createdAt: true },
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'email and password are required.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: { select: { id: true, name: true, slug: true } } },
    });
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials.' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ success: false, error: 'Invalid credentials.' });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';

    const token = jwt.sign(
      { userId: user.id, email: user.email, companyId: user.companyId, role: user.role },
      secret,
      { expiresIn } as jwt.SignOptions,
    );

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        company: user.company,
      },
    });
  } catch (error) {
    next(error);
  }
};
