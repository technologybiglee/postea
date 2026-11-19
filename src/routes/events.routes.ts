import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsMetrics,
  getEventMetrics,
} from '../controllers/events.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireCompanyUser } from '../middlewares/authorize.middleware';
import { uploadEventImage } from '../middlewares/upload.middleware';

const router = Router();

// Company-scoped promotional events (banner, bar, circular).
router.use(authenticate);
router.use(requireCompanyUser);

router.get('/', getAllEvents);
// Before '/:id' so "metrics" is not taken as an id.
router.get('/metrics', getEventsMetrics);
router.get('/:id/metrics', getEventMetrics);
router.get('/:id', getEventById);
router.post('/', uploadEventImage, createEvent);
router.put('/:id', uploadEventImage, updateEvent);
router.delete('/:id', deleteEvent);

export default router;
