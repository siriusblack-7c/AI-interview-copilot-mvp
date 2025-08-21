import { Router } from 'express'
import { getSession, completeSession, nextMockQuestion, registerSession } from '../controllers/session.controller'

const router = Router()

router.get('/', getSession)
router.post('/complete', completeSession)
router.post('/mock/next-question', nextMockQuestion)
router.post('/register', registerSession)

export default router


