import { Router } from 'express';
import {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from '../controllers/posts.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireCompanyUser } from '../middlewares/authorize.middleware';

const router = Router();

// All private post routes require a valid JWT for a company-scoped user
router.use(authenticate);
router.use(requireCompanyUser);

router.get('/', getAllPosts);
router.get('/:id', getPostById);
router.post('/', createPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);

export default router;
