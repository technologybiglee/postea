import { Request } from 'express';

export interface JwtPayload {
  userId: number;
  email: string;
}

// Extends Express Request to carry the authenticated user data
export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
