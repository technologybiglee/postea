import { Router } from 'express';
import {
  getAllCompaniesAdmin,
  getCompanyByIdAdmin,
  getAllUsersAdmin,
  getUserByIdAdmin,
  getAllPostsAdmin,
  getPostByIdAdmin,
} from '../controllers/admin.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireSuperAdmin } from '../middlewares/authorize.middleware';

const router = Router();

// Every route here is super-admin only, read-only, cross-tenant.
router.use(authenticate, requireSuperAdmin);

router.get('/companies', getAllCompaniesAdmin);
router.get('/companies/:id', getCompanyByIdAdmin);
router.get('/users', getAllUsersAdmin);
router.get('/users/:id', getUserByIdAdmin);
router.get('/posts', getAllPostsAdmin);
router.get('/posts/:id', getPostByIdAdmin);

export default router;
