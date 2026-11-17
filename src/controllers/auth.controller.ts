import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';

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
