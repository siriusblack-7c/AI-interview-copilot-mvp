const { z } = require('zod')
const { sessionCache } = require('../services/sessionCache.js')
const { fetchSessionFromMain, completeSessionOnMain, generateMockInterviewerQuestion } = require('../services/mainProjectApi.mock.js')
const { claudeService } = require('../services/claude.service.js')
const { chatMemory } = require('../sockets/chatMemory.js')

const idSchema = z.object({ sessionId: z.string().min(1) })

function extractSessionId(req) {
    const fromQuery = (() => { try { return idSchema.parse(req.query) } catch { return null } })()
    if (fromQuery) return fromQuery
    const fromBody = (() => { try { return idSchema.parse(req.body) } catch { return null } })()
    if (fromBody) return fromBody
    // Fallback for axios.post({ params: { sessionId } })
    try {
        const possible = (req.body && req.body.params) || {}
        const { sessionId } = idSchema.parse(possible)
        return { sessionId }
    } catch {
        throw new Error('sessionId is required')
    }
}

async function getSession(req, res, next) {
    try {
        const { sessionId } = extractSessionId(req)
        // 1) Check cache
        const cached = sessionCache.get(sessionId)
        if (cached) {
            return res.json({ ok: true, data: cached })
        }
        // 2) Fetch from main (mock for now), store as-is
        const data = await fetchSessionFromMain(sessionId)
        const normalized = {
            ...data,
            // Ensure empty strings if absent
            resume: typeof data.resume === 'string' ? data.resume : '',
            jobDescription: typeof data.jobDescription === 'string' ? data.jobDescription : '',
            context: typeof data.context === 'string' ? data.context : '',
        }
        sessionCache.set(sessionId, normalized)
        // Set on Claude service immediately
        claudeService.setDefaultContext({
            resume: normalized.resume,
            jobDescription: normalized.jobDescription,
            additionalContext: normalized.context,
        })
        return res.json({ ok: true, data: sessionCache.get(sessionId) })
    } catch (err) {
        next(err)
    }
}

const completeSchema = z.object({
    sessionId: z.string().min(1),
    socketId: z.string().optional(),
    history: z
        .array(z.object({ role: z.enum(['user', 'interviewer']), content: z.string().min(1) }))
        .default([]),
    stats: z
        .object({
            totalTranscriptions: z.number().int().nonnegative().default(0),
            totalAIResponses: z.number().int().nonnegative().default(0),
            totalTokensUsed: z.number().int().nonnegative().default(0),
            averageTranscriptionTime: z.number().nonnegative().default(0),
            averageResponseTime: z.number().nonnegative().default(0),
        })
        .default({ totalTranscriptions: 0, totalAIResponses: 0, totalTokensUsed: 0, averageTranscriptionTime: 0, averageResponseTime: 0 }),
})

async function completeSession(req, res, next) {
    try {
        // Accept body or nested body.params
        const payload = (() => {
            try { return completeSchema.parse(req.body) } catch { }
            try { return completeSchema.parse((req.body?.params || {})) } catch { }
            return null
        })()
        if (!payload) {
            res.status(400).json({ ok: false, error: 'invalid payload' })
            return
        }
        const { sessionId, socketId, history, stats } = payload
        let finalHistory = history
        if ((!finalHistory || finalHistory.length === 0) && socketId) {
            try {
                finalHistory = chatMemory.getAll(socketId)
            } catch { finalHistory = [] }
        }
        let record = sessionCache.get(sessionId)
        if (!record) {
            const fetched = await fetchSessionFromMain(sessionId)
            record = {
                ...fetched,
                resume: fetched.resume || '',
                jobDescription: fetched.jobDescription || '',
                context: fetched.context || '',
            }
        }
        const nowIso = new Date().toISOString()
        const updated = {
            ...(record || { sessionId, resume: '', jobDescription: '', context: '' }),
            status: 'completed',
            endedAt: nowIso,
            updatedAt: nowIso,
            totalTranscriptions: stats.totalTranscriptions,
            totalAIResponses: stats.totalAIResponses,
            totalTokensUsed: stats.totalTokensUsed,
            averageTranscriptionTime: stats.averageTranscriptionTime,
            averageResponseTime: stats.averageResponseTime,
            history: finalHistory,
        }
        sessionCache.set(sessionId, updated)
        await completeSessionOnMain(sessionId, updated)
        return res.json({ ok: true, data: updated })
    } catch (err) {
        next(err)
    }
}

