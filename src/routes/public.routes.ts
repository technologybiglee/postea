import { Router } from 'express';
import { getPublicPosts, getPublicPostBySlug } from '../controllers/public.controller';

const router = Router();

// No authentication required — these routes are meant for external consumers
router.get('/posts', getPublicPosts);
router.get('/posts/:slug', getPublicPostBySlug);

export default router;
