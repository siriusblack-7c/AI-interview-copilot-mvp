import type { Server, Socket } from 'socket.io'
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { claudeService } from '../services/claude.service'
import { chatMemory } from './chatMemory'
import { randomUUID } from 'node:crypto'

type DeepgramSession = {
    live: LiveClient
}

type ReconnectState = {
    attempts: number
    timer: ReturnType<typeof setTimeout> | null
}

const reconnectState: Map<string, ReconnectState> = new Map()

function scheduleDeepgramReconnect(socket: Socket, sessions: Map<string, DeepgramSession>) {
    try {
        if (!socket.connected) return

        const state: ReconnectState = reconnectState.get(socket.id) || { attempts: 0, timer: null }
        if (state.timer) return

        state.attempts += 1
        const base = 1000
        const max = 10000
        const jitterPct = 0.25
        const expDelay = Math.min(base * Math.pow(2, state.attempts - 1), max)
        const jitter = 1 + (Math.random() * 2 - 1) * jitterPct // 0.75 - 1.25
        const delay = Math.floor(expDelay * jitter)

        logger.info({ socketId: socket.id, attempt: state.attempts, delay }, 'Scheduling Deepgram reconnect')

        state.timer = setTimeout(() => {
            state.timer = null
            try {
                if (!socket.connected) return
                const newSession = createDeepgramSession(socket, sessions)
                if (newSession) {
                    sessions.set(socket.id, newSession)
                    reconnectState.delete(socket.id)
                    logger.info({ socketId: socket.id }, 'Deepgram reconnected')
                } else {
                    // Retry again with increased backoff
                    reconnectState.set(socket.id, state)
                    scheduleDeepgramReconnect(socket, sessions)
                }
            } catch (err) {
                logger.error({ err, socketId: socket.id }, 'Deepgram reconnect attempt failed unexpectedly')
                reconnectState.set(socket.id, state)
                scheduleDeepgramReconnect(socket, sessions)
            }
        }, delay)

        reconnectState.set(socket.id, state)
    } catch (err) {
        logger.error({ err, socketId: socket.id }, 'Failed to schedule Deepgram reconnect')
    }
}

function coerceToArrayBuffer(data: unknown): ArrayBufferLike | null {
    try {
        if (!data) {
            logger.warn('Data is null or undefined')
            return null
        }

        if (Buffer.isBuffer(data)) {
            const buf = data as Buffer
            const result = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            return result
        }

        if (data instanceof ArrayBuffer) {
            return data
        }

        if (ArrayBuffer.isView(data as ArrayBufferView)) {
            const view = data as ArrayBufferView
            const result = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBufferLike
            return result
        }

        if (typeof data === 'string') {
            // assume base64 string
            logger.debug({ stringLength: data.length }, 'Converting base64 string to ArrayBuffer')
            const buf = Buffer.from(data, 'base64')
            const result = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            return result
        }

        logger.warn({ dataType: typeof data }, 'Unknown data type, cannot convert to ArrayBuffer')
        return null
    } catch (err) {
        logger.error({ err, dataType: typeof data }, 'Error coercing data to ArrayBuffer')
        return null
    }
}

