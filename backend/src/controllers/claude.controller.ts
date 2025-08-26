import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { claudeService, type ChatContext } from '../services/claude.service'
import { sessionCache } from '../services/sessionCache'
import type { Request as ExpressRequest } from 'express'

const generateSchema = z.object({
    question: z.string().min(1),
    context: z
        .object({
            resume: z.string().optional(),
            jobDescription: z.string().optional(),
            additionalContext: z.string().optional(),
            verbosity: z.enum(['concise', 'default', 'lengthy']).optional(),
            language: z.string().optional(),
            temperature: z.enum(['low', 'default', 'high']).optional(),
            performance: z.enum(['speed', 'quality']).optional(),
        })
        .optional(),
    sessionId: z.string().optional(),
})

export async function generate(req: Request, res: Response, next: NextFunction) {
    try {
        const { question, context, sessionId } = generateSchema.parse(req.body)
        const ctx: ChatContext | undefined = (() => {
            if (!context) return undefined
            const out: any = {}
            if (typeof context.resume === 'string') out.resume = context.resume
            if (typeof context.jobDescription === 'string') out.jobDescription = context.jobDescription
            if (typeof context.additionalContext === 'string') out.additionalContext = context.additionalContext
            if (context.verbosity === 'concise' || context.verbosity === 'default' || context.verbosity === 'lengthy') out.verbosity = context.verbosity
            if (typeof context.language === 'string') out.language = context.language
            if (context.temperature === 'low' || context.temperature === 'default' || context.temperature === 'high') out.temperature = context.temperature
            if (context.performance === 'speed' || context.performance === 'quality') out.performance = context.performance
            return out
        })()
        if (sessionId) {
            const s = sessionCache.get(sessionId)
            if (s) {
                claudeService.setDefaultContext({
                    resume: s.resume,
                    jobDescription: s.jobDescription,
                    additionalContext: s.context,
                })
            }
        }
        const text = await claudeService.generateInterviewResponse(question, ctx)
        res.json({ ok: true, text })
    } catch (err) {
        next(err)
    }
}

const detectSchema = z.object({
    utterance: z.string().min(1),
    context: z
        .object({
            resume: z.string().optional(),
            jobDescription: z.string().optional(),
            additionalContext: z.string().optional(),
            verbosity: z.enum(['concise', 'default', 'lengthy']).optional(),
            language: z.string().optional(),
            temperature: z.enum(['low', 'default', 'high']).optional(),
            performance: z.enum(['speed', 'quality']).optional(),
        })
        .optional(),
    sessionId: z.string().optional(),
})

export async function detect(req: Request, res: Response, next: NextFunction) {
    try {
        const { utterance, context, sessionId } = detectSchema.parse(req.body)
        const ctx: ChatContext | undefined = (() => {
            if (!context) return undefined
            const out: any = {}
            if (typeof context.resume === 'string') out.resume = context.resume
            if (typeof context.jobDescription === 'string') out.jobDescription = context.jobDescription
            if (typeof context.additionalContext === 'string') out.additionalContext = context.additionalContext
            if (context.verbosity === 'concise' || context.verbosity === 'default' || context.verbosity === 'lengthy') out.verbosity = context.verbosity
            if (typeof context.language === 'string') out.language = context.language
            if (context.temperature === 'low' || context.temperature === 'default' || context.temperature === 'high') out.temperature = context.temperature
            if (context.performance === 'speed' || context.performance === 'quality') out.performance = context.performance
            return out
        })()
        if (sessionId) {
            const s = sessionCache.get(sessionId)
            if (s) {
                claudeService.setDefaultContext({
                    resume: s.resume,
                    jobDescription: s.jobDescription,
                    additionalContext: s.context,
                })
            }
        }
        const result = await claudeService.detectQuestionAndAnswer(utterance, ctx)
        res.json({ ok: true, ...result })
    } catch (err) {
        next(err)
    }
}

const jobDescSchema = z.object({
    jobTitle: z.string().min(1),
    industry: z.string().optional(),
    companyName: z.string().optional(),
    companySize: z.string().optional(),
    experienceLevel: z.string().optional(),
    keySkills: z.array(z.string()).optional(),
})

export async function jobDescription(req: Request, res: Response, next: NextFunction) {
    try {
        const params = jobDescSchema.parse(req.body)
        // Reuse OpenAI implementation parity through Claude equivalent prompt
        const text = await claudeService.generateInterviewResponse(
            `Create a detailed job description.\n\n${JSON.stringify(params)}`,
        )
        res.json({ ok: true, text })
    } catch (err) {
        next(err)
    }
}

export async function transcribe(_req: ExpressRequest, res: Response) {
    // Claude does not provide transcription. Keep endpoint for API compatibility.
    res.status(501).json({ ok: false, error: 'Transcription not supported by Claude' })
}


