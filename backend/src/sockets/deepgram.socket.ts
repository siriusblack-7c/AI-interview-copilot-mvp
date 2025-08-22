import type { Server, Socket } from 'socket.io'
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { openaiService } from '../services/openai.service'
import { chatMemory } from './chatMemory'
import { randomUUID } from 'node:crypto'

type DeepgramSession = {
    live: LiveClient
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
            try { socket.emit('deepgram:open') } catch { }
        })

        live.on(LiveTranscriptionEvents.Transcript, async (evt: any) => {
            try {
                const alternative = evt?.channel?.alternatives?.[0]
                const text: string = alternative?.transcript || ''
                const isFinal: boolean = !!evt?.is_final

                if (!text) {
                    logger.warn({ socketId: socket.id, event: evt }, 'Empty transcript received from Deepgram')
                    return
                }

                socket.emit('deepgram:transcript', { text, isFinal })
                if (!isFinal) return

                try {
                    // Record interviewer utterance as part of chat memory
                    chatMemory.appendInterviewer(socket.id, text)
                    const detection = await openaiService.detectQuestionAndAnswer(text)
                    if (detection.isQuestion && detection.question) {
                        const id = randomUUID()
                        socket.emit('detect:question', { id, question: detection.question, source: 'speech' })
                    }
                    // Emit proactive suggestions from final segment
                    try {
                        const suggestions = await openaiService.suggestNextQuestionsFromUtterance(text)
                        if (suggestions.length) {
                            socket.emit('openai:chat:suggestions', suggestions)
                        }
                    } catch { }
                } catch (err: any) {
                    logger.warn({ err }, 'openai detect failed for deepgram transcript')
                }
            } catch (err) {
                logger.error({ err }, 'deepgram transcript handler error')
            }
        })

        live.on(LiveTranscriptionEvents.Error, (err: any) => {
            logger.error({ err, socketId: socket.id }, 'Deepgram error')
            try { socket.emit('deepgram:error', { message: err?.message || 'Deepgram error' }) } catch { }
        })

        live.on(LiveTranscriptionEvents.Close, () => {
            logger.info({ socketId: socket.id }, 'Deepgram session closed')
            try { socket.emit('deepgram:closed') } catch { }
            // No auto-reconnect here; lifecycle tied to socket
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
        })
    })
}


