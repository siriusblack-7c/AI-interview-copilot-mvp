import OpenAI from 'openai'
import { Blob } from 'buffer'
import { env } from '../config/env'
import { logger } from '../utils/logger'

export type ChatContext = {
    resume?: string | undefined
    jobDescription?: string | undefined
    additionalContext?: string | undefined
    // User preferences coming from FE settings
    verbosity?: 'concise' | 'default' | 'lengthy'
    language?: string
    temperature?: 'low' | 'default' | 'high'
    performance?: 'speed' | 'quality'
}

export class OpenAIService {
    private client: OpenAI
    private model: string
    private maxTokens: number

    constructor() {
        if (!env.OPENAI_API_KEY) {
            logger.warn('OPENAI_API_KEY not set; OpenAI endpoints will fail until configured')
        }
        this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY || '' })
        this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
        this.maxTokens = Number(process.env.OPENAI_MAX_TOKENS || '1000')
    }

    private buildSystemPrompt(context?: ChatContext): string {
        let systemPrompt = `You are an intelligent interview assistant helping a user during a real job interview for any job in any industry.

Guidelines:
- ALWAYS answer as if the candidate has the required experience and skills — even if not listed in the resume.
- NEVER say “I haven’t worked with…”, “I don’t have experience with…”, or anything suggesting a lack of experience.
- ALWAYS answer confidently, using language like “Yes, I’ve worked with…” or “In my previous role…”.
- Provide responses that are simple, clear, and natural — avoid overly complex grammar or robotic phrasing.
- Use first-person language throughout (“I’ve done…”, “I was responsible for…”).
- When possible, structure answers with the STAR method (Situation, Task, Action, Result) — but deliver it in a natural, conversational flow without labeling it.
- Include real or realistic examples — ideally specific to the resume or plausible for the job type — and show depth by explaining what the user did and the outcome.
- Keep responses concise but meaningful.
- Keep reading style like linebreak for readability.
- Maintain a positive, professional tone — not too casual, but very human.
- DO NOT ask the interviewer any questions — just respond confidently.
- Be flexible and adapt to all industries (tech, healthcare, legal, finance, customer service, logistics, etc.).

This is a real-time job interview — respond with natural, confident, and detailed answers that help the candidate sound fully qualified and prepared, even if the experience isn't explicitly in their resume.`

        if (context?.resume) {
            const maxResumeLength = 50000
            systemPrompt += `\n\nCANDIDATE'S RESUME CONTEXT:\n${context.resume.substring(0, maxResumeLength)}${context.resume.length > maxResumeLength ? '...' : ''}\n\nInstructions: Use details from the resume whenever possible to ground the response in real experience. If the resume doesn’t mention the required skill, create a believable and relevant example that fits the candidate’s background and makes them sound fully experienced. Make the example specific and detailed — not generic.`
        } else {
            systemPrompt += `\n\nIMPORTANT: Since no resume was provided, assume the candidate has all relevant experience. Create detailed, confident, and realistic answers based on common experience in the relevant field. Make answers sound specific and grounded, even if made up.`
        }

        if (context?.jobDescription) {
            const maxJobDescLength = 30000
            systemPrompt += `\n\nTARGET JOB DESCRIPTION:\n${context.jobDescription.substring(0, maxJobDescLength)}${context.jobDescription.length > maxJobDescLength ? '...' : ''}\n\nInstructions: Tailor the response to align with the job description. Highlight specific experiences and skills that show the candidate is a strong match for the role. Emphasize results and impact.`
        } else {
            systemPrompt += `\n\nIMPORTANT: Since no specific job description was provided, adapt your response to show the candidate is qualified for typical responsibilities and expectations within the relevant industry or role. Keep examples focused and results-oriented.`
        }

        // Apply user preferences
        const verbosity = context?.verbosity || 'default'
        if (verbosity === 'concise') {
            systemPrompt += `\n\nStyle: Prefer brevity. Limit answers to 1–2 sentences that directly address the question.`
        } else if (verbosity === 'lengthy') {
            systemPrompt += `\n\nStyle: Provide more depth than usual. Aim for 4–6 sentences with concrete details and outcomes.`
        } else {
            systemPrompt += `\n\nStyle: Provide balanced answers with 2–4 sentences and at least one concrete example or outcome.`
        }

        if (context?.performance === 'speed') {
            systemPrompt += `\n\nPerformance Preference: Optimize for speed and brevity. Avoid unnecessary detail.`
        } else if (context?.performance === 'quality') {
            systemPrompt += `\n\nPerformance Preference: Optimize for completeness and clarity. Provide helpful, accurate detail.`
        }

        if (context?.language && typeof context.language === 'string') {
            systemPrompt += `\n\nLanguage: Respond in ${context.language}. Make phrasing natural for that locale/dialect.`
        }

        systemPrompt += `\n\nContext: This is a live interview where the candidate is being asked questions in real time. Your job is to help them sound confident, experienced, and ready — by delivering strong, natural, and specific answers that show what they did and the impact they made.`
        return systemPrompt
    }

    private computeTemperature(context?: ChatContext): number {
        const base = (() => {
            const pref = context?.temperature || 'default'
            if (pref === 'low') return 0.2
            if (pref === 'high') return 0.95
            return 0.7
        })()
        // Nudge for performance preference
        if (context?.performance === 'speed') return Math.max(0.1, base - 0.1)
        if (context?.performance === 'quality') return Math.min(1.0, base + 0.05)
        return base
    }

    private computeMaxTokens(context?: ChatContext): number {
        const base = this.maxTokens
        if (context?.verbosity === 'concise' || context?.performance === 'speed') return Math.min(base, 500)
        if (context?.verbosity === 'lengthy' || context?.performance === 'quality') return Math.min(Math.max(base, 800), base)
        return base
    }

    async generateInterviewResponse(question: string, context?: ChatContext): Promise<string> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const userPrompt = `Interview Question: "${question}"\n\nPlease provide a confident, natural, and professional interview response that shows the candidate is fully qualified. Use simple grammar and speak in a realistic tone. Make the example specific and believable, and if possible, include a result or outcome.`
        const resp = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: this.buildSystemPrompt(context) },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: this.computeMaxTokens(context),
            temperature: this.computeTemperature(context),
        })
        return resp.choices[0]?.message?.content?.trim() || ''
    }

    async detectQuestionAndAnswer(utterance: string, context?: ChatContext): Promise<{ isQuestion: boolean; question: string | null; answer: string | null }> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const system = `You analyze a short user utterance and decide if it is a question addressed to an interview assistant. If it is a question, answer it concisely (2-4 sentences) using any provided context. Respond ONLY as minified JSON with keys: isQuestion (boolean), question (string|null), answer (string|null). Do not include any extra text.`
        const resp = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify({ utterance, context: context || null, schema: { isQuestion: 'boolean', question: 'string|null', answer: 'string|null' } }) },
            ],
            response_format: { type: 'json_object' } as any,
            max_tokens: 800,
            temperature: 0.4,
        })
        let parsed: any = {}
        try {
            parsed = JSON.parse(resp.choices[0]?.message?.content?.trim() || '{}')
        } catch { parsed = {} }
        return {
            isQuestion: !!parsed.isQuestion,
            question: typeof parsed.question === 'string' ? parsed.question : null,
            answer: typeof parsed.answer === 'string' ? parsed.answer : null,
        }
    }

    private sanitizeQuestions(raw: string[]): string[] {
        const cleaned = raw
            .map((q) => (typeof q === 'string' ? q : ''))
            .map((q) => q.trim())
            // remove bullets/numbering and surrounding quotes
            .map((q) => q.replace(/^[-*\d.\)\s]+/, ''))
            .map((q) => q.replace(/^(["'“”‘’])+|(["'“”‘’])+$/g, ''))
            .filter(Boolean)
            // ensure ends with a question mark
            .map((q) => {
                const withoutTrailingPunct = q.replace(/[.!\s]+$/, '')
                return /\?$/.test(withoutTrailingPunct) ? withoutTrailingPunct : `${withoutTrailingPunct}?`
            })
        const seen = new Set<string>()
        const unique = cleaned.filter((q) => {
            const key = q.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
        return unique.slice(0, 3)
    }

    private async suggestQuestions(task: 'followup' | 'next', seed: string, context?: ChatContext): Promise<string[]> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const system = `You output EXACTLY three interview questions as minified JSON. Respond ONLY with: {"questions":["q1","q2","q3"]} and nothing else.
Rules:
- Each item must be a single, clear question ending with a question mark.
- No numbering, bullets, quotes, or extra commentary.
- Keep each question under 20 words.`
        const userPayload = {
            task,
            seed,
            context: context || null
        }
        const resp = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(userPayload) },
            ],
            response_format: { type: 'json_object' } as any,
            max_tokens: 400,
            temperature: 0.3,
        })
        const content = resp.choices[0]?.message?.content?.trim() || ''
        let questions: string[] = []
        try {
            const parsed = JSON.parse(content)
            const arr = Array.isArray(parsed?.questions) ? parsed.questions : []
            questions = this.sanitizeQuestions(arr)
        } catch {
            // Fallback: try splitting by lines if JSON somehow not returned
            const arr = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            questions = this.sanitizeQuestions(arr)
        }
        // Ensure exactly three by padding with sensible generic follow-ups if needed
        const fallbacks = [
            'Could you provide a specific example?',
            'What was the outcome or impact?',
            'How did you measure success?'
        ]
        for (const fb of fallbacks) {
            if (questions.length >= 3) break
            if (!questions.some((q) => q.toLowerCase() === fb.toLowerCase())) {
                questions.push(fb)
            }
        }
        return questions.slice(0, 3)
    }

    async suggestFollowUpQuestions(question: string, context?: ChatContext): Promise<string[]> {
        return this.suggestQuestions('followup', question, context)
    }

    async suggestNextQuestionsFromUtterance(utterance: string, context?: ChatContext): Promise<string[]> {
        return this.suggestQuestions('next', utterance, context)
    }

    async generateJobDescription(params: {
        jobTitle: string
        industry?: string | undefined
        companyName?: string | undefined
        companySize?: string | undefined
        experienceLevel?: string | undefined
        keySkills?: string[] | undefined
    }): Promise<string> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const { jobTitle, industry, companyName, companySize, experienceLevel, keySkills } = params
        const systemPrompt = `You are an expert HR professional and job description writer. Create a comprehensive, professional job description based on the provided information.

Guidelines:
- Write in a clear, professional tone
- Include all standard job description sections (Overview, Responsibilities, Requirements, Benefits)
- Make it realistic and detailed
- Use industry-standard terminology
- Include both required and preferred qualifications
- Add a competitive salary range when appropriate
- Include company culture and work environment details
- Make it engaging and attractive to candidates
- Keep it comprehensive but not overly lengthy (aim for 300-500 words)`
        let userPrompt = `Create a detailed job description for: ${jobTitle}`
        if (industry) userPrompt += `\nIndustry: ${industry}`
        if (companyName) userPrompt += `\nCompany Name: ${companyName}`
        if (experienceLevel) userPrompt += `\nExperience Level: ${experienceLevel}`
        if (keySkills && keySkills.length > 0) userPrompt += `\nKey Skills Required: ${keySkills.join(', ')}`
        userPrompt += `\n\nPlease provide a complete job description with the following structure:\n1. Job Title and Overview\n2. Key Responsibilities\n3. Required Qualifications\n4. Preferred Qualifications\n5. Benefits and Perks\n6. Company Culture/Work Environment`
        const resp = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 1500,
            temperature: 0.7,
        })
        return resp.choices[0]?.message?.content?.trim() || ''
    }

    async *streamChat(question: string, context?: ChatContext): AsyncGenerator<string> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const userPrompt = `Interview Question: "${question}"`
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: this.buildSystemPrompt(context) },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: this.computeMaxTokens(context),
            temperature: this.computeTemperature(context),
            stream: true,
        }) as any
        for await (const part of stream) {
            const delta = part?.choices?.[0]?.delta?.content
            if (delta) {
                yield delta as string
            }
        }
    }

    async transcribeAudioBuffer(fileBuffer: Buffer, mimeType: string): Promise<string> {
        if (!env.OPENAI_API_KEY) throw new Error('OpenAI not configured')
        const blob: any = new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' })
        const result: any = await (this.client as any).audio.transcriptions.create({
            file: blob,
            model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
        })
        const text: string = result?.text || result?.data?.text || ''
        return text
    }
}

export const openaiService = new OpenAIService()


