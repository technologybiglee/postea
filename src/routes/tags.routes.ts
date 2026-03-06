import { Router } from 'express';
import {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
} from '../controllers/tags.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getAllTags);
router.get('/:id', getTagById);
router.post('/', createTag);
router.put('/:id', updateTag);
router.delete('/:id', deleteTag);

export default router;
