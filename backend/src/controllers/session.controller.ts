import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { sessionCache, type SessionData } from '../services/sessionCache'
import { fetchSessionFromMain, completeSessionOnMain, generateMockInterviewerQuestion } from '../services/mainProjectApi.mock'
import { openaiService } from '../services/openai.service'
import { chatMemory } from '../sockets/chatMemory'

const idSchema = z.object({ sessionId: z.string().min(1) })

function extractSessionId(req: Request): { sessionId: string } {
    const fromQuery = (() => { try { return idSchema.parse(req.query) } catch { return null } })()
    if (fromQuery) return fromQuery
    const fromBody = (() => { try { return idSchema.parse(req.body) } catch { return null } })()
    if (fromBody) return fromBody
    // Fallback for axios.post({ params: { sessionId } })
    try {
        const possible = (req.body && (req.body as any).params) || {}
        const { sessionId } = idSchema.parse(possible)
        return { sessionId }
    } catch {
        throw new Error('sessionId is required')
    }
}

export async function getSession(req: Request, res: Response, next: NextFunction) {
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
        // Set on OpenAI service immediately
        openaiService.setDefaultContext({
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

export async function completeSession(req: Request, res: Response, next: NextFunction) {
    try {
        // Accept body or nested body.params
        const payload = (() => {
            try { return completeSchema.parse(req.body) } catch { }
            try { return completeSchema.parse((req.body as any)?.params || {}) } catch { }
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
        let record: SessionData | undefined = sessionCache.get(sessionId)
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
        const updated: SessionData = {
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

export async function nextMockQuestion(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = (() => { try { return askMockSchema.parse(req.body) } catch { return askMockSchema.parse((req.body as any)?.params || {}) } })()
        const { sessionId, lastAnswer } = parsed
        let record: SessionData | undefined = sessionCache.get(sessionId)
        if (!record) record = await fetchSessionFromMain(sessionId)
        if ((record?.type || 'live') !== 'mock') {
            res.status(400).json({ ok: false, error: 'Session is not mock type' })
            return
        }
        const q = await generateMockInterviewerQuestion({ session: record!, lastAnswer: lastAnswer || '' })
        // Also store in cache
        sessionCache.set(sessionId, { ...record!, updatedAt: new Date().toISOString() })
        res.json({ ok: true, question: q })
    } catch (err) {
        next(err)
    }
}


