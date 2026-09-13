import { Router } from 'express';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categories.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireCompanyUser } from '../middlewares/authorize.middleware';

const router = Router();

router.use(authenticate);
router.use(requireCompanyUser);

router.get('/', getAllCategories);
router.get('/:id', getCategoryById);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
