import { Router } from 'express';
import {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from '../controllers/posts.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// All private post routes require a valid JWT
router.use(authenticate);

router.get('/', getAllPosts);
router.get('/:id', getPostById);
router.post('/', createPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);

export default router;
