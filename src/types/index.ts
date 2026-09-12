import { Request } from 'express';

export interface JwtPayload {
  userId: number;
  email: string;
  companyId: number;
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
