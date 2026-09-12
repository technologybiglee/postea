import { Router } from 'express';
import { resolveCompany, getPublicPosts, getPublicPostBySlug } from '../controllers/public.controller';

const router = Router();

router.get('/companies/:companySlug/posts', resolveCompany, getPublicPosts);
router.get('/companies/:companySlug/posts/:slug', resolveCompany, getPublicPostBySlug);

export default router;
