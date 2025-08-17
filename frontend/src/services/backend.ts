import axios from 'axios'
import { io, type Socket } from 'socket.io-client'

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000'

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
})

let socket: Socket | null = null
let debugBound = false

export function getSocket(): Socket {
    if (socket && socket.connected) return socket
    if (!socket) {
        socket = io(API_BASE_URL, { withCredentials: true, autoConnect: true })
        if (!debugBound) {
            debugBound = true
            try {
                socket.on('connect', () => console.log('[socket] connected', socket?.id))
                socket.on('disconnect', (reason) => console.log('[socket] disconnected', reason))
                socket.on('connect_error', (err) => console.log('[socket] connect_error', err?.message || err))
            } catch { }
        }
    } else if (!socket.connected) {
        try { socket.connect() } catch { }
    }
    return socket
}

export function getApiBaseUrl(): string {
    return API_BASE_URL
}


