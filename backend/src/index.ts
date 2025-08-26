import 'dotenv/config'
import http from 'http'
import { AddressInfo } from 'net'
import { Server as IOServer } from 'socket.io'
import { createApp } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'
import { registerClaudeSocket } from './sockets/claude.socket'
import { registerDeepgramSocket } from './sockets/deepgram.socket'

const app = createApp()
const server = http.createServer(app)

const io = new IOServer(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true)

            // Allow specific origins for credentials mode
            const allowedOrigins = [
                'https://ai-interview-copilot-mvp-rt9v.vercel.app',
                'https://staging.robo-apply.com',
                'http://localhost:5174',
                'http://localhost:5173', // Vite dev server
                'http://localhost:3000', // Local backend
                'https://ai-interview-copilot-mvp.onrender.com', // Production backend
                // Add your frontend domain when you deploy it
            ]

            if (allowedOrigins.includes(origin)) {
                callback(null, origin)
            } else {
                callback(null, false)
            }
        },
        credentials: true
    },
})

io.on('connection', (socket: any) => {
    logger.info({ id: socket.id }, 'socket connected')
    socket.on('disconnect', (reason: any) => {
        logger.info({ id: socket.id, reason }, 'socket disconnected')
    })
})

registerDeepgramSocket(io)
registerClaudeSocket(io)

const listener = server.listen(env.PORT || 3000, () => {
    const { port } = listener.address() as AddressInfo
    logger.info({ port, env: env.NODE_ENV }, `HTTP server listening on :${port}`)
})

const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down')
    io.close(() => {
        server.close(() => {
            logger.info('closed')
            process.exit(0)
        })
    })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))


