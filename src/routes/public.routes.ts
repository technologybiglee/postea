import { Router } from 'express';
import {
  resolveCompany,
  getPublicPosts,
  getPublicPostBySlug,
  getPublicEvents,
  trackEventInteraction,
} from '../controllers/public.controller';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Each page view may send an impression per visible event, so keep this generous.
const trackingLimit = rateLimit({ windowMs: 60 * 1000, max: 120 });

router.get('/companies/:companySlug/posts', resolveCompany, getPublicPosts);
router.get('/companies/:companySlug/posts/:slug', resolveCompany, getPublicPostBySlug);
router.get('/companies/:companySlug/events', resolveCompany, getPublicEvents);
router.post('/companies/:companySlug/events/:id/interactions', trackingLimit, resolveCompany, trackEventInteraction);

export default router;