const askMockSchema = z.object({
    sessionId: z.string().min(1),
    lastAnswer: z.string().optional(),
})

async function nextMockQuestion(req, res, next) {
    try {
        const parsed = (() => { try { return askMockSchema.parse(req.body) } catch { return askMockSchema.parse((req.body?.params || {})) } })()
        const { sessionId, lastAnswer } = parsed
        let record = sessionCache.get(sessionId)
        if (!record) record = await fetchSessionFromMain(sessionId)
        if ((record?.type || 'live') !== 'mock') {
            res.status(400).json({ ok: false, error: 'Session is not mock type' })
            return
        }

        // Prefer OpenAI-powered interviewer questions when configured; fallback to simple mock generator
        let question = null
        try {
            const seed = (lastAnswer && lastAnswer.trim())
                ? `User just answered: "${lastAnswer.trim()}". Ask a relevant next interview question.`
                : `Start a mock interview${record.jobDescription ? ' based on the job description' : ''}${record.resume ? ' and resume' : ''}. Ask a strong opening question.`

            // Avoid repeating recently asked mock questions by remembering them in the session cache
            const prev = Array.isArray(record.lastMockQuestions) ? record.lastMockQuestions : []

            // Try to get up to three options and pick the first not in prev
            const options = await claudeService.suggestNextQuestionsFromUtterance(seed, {
                resume: record.resume,
                jobDescription: record.jobDescription,
                additionalContext: record.context,
            })
            const pick = options.find(q => !prev.some(p => p.toLowerCase() === q.toLowerCase())) || options[0]
            question = (pick || '').trim() || null

            // Persist chosen question for dedupe next round
            const updatedPrev = [...prev, question].slice(-10)
            sessionCache.set(sessionId, { ...record, lastMockQuestions: updatedPrev, updatedAt: new Date().toISOString() })
        } catch {
            // Fallback lightweight generator when Claude not configured or errors
            const q = await generateMockInterviewerQuestion({ session: record, lastAnswer: lastAnswer || '' })
            question = q
            sessionCache.set(sessionId, { ...record, updatedAt: new Date().toISOString() })
        }

        res.json({ ok: true, question: question || '' })
    } catch (err) {
        next(err)
    }
}

const registerSchema = z.object({
    sessionId: z.string().min(1),
    resume: z.string().optional(),
    jobDescription: z.string().optional(),
    context: z.string().optional(),
    type: z.enum(['live', 'mock', 'coding']).optional(),
})

async function registerSession(req, res, next) {
    try {
        // Accept multiple shapes from FE/main backend
        const raw = req.body || {}
        const params = (raw && raw.params) || {}
        const sid = String(
            raw.sessionId ?? raw.sessionID ?? params.sessionId ?? params.sessionID ?? ''
        ).trim()
        if (!sid) {
            res.status(400).json({ ok: false, error: 'sessionId is required' })
            return
        }
        const resume = (() => {
            const r = raw.resume ?? raw.resume_textcontent ?? params.resume ?? ''
            return typeof r === 'string' ? r : ''
        })()
        const jobDescription = (() => {
            const jd = raw.jobDescription ?? raw.role ?? params.jobDescription ?? ''
            return typeof jd === 'string' ? jd : ''
        })()
        const additionalContext = (() => {
            const c = raw.additionalContext ?? params.additionalContext ?? ''
            return typeof c === 'string' ? c : ''
        })()
        const type = (() => {
            const t = raw.type ?? params.type
            return t === 'mock' || t === 'coding' || t === 'live' ? t : undefined
        })()

        const prev = sessionCache.get(sid)
        const normalized = {
            ...(prev || { sessionId: sid, status: 'active' }),
            sessionId: sid,
            resume,
            jobDescription,
            additionalContext,
            type: type || prev?.type || 'live',
            updatedAt: new Date().toISOString(),
        }
        sessionCache.set(sid, normalized)
        claudeService.setDefaultContext({
            resume: normalized.resume,
            jobDescription: normalized.jobDescription,
            additionalContext: normalized.additionalContext,
        })
        console.log('registerSession', { sessionId: sid, len: { resume: resume.length, jobDescription: jobDescription.length, context: additionalContext.length } })
        res.json({ ok: true, data: normalized })
    } catch (err) {
        next(err)
    }
}

module.exports = { getSession, completeSession, nextMockQuestion, registerSession }
