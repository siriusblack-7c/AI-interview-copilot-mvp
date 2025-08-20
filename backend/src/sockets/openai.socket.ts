import type { Server, Socket } from 'socket.io'
import { openaiService, type ChatContext } from '../services/openai.service'
import { randomUUID } from 'node:crypto'
import { chatMemory } from './chatMemory'
import { sessionCache } from '../services/sessionCache'

export function registerOpenAISocket(io: Server) {
    io.on('connection', (socket: Socket) => {
        let summary: string = ''

        const getHistory = () => chatMemory.getRecent(socket.id, 12)
        const getAllHistory = () => chatMemory.getAll(socket.id)

        const append = (entry: { ts?: number; type: 'them' | 'ai' | 'suggestions' | 'event'; text?: string; data?: any }) => {
            try {
                if (entry.type === 'them') {
                    chatMemory.appendUser(socket.id, entry.text)
                }
                // suggestions/events are not added to chat history
            } catch { /* ignore */ }
        }
        // Detection: FE sends an utterance, BE detects and proactively emits detected question
        socket.on('openai:detect:utterance', async (payload: { utterance: string; context?: ChatContext; source?: 'typed' | 'speech'; sessionId?: string }) => {
            try {
                const { utterance, context, source, sessionId } = payload || ({} as any)
                if (!utterance) return
                append({ type: 'them', text: utterance })
                if (sessionId) {
                    const s = sessionCache.get(sessionId)
                    if (s) {
                        openaiService.setDefaultContext({
                            resume: s.resume,
                            jobDescription: s.jobDescription,
                            additionalContext: s.context,
                        })
                    }
                }
                const result = await openaiService.detectQuestionAndAnswer(utterance, context)
                if (result.isQuestion && result.question) {
                    const detectedId = randomUUID()
                    socket.emit('detect:question', { id: detectedId, question: result.question, source: source || 'typed' })
                }
            } catch (err: any) {
                socket.emit('detect:error', { message: err?.message || 'detect error' })
            }
        })
        socket.on('openai:chat:start', async (payload: { detectedId?: string; question: string; context?: ChatContext; sessionId?: string }) => {
            try {
                const { question, context, sessionId } = payload || ({} as any)
                // Add the explicit question to history prior to answering
                chatMemory.appendUser(socket.id, question)
                if (sessionId) {
                    const s = sessionCache.get(sessionId)
                    if (s) {
                        openaiService.setDefaultContext({
                            resume: s.resume,
                            jobDescription: s.jobDescription,
                            additionalContext: s.context,
                        })
                    }
                }
                // Summarize older history when threshold reached
                try {
                    const SUMMARIZE_AFTER = 30
                    const RECENT_KEEP = 10
                    if (getAllHistory().length >= SUMMARIZE_AFTER) {
                        const newSummary = await openaiService.summarizeHistory(getAllHistory(), summary, context)
                        if (typeof newSummary === 'string' && newSummary.trim()) {
                            summary = newSummary.trim()
                            chatMemory.pruneRecent(socket.id, RECENT_KEEP)
                        }
                    }
                } catch { /* non-fatal */ }
                // Lightweight suggestion strategy: ask model for top-3 variations immediately
                try {
                    const suggestions = await openaiService.suggestFollowUpQuestions(question, context)
                    if (suggestions.length) {
                        append({ type: 'suggestions', data: suggestions })
                        socket.emit('openai:chat:suggestions', suggestions)
                    }
                } catch { }
                // Stream answer with recent chat history for short-term memory
                for await (const delta of openaiService.streamChat(question, context, getHistory(), summary)) {
                    // Only forward to client; do not store AI in memory
                    socket.emit('openai:chat:delta', delta)
                }
                // Persist the completed assistant message to history
                // Intentionally not stored: AI responses are not included in human dialogue memory
                socket.emit('openai:chat:done')
            } catch (err: any) {
                socket.emit('openai:chat:error', { message: err?.message || 'stream error' })
            }
        })
        socket.on('disconnect', () => {
            try { chatMemory.clear(socket.id) } catch { }
        })
    })
}


