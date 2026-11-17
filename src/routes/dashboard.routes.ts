import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireCompanyUser } from '../middlewares/authorize.middleware';

const router = Router();

// Company-scoped summary; requires a valid JWT for a company user.
router.use(authenticate);
router.use(requireCompanyUser);

router.get('/', getDashboard);

export default router;
