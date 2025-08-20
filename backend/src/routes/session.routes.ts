import { Router } from 'express'
import { getSession, completeSession, nextMockQuestion } from '../controllers/session.controller'

const router = Router()

router.get('/', getSession)
router.post('/complete', completeSession)
router.post('/mock/next-question', nextMockQuestion)

export default router