function createDeepgramSession(socket: Socket, sessions: Map<string, DeepgramSession>): DeepgramSession | null {
    try {
        if (!env.DEEPGRAM_API_KEY) {
            socket.emit('deepgram:error', { message: 'Deepgram not configured' })
            return null
        }

        const dg = createClient(env.DEEPGRAM_API_KEY)
        const live: LiveClient = dg.listen.live({
            model: env.DEEPGRAM_MODEL,
            interim_results: true,
            punctuate: true,
            smart_format: true,
            endpointing: env.DEEPGRAM_ENDPOINTING,
        } as any)

        const session: DeepgramSession = { live }

        // Basic event wiring (no internal reconnection/keepalive/heartbeat logic)
        live.on(LiveTranscriptionEvents.Open, () => {
            logger.info({ socketId: socket.id }, 'Deepgram session opened')
            try { reconnectState.delete(socket.id) } catch { }
            try { socket.emit('deepgram:open') } catch { }
        })

        live.on(LiveTranscriptionEvents.Transcript, async (evt: any) => {
            try {
                const alternative = evt?.channel?.alternatives?.[0]
                const text: string = alternative?.transcript || ''
                const isFinal: boolean = !!evt?.is_final

                if (!text) {
                    logger.warn({ socketId: socket.id }, 'Empty transcript received from Deepgram')
                    return
                }

                socket.emit('deepgram:transcript', { text, isFinal })
                if (!isFinal) return

                try {
                    // Record interviewer utterance as part of chat memory
                    chatMemory.appendInterviewer(socket.id, text)
                    const detection = await claudeService.detectQuestionAndAnswer(text)
                    if (detection.isQuestion && detection.question) {
                        const id = randomUUID()
                        socket.emit('detect:question', { id, question: detection.question, source: 'speech' })
                    }
                    // Emit proactive suggestions from final segment
                    try {
                        const suggestions = await claudeService.suggestNextQuestionsFromUtterance(text)
                        if (suggestions.length) {
                            socket.emit('claude:chat:suggestions', suggestions)
                        }
                    } catch { }
                } catch (err: any) {
                    logger.warn({ err }, 'claude detect failed for deepgram transcript')
                }
            } catch (err) {
                logger.error({ err }, 'deepgram transcript handler error')
            }
        })

        live.on(LiveTranscriptionEvents.Error, (err: any) => {
            logger.error({ err, socketId: socket.id }, 'Deepgram error')
            try { socket.emit('deepgram:error', { message: err?.message || 'Deepgram error' }) } catch { }
            try { sessions.delete(socket.id) } catch { }
            scheduleDeepgramReconnect(socket, sessions)
        })

        live.on(LiveTranscriptionEvents.Close, () => {
            logger.info({ socketId: socket.id }, 'Deepgram session closed')
            try { socket.emit('deepgram:closed') } catch { }
            try { sessions.delete(socket.id) } catch { }
            if (socket.connected) {
                scheduleDeepgramReconnect(socket, sessions)
            }
        })

        return session
    } catch (err: any) {
        logger.error({ err, socketId: socket.id }, 'Failed to create Deepgram session')
        socket.emit('deepgram:error', { message: err?.message || 'failed to start deepgram' })
        return null
    }
}

export function registerDeepgramSocket(io: Server) {
    const sessions: Map<string, DeepgramSession> = new Map()

    io.on('connection', (socket: Socket) => {
        // Start Deepgram when socket connects
        const session = createDeepgramSession(socket, sessions)
        if (session) {
            sessions.set(socket.id, session)
        }

        // Handle incoming audio chunks
        socket.on('deepgram:audio', (chunk: unknown) => {
            const sess = sessions.get(socket.id)
            if (!sess) {
                logger.debug({ socketId: socket.id, hasSession: !!sess }, 'Ignoring audio chunk - no session')
                return
            }

            try {
                const ab = coerceToArrayBuffer(chunk)
                if (ab && ab.byteLength > 0) {
                    sess.live.send(ab)
                } else {
                    logger.warn({
                        socketId: socket.id,
                        chunkType: typeof chunk,
                        abExists: !!ab,
                        abByteLength: ab?.byteLength
                    }, 'Invalid audio chunk - empty or null')
                }
            } catch (err) {
                logger.error({ err, socketId: socket.id, chunkType: typeof chunk }, 'Failed to send audio chunk to Deepgram')
            }
        })

        // Handle disconnect - clean up session
        socket.on('disconnect', () => {
            const sess = sessions.get(socket.id)
            if (sess) {
                logger.info({ socketId: socket.id }, 'Socket disconnected, cleaning up Deepgram session')
                try { sess.live.finish?.() } catch (err) { logger.debug({ err }, 'Error finishing Deepgram session') }
                sessions.delete(socket.id)
            }
            const state = reconnectState.get(socket.id)
            if (state?.timer) {
                try { clearTimeout(state.timer) } catch { }
            }
            reconnectState.delete(socket.id)
        })
    })
}


