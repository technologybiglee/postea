import { Router } from 'express';
import { resolveCompany, getPublicPosts, getPublicPostBySlug, getPublicEvents } from '../controllers/public.controller';

const router = Router();

router.get('/companies/:companySlug/posts', resolveCompany, getPublicPosts);
router.get('/companies/:companySlug/posts/:slug', resolveCompany, getPublicPostBySlug);
router.get('/companies/:companySlug/events', resolveCompany, getPublicEvents);

export default router;
