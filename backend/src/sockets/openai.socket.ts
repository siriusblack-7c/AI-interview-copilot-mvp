import type { Server, Socket } from 'socket.io'
import { openaiService, type ChatContext } from '../services/openai.service'
import { randomUUID } from 'node:crypto'

export function registerOpenAISocket(io: Server) {
    io.on('connection', (socket: Socket) => {
        const sessionId = randomUUID()
        const history: { ts: number; type: 'them' | 'ai' | 'suggestions' | 'event'; text?: string; data?: any }[] = []
        const append = (entry: { ts?: number; type: 'them' | 'ai' | 'suggestions' | 'event'; text?: string; data?: any }) => {
            history.push({ ts: Date.now(), ...entry })
            try {
                const fs = require('node:fs')
                const path = require('node:path')
                const dir = path.join(process.cwd(), 'data')
                try { fs.mkdirSync(dir, { recursive: true }) } catch { }
                fs.writeFileSync(path.join(dir, `interview-${sessionId}.json`), JSON.stringify(history, null, 2))
            } catch { }
        }
        // Detection: FE sends an utterance, BE detects and proactively emits detected question
        socket.on('openai:detect:utterance', async (payload: { utterance: string; context?: ChatContext; source?: 'typed' | 'speech' }) => {
            try {
                const { utterance, context, source } = payload || ({} as any)
                if (!utterance) return
                append({ type: 'them', text: utterance })
                const result = await openaiService.detectQuestionAndAnswer(utterance, context)
                if (result.isQuestion && result.question) {
                    const detectedId = randomUUID()
                    socket.emit('detect:question', { id: detectedId, question: result.question, source: source || 'typed' })
                }
            } catch (err: any) {
                socket.emit('detect:error', { message: err?.message || 'detect error' })
            }
        })
        socket.on('openai:chat:start', async (payload: { detectedId?: string; question: string; context?: ChatContext }) => {
            try {
                const { question, context } = payload || ({} as any)
                // Lightweight suggestion strategy: ask model for top-3 variations immediately
                try {
                    const suggestions = await openaiService.suggestFollowUpQuestions(question, context)
                    if (suggestions.length) {
                        append({ type: 'suggestions', data: suggestions })
                        socket.emit('openai:chat:suggestions', suggestions)
                    }
                } catch { }
                for await (const delta of openaiService.streamChat(question, context)) {
                    append({ type: 'ai', text: delta })
                    socket.emit('openai:chat:delta', delta)
                }
                socket.emit('openai:chat:done')
            } catch (err: any) {
                socket.emit('openai:chat:error', { message: err?.message || 'stream error' })
            }
        })
    })
}


