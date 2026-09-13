import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: number;
  email: string;
  companyId: number | null;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
