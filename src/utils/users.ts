import bcrypt from 'bcryptjs';

export const SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fields returned for a user. Never includes `password`. */
export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface UserInput {
  email?: string;
  password?: string;
  name?: string;
}

export type ValidationResult = { data: UserInput } | { error: string };

/**
 * Validates and normalizes email / password / name from a request body.
 * With `partial: true` (updates) every field is optional, but any field
 * that is sent must still be valid. Only known fields are returned.
 */
export const validateUserInput = (body: unknown, { partial = false } = {}): ValidationResult => {
  const { email, password, name } = (body ?? {}) as Record<string, unknown>;
  const data: UserInput = {};

  if (!partial && (email === undefined || password === undefined || name === undefined)) {
    return { error: 'email, password and name are required.' };
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return { error: 'email must be a valid email address.' };
    }
    data.email = email.trim().toLowerCase();
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    data.password = password;
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      return { error: 'name must be a non-empty string.' };
    }
    data.name = name.trim();
  }

  return { data };
};

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);
