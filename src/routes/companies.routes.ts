import { Router } from 'express';
import {
  createCompany,
  getMyCompany,
  updateMyCompany,
  getMyCompanySettings,
  updateMyCompanySettings,
} from '../controllers/companies.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Public onboarding endpoint — throttle to prevent spam sign-ups.
const createCompanyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many companies created from this address. Please try again later.',
});

router.post('/', createCompanyLimiter, createCompany);

router.get('/me', authenticate, getMyCompany);
router.put('/me', authenticate, updateMyCompany);
router.get('/me/settings', authenticate, getMyCompanySettings);
router.put('/me/settings', authenticate, updateMyCompanySettings);

export default router;
