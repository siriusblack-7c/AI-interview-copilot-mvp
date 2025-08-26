import type { Server, Socket } from 'socket.io'
import { claudeService, type ChatContext } from '../services/claude.service'
import { randomUUID } from 'node:crypto'
import { chatMemory } from './chatMemory'
import { sessionCache } from '../services/sessionCache'

export function registerClaudeSocket(io: Server) {
    io.on('connection', (socket: Socket) => {
        let summary: string = ''

        const getHistory = () => chatMemory.getRecent(socket.id, 12)
        const getAllHistory = () => chatMemory.getAll(socket.id)

        const append = (entry: { ts?: number; type: 'them' | 'ai' | 'suggestions' | 'event'; text?: string; data?: any }) => {
            try {
                if (entry.type === 'them') {
                    chatMemory.appendUser(socket.id, entry.text)
                }
            } catch { }
        }

        socket.on('claude:detect:utterance', async (payload: { utterance: string; context?: ChatContext; source?: 'typed' | 'speech'; sessionId?: string }) => {
            try {
                const { utterance, context, source, sessionId } = payload || ({} as any)
                if (!utterance) return
                append({ type: 'them', text: utterance })
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
                const result = await claudeService.detectQuestionAndAnswer(utterance, context)
                if (result.isQuestion && result.question) {
                    const detectedId = randomUUID()
                    socket.emit('detect:question', { id: detectedId, question: result.question, source: source || 'typed' })
                }
            } catch (err: any) {
                socket.emit('detect:error', { message: err?.message || 'detect error' })
            }
        })

        socket.on('claude:chat:start', async (payload: { detectedId?: string; question: string; context?: ChatContext; sessionId?: string }) => {
            try {
                const { question, context, sessionId } = payload || ({} as any)
                chatMemory.appendUser(socket.id, question)
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
                // kick off summarize + suggestions concurrently while immediately starting stream
                ; (async () => {
                    try {
                        const SUMMARIZE_AFTER = 30
                        const RECENT_KEEP = 10
                        if (getAllHistory().length >= SUMMARIZE_AFTER) {
                            const newSummary = await claudeService.generateInterviewResponse(
                                `Summarize the conversation so far in <=1800 characters as compact bullet-like sentences without bullets.\nPrev:\n${summary}\n\nTranscript:\n${getAllHistory().map(h => `${h.role === 'interviewer' ? 'Interviewer' : 'User'}: ${h.content}`).join('\n')}`,
                                context
                            )
                            if (typeof newSummary === 'string' && newSummary.trim()) {
                                summary = newSummary.trim()
                                chatMemory.pruneRecent(socket.id, RECENT_KEEP)
                            }
                        }
                    } catch { }
                })()

                    ; (async () => {
                        try {
                            const suggestions = await claudeService.suggestFollowUpQuestions(question, context)
                            if (suggestions.length) {
                                append({ type: 'suggestions', data: suggestions })
                                socket.emit('claude:chat:suggestions', suggestions)
                            }
                        } catch { }
                    })()

                for await (const delta of claudeService.streamChat(question, context, getHistory(), summary)) {
                    socket.emit('claude:chat:delta', delta)
                }
                socket.emit('claude:chat:done')
            } catch (err: any) {
                socket.emit('claude:chat:error', { message: err?.message || 'stream error' })
            }
        })

        socket.on('disconnect', () => {
            try { chatMemory.clear(socket.id) } catch { }
        })
    })
}


