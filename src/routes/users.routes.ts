import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser } from '../controllers/users.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireCompanyUser } from '../middlewares/authorize.middleware';

const router = Router();

// Company-scoped user management; every query is limited to the caller's company.
router.use(authenticate);
router.use(requireCompanyUser);

router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
