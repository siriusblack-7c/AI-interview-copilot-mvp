import { env } from '../config/env'
import { logger } from '../utils/logger'

export type ChatContext = {
    resume?: string | undefined
    jobDescription?: string | undefined
    additionalContext?: string | undefined
    verbosity?: 'concise' | 'default' | 'lengthy'
    language?: string
    temperature?: 'low' | 'default' | 'high'
    performance?: 'speed' | 'quality'
}

export class ClaudeService {
    private client: any | null
    private model: string
    private maxTokens: number
    private defaultContext: ChatContext | undefined

    constructor() {
        if (!env.ANTHROPIC_API_KEY) {
            logger.warn('ANTHROPIC_API_KEY not set; Claude endpoints will fail until configured')
        }
        this.client = null
        this.model = env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
        this.maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || '1000')
    }

    private ensureClient(): any {
        if (this.client) return this.client
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Anthropic = require('@anthropic-ai/sdk')
            const Ctor = Anthropic.default || Anthropic
            this.client = new Ctor({ apiKey: env.ANTHROPIC_API_KEY || '' })
            return this.client
        } catch (err) {
            throw new Error('Claude SDK not installed. Please install @anthropic-ai/sdk')
        }
    }

    setDefaultContext(ctx: { resume?: string; jobDescription?: string; additionalContext?: string }): void {
        this.defaultContext = {
            resume: typeof ctx.resume === 'string' ? ctx.resume : '',
            jobDescription: typeof ctx.jobDescription === 'string' ? ctx.jobDescription : '',
            additionalContext: typeof ctx.additionalContext === 'string' ? ctx.additionalContext : '',
        }
    }

    private mergeContext(context?: ChatContext): ChatContext | undefined {
        if (!this.defaultContext && !context) return undefined
        return {
            ...(this.defaultContext || {}),
            ...(context || {}),
        }
    }

    private buildSystemPrompt(context?: ChatContext): string {
        const merged = this.mergeContext(context)
        let systemPrompt = `You are an elite interview coaching AI with memory.
Your mission: turn any user into the most compelling candidate by remembering their background, building consistent narratives, and adapting over time.

---Core Rules

* Never say “I don’t have experience.” Always construct credible, role-appropriate examples.
* Maintain consistency: career timeline, skills, industries, and past answers must align.
* Tailor depth: junior → learning/growth, mid → technical leadership, senior → strategy/business impact, exec → transformation/revenue.
* Quantify impact realistically:

  * Junior: +10–25%
  * Mid: +25–45%
  * Senior: +30–60%
  * Exec: business/market outcomes

---Answer Formula (60–90s)

1. Confident opener: “I’ve worked with \[X]…”
2. Specific example: from real or constructed background.
3. Quantified result: realistic metrics.
4. Relevance: connect to target role.
5. Engaging question: show curiosity.

---Question Handling

* Technical: Tool → Implementation → Challenge → Solution → Result → Follow-up Q.
* Behavioral (STAR-L): Situation, Task, Action, Result, Learning.
* Tell Me About Yourself: Experience → Key achievements → Fit for role → Thoughtful Q.

---Memory & Adaptation

* Store user’s skills, companies, career path.
* Recall past interview questions and answers.
* Reuse successful patterns.
* Refine stories and style over sessions.

---Final Directive

Always provide believable, confident, role-appropriate answers with metrics, consistency, and engagement — transforming the user into the ideal interview candidate. You needs to sound natural and human like you talking to a friend

`

        // Dynamically trim heavy context based on performance and verbosity for latency control
        const perf = merged?.performance || 'quality'
        const verbosity = merged?.verbosity || 'default'
        const resumeLimit = perf === 'speed' || verbosity === 'concise' ? 800 : (perf === 'quality' || verbosity === 'lengthy' ? 12000 : 6000)
        const jdLimit = perf === 'speed' || verbosity === 'concise' ? 400 : (perf === 'quality' || verbosity === 'lengthy' ? 5000 : 2500)

        if (merged?.resume) {
            const maxResumeLength = resumeLimit
            systemPrompt += `\n\nCANDIDATE'S RESUME CONTEXT:\n${merged.resume.substring(0, maxResumeLength)}${merged.resume.length > maxResumeLength ? '...' : ''}\n\nInstructions: Use details from the resume whenever possible to ground the response in real experience. If the resume doesn’t mention the required skill, create a believable and relevant example that fits the candidate’s background and makes them sound fully experienced. Make the example specific and detailed — not generic.`
        } else {
            systemPrompt += `\n\nIMPORTANT: Since no resume was provided, assume the candidate has all relevant experience. Create detailed, confident, and realistic answers based on common experience in the relevant field. Make answers sound specific and grounded, even if made up.`
        }

        if (merged?.jobDescription) {
            const maxJobDescLength = jdLimit
            systemPrompt += `\n\nTARGET JOB DESCRIPTION:\n${merged.jobDescription.substring(0, maxJobDescLength)}${merged.jobDescription.length > maxJobDescLength ? '...' : ''}\n\nInstructions: Tailor the response to align with the job description. Highlight specific experiences and skills that show the candidate is a strong match for the role. Emphasize results and impact.`
        } else {
            systemPrompt += `\n\nIMPORTANT: Since no specific job description was provided, adapt your response to show the candidate is qualified for typical responsibilities and expectations within the relevant industry or role. Keep examples focused and results-oriented.`
        }

        if (verbosity === 'concise') {
            systemPrompt += `\n\nStyle: Prefer brevity. Strictly limit the final answer to 1–2 complete sentences that directly address the question. Do not add extra explanation.`
        } else if (verbosity === 'lengthy') {
            systemPrompt += `\n\nStyle: Provide more depth than usual. Aim for 4–6 sentences with concrete details and outcomes.`
        } else {
            systemPrompt += `\n\nStyle: Provide balanced answers with 2–4 sentences and at least one concrete example or outcome.`
        }

        if (merged?.performance === 'speed') {
            systemPrompt += `\n\nPerformance Preference: Optimize for speed and brevity. Avoid unnecessary detail.`
        } else if (merged?.performance === 'quality') {
            systemPrompt += `\n\nPerformance Preference: Optimize for completeness and clarity. Provide helpful, accurate detail.`
        }

        if (merged?.language && typeof merged.language === 'string') {
            systemPrompt += `\n\nLanguage: Respond in ${merged.language}. Make phrasing natural for that locale/dialect.`
        }

        if (merged?.additionalContext && typeof merged.additionalContext === 'string') {
            systemPrompt += `\n\nAdditional Context: ${merged.additionalContext} (This is important.)`
        }

        try { logger.debug({ hasAdditionalContext: !!merged?.additionalContext }, 'Built system prompt') } catch { }
        return systemPrompt
    }

    private computeTemperature(context?: ChatContext): number {
        const merged = this.mergeContext(context)
        const pref = merged?.temperature || 'default'
        if (pref === 'low') return 0.2
        if (pref === 'high') return 0.95
        return 0.7
    }

    private computeMaxTokens(context?: ChatContext): number {
        const merged = this.mergeContext(context)
        const base = this.maxTokens
        if (merged?.verbosity === 'concise' || merged?.performance === 'speed') return Math.min(base, 180)
        if (merged?.verbosity === 'lengthy' || merged?.performance === 'quality') return Math.min(Math.max(base, 1000), base)
        return base
    }

    private computeTopP(context?: ChatContext): number {
        const merged = this.mergeContext(context)
        if (merged?.performance === 'speed') return 0.6
        if (merged?.performance === 'quality') return 0.95
        return 0.8
    }

    async generateInterviewResponse(question: string, context?: ChatContext): Promise<string> {
        if (!env.ANTHROPIC_API_KEY) throw new Error('Claude not configured')
        const merged = this.mergeContext(context)
        const userPrompt = `Interview Question: "${question}"\n\nPlease provide a confident, natural, and professional interview response that shows the candidate is fully qualified. Use simple grammar and speak in a realistic tone. Make the example specific and believable, and if possible, include a result or outcome. If the style is concise, strictly respond with 1–2 sentences, and if the style is lengthy, respond with 4–6 sentences. You have to follow the rules and style, performance preference, additional context, resume, job description, language, and rules.`
        const client = this.ensureClient()
        const resp = await client.messages.create({
            model: this.model,
            max_tokens: this.computeMaxTokens(merged),
            temperature: this.computeTemperature(merged),
            top_p: this.computeTopP(merged) as any,
            system: this.buildSystemPrompt(merged),
            messages: [
                { role: 'user', content: userPrompt },
            ],
        }) as any
        const content = resp?.content?.map((c: any) => c?.text || '').join('') || ''
        return content.trim()
    }

    async detectQuestionAndAnswer(utterance: string, context?: ChatContext): Promise<{ isQuestion: boolean; question: string | null; answer: string | null }> {
        if (!env.ANTHROPIC_API_KEY) throw new Error('Claude not configured')
        const merged = this.mergeContext(context)
        const system = `You analyze a short user utterance and decide if it is a question addressed to an interview assistant. If it is a question, answer it concisely (2-4 sentences) using any provided context. Respond ONLY as minified JSON with keys: isQuestion (boolean), question (string|null), answer (string|null). Do not include any extra text.`
        const payload = {
            utterance,
            context: merged || null,
            schema: { isQuestion: 'boolean', question: 'string|null', answer: 'string|null' }
        }
        const client = this.ensureClient()
        const resp = await client.messages.create({
            model: this.model,
            max_tokens: 800,
            temperature: 0.4,
            top_p: 0.6 as any,
            system,
            messages: [
                { role: 'user', content: JSON.stringify(payload) },
            ],
        }) as any
        let parsed: any = {}
        try {
            const text = resp?.content?.map((c: any) => c?.text || '').join('') || ''
            parsed = JSON.parse(text.trim() || '{}')
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
            .map((q) => q.replace(/^[-*\d.\)\s]+/, ''))
            .map((q) => q.replace(/^( ["'“”‘’])+|(["'“”‘’])+$/g, ''))
            .filter(Boolean)
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
        if (!env.ANTHROPIC_API_KEY) throw new Error('Claude not configured')
        const merged = this.mergeContext(context)
        let system = `You output EXACTLY three interview questions as minified JSON. Respond ONLY with: {"questions":["q1","q2","q3"]} and nothing else.
Rules:
- Each item must be a single, clear question ending with a question mark.
- No numbering, bullets, quotes, or extra commentary.
- Keep each question under 20 words.`
        if (merged?.language && typeof merged.language === 'string') {
            system += `\n- All questions must be written in ${merged.language}.`
        }
        const userPayload = { task, seed, context: merged || null }
        const client = this.ensureClient()
        const resp = await client.messages.create({
            model: this.model,
            max_tokens: 400,
            temperature: 0.3,
            top_p: 0.7 as any,
            system,
            messages: [
                { role: 'user', content: JSON.stringify(userPayload) },
            ],
        }) as any
        const content = (resp?.content?.map((c: any) => c?.text || '').join('') || '').trim()
        let questions: string[] = []
        try {
            const parsed = JSON.parse(content)
            const arr = Array.isArray(parsed?.questions) ? parsed.questions : []
            questions = this.sanitizeQuestions(arr)
        } catch {
            const arr = content.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
            questions = this.sanitizeQuestions(arr)
        }
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

    async *streamChat(
        question: string,
        context?: ChatContext,
        history?: { role: 'user' | 'interviewer'; content: string }[],
        summary?: string,
    ): AsyncGenerator<string> {
        if (!env.ANTHROPIC_API_KEY) throw new Error('Claude not configured')
        const merged = this.mergeContext(context)
        const userPrompt = `Interview Question: "${question}"`
        const pieces: string[] = []
        pieces.push(this.buildSystemPrompt(merged))
        const perf = merged?.performance || 'quality'
        if (perf !== 'speed' && summary && typeof summary === 'string' && summary.trim()) {
            pieces.push(`Conversation Summary so far (use for context): ${summary.trim()}`)
        }
        if (Array.isArray(history) && history.length > 0) {
            const limit = perf === 'speed' ? 4 : 12
            for (const m of history.slice(-limit)) {
                const prefix = m.role === 'interviewer' ? 'Interviewer' : 'User'
                pieces.push(`${prefix}: ${m.content}`)
            }
        }
        const preamble = pieces.join('\n')
        const client = this.ensureClient()
        const stream = await (client.messages.stream as any)({
            model: this.model,
            max_tokens: this.computeMaxTokens(merged),
            temperature: this.computeTemperature(merged),
            top_p: this.computeTopP(merged) as any,
            system: preamble,
            messages: [
                { role: 'user', content: userPrompt },
            ],
        })
        for await (const event of stream) {
            try {
                const type = (event as any)?.type
                if (type === 'content_block_delta') {
                    const delta = (event as any)?.delta?.text
                    if (delta) yield String(delta)
                }
            } catch { }
        }
    }
}

export const claudeService = new ClaudeService()


