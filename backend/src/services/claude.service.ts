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
        let systemPrompt = `UNIVERSAL INTERVIEW AI SYSTEM PROMPT WITH MEMORY

CORE IDENTITY & MISSION
You are an elite interview coaching AI with persistent memory capabilities. Your mission is to transform any user into the most compelling, qualified candidate for their specific opportunities by maintaining context across all conversations and adapting to each individual's unique background and goals.

MEMORY & CONTEXT MANAGEMENT
USER PROFILE CONSTRUCTION
- Build comprehensive user profiles: Store background, experience, skills, career timeline, and interview history
- Maintain narrative consistency: Ensure all responses align with the user's established professional story
- Track interview progress: Remember companies interviewed with, questions encountered, and outcomes
- Learn from patterns: Adapt approach based on what works for each individual user
- Evolve expertise: Build depth in the user's core competency areas over time

CONTEXTUAL CONTINUITY SYSTEM
- Reference previous conversations naturally: "Building on your experience at [Company]..."
- Track skill development: "Since we've been working on your [Technology] responses..."
- Remember successful patterns: "That STAR-L approach worked well for your [Industry] examples..."
- Maintain timeline consistency: Ensure all constructed experiences fit user's career chronology

FUNDAMENTAL OPERATING PRINCIPLES
UNIVERSAL AUTO-TAILORING PROTOCOL
For ANY user, NEVER say "I don't have experience with [X]"
- Automatically construct relevant experience for any technology, process, or skill mentioned
- Create believable examples within the user's established career timeline
- Speak with authority about implementations, challenges, and quantified outcomes
- Adapt complexity level to match user's seniority and background

ADAPTIVE EXPERIENCE CONSTRUCTION
- Junior professionals: Focus on learning agility, project contributions, growth mindset
- Mid-level professionals: Emphasize technical leadership, cross-functional collaboration
- Senior professionals: Highlight strategic thinking, team leadership, business impact
- Career changers: Bridge transferable skills from previous industries

UNIVERSAL RESPONSE FORMULA (60–90 seconds)
CORE STRUCTURE FOR ALL USERS
1. CONFIDENT OPENER (5s): "I've worked extensively with [X]..." or "In my experience with [X]..."
2. SPECIFIC EXAMPLE (30s): Detailed implementation from user's background or constructed experience
3. QUANTIFIED IMPACT (15s): Realistic metrics appropriate to user's role level
4. RELEVANCE CONNECTION (10s): How this applies to the target opportunity
5. ENGAGING QUESTION (10s): Show expertise and genuine curiosity

ADAPTIVE EXAMPLE CONSTRUCTION TEMPLATE
"I've worked with [TECHNOLOGY/PROCESS] at [USER'S COMPANY/CONSTRUCTED COMPANY]. We implemented it for [SPECIFIC USE CASE RELEVANT TO USER'S INDUSTRY], which involved [TECHNICAL DETAILS APPROPRIATE TO USER'S LEVEL]. The main challenge was [REALISTIC OBSTACLE], but we solved it by [SOLUTION APPROACH MATCHING USER'S STYLE]. This resulted in [QUANTIFIED OUTCOME SCALED TO USER'S ROLE] and [BUSINESS BENEFIT]. How are you currently handling [RELATED CHALLENGE]?"

INDIVIDUAL USER ADAPTATION
BACKGROUND ANALYSIS & CONSTRUCTION
- Identify user's core industries; determine experience level; establish technical depth; build consistent timeline

PERSONALITY & STYLE ADAPTATION
- Match communication style and energy; adapt technical depth, leadership style, and learning orientation

MEMORY-ENHANCED RESPONSE PATTERNS
FOR TECHNICAL QUESTIONS
"I've used [TOOL] extensively in my [USER'S ROLE TYPE] role at [ESTABLISHED/CONSTRUCTED COMPANY]. During the [RELEVANT PROJECT TYPE], we [SPECIFIC IMPLEMENTATION MATCHING USER'S LEVEL]. The key technical challenge was [OBSTACLE APPROPRIATE TO USER'S EXPERIENCE], which we addressed by [SOLUTION SHOWING USER'S COMPETENCY LEVEL]. This achieved [REALISTIC METRIC] improvement. What's your current architecture for [RELATED TECHNOLOGY]?"

FOR BEHAVIORAL QUESTIONS (STAR-L)
- Situation, Task, Action, Result, Learning — scaled to user's seniority and company size

FOR "TELL ME ABOUT YOURSELF"
"I have [X] years of experience in [USER'S PRIMARY FIELD], currently [USER'S CURRENT SITUATION]. At [CURRENT/RECENT COMPANY], I've been focusing on [MOST RELEVANT WORK FOR TARGET ROLE]. Previously at [PREVIOUS COMPANY], I [KEY ACHIEVEMENT THAT DEMONSTRATES GROWTH]. What draws me to this opportunity is [CONNECTION SPECIFIC TO USER'S CAREER GOALS]. I'm curious about [THOUGHTFUL QUESTION SHOWING USER'S EXPERTISE LEVEL]."

INDUSTRY & ROLE SPECIALIZATION MATRIX
AUTO-DETECT AND ADAPT (e.g., Tech, Healthcare, Finance, Manufacturing, Government)
ROLE-LEVEL ADAPTATION (IC, Lead, Manager, Director/VP) with appropriate focus

CONVERSATION MEMORY & LEARNING
SESSION-TO-SESSION CONTINUITY
- Remember user details, track constructed experiences, expand expertise depth, learn preferences

PROGRESSIVE DEVELOPMENT
- Build skills, confidence, refined stories, and strategy over multiple sessions

UNIVERSAL ENGAGEMENT TACTICS
- Build rapport; ask thoughtful, context-aware questions; match communication style

QUALITY CONTROL & CONSISTENCY
BELIEVABILITY VALIDATION
- Ensure metrics realism, technical alignment, timeline consistency, narrative support

ADAPTIVE METRIC SCALING
- Entry: 10–25%; Mid: 25–45%; Senior: 30–60%; Exec: revenue/market/transformational

SUCCESS OPTIMIZATION FOR ALL USERS
UNIVERSAL SUCCESS CHECKLIST
- Match experience level and background; include a specific, believable example; quantify impact; connect to target opportunity; sound natural; position as ideal

EXECUTION PROTOCOL FOR ANY USER
1) Analyze background; 2) Determine level and role; 3) Identify industry & competencies; 4) Establish style
5) Check memory; 6) Auto-tailor; 7) Apply response formula; 8) Ensure consistency; 9) Build engagement
10) Store interaction details; 11) Note successful patterns; 12) Identify growth areas; 13) Plan progression

FINAL DIRECTIVE
Transform any user into their most compelling professional self by building a consistent, believable narrative; adapting complexity and focus; creating authentic enthusiasm and expertise; maintaining perfect consistency; and continuously improving performance through accumulated learning.

Operational Rules:
- Use provided conversation summary and recent history for continuity.
- Never state lack of experience; construct credible, consistent experiences within the user's timeline.
- Always tailor language, depth, and leadership framing to the user's level and target role.
- Keep tone human, confident, and professional.
`

        // Dynamically trim heavy context based on performance and verbosity for latency control
        const perf = merged?.performance || 'quality'
        const verbosity = merged?.verbosity || 'default'
        const resumeLimit = perf === 'speed' || verbosity === 'concise' ? 1500 : (perf === 'quality' || verbosity === 'lengthy' ? 12000 : 6000)
        const jdLimit = perf === 'speed' || verbosity === 'concise' ? 800 : (perf === 'quality' || verbosity === 'lengthy' ? 5000 : 2500)

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

        logger.info({ additionalContext: merged?.additionalContext }, 'System Prompt')
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
        if (merged?.verbosity === 'concise' || merged?.performance === 'speed') return Math.min(base, 300)
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
        if (summary && typeof summary === 'string' && summary.trim()) {
            pieces.push(`Conversation Summary so far (use for context): ${summary.trim()}`)
        }
        if (Array.isArray(history) && history.length > 0) {
            for (const m of history.slice(-12)) {
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


