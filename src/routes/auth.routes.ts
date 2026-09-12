import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Throttle brute-force / credential-stuffing attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please try again in a few minutes.',
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

export default router;
