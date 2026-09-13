import { Router } from 'express';
import {
  createCompany,
  getMyCompany,
  updateMyCompany,
  getMyCompanySettings,
  updateMyCompanySettings,
} from '../controllers/companies.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireSuperAdmin, requireCompanyUser } from '../middlewares/authorize.middleware';

const router = Router();

// Company creation is restricted to super admins.
router.post('/', authenticate, requireSuperAdmin, createCompany);

router.get('/me', authenticate, requireCompanyUser, getMyCompany);
router.put('/me', authenticate, requireCompanyUser, updateMyCompany);
router.get('/me/settings', authenticate, requireCompanyUser, getMyCompanySettings);
router.put('/me/settings', authenticate, requireCompanyUser, updateMyCompanySettings);

export default router;
