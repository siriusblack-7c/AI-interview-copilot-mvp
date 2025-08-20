export type ChatRole = 'user' | 'interviewer'
export interface ChatMessage { role: ChatRole; content: string }

type MemoryRecord = {
    history: ChatMessage[]
    summary: string
}

const store: Map<string, MemoryRecord> = new Map()

const ensure = (socketId: string): MemoryRecord => {
    let rec = store.get(socketId)
    if (!rec) {
        rec = { history: [], summary: '' }
        store.set(socketId, rec)
    }
    return rec
}

export const chatMemory = {
    appendUser(socketId: string, text?: string) {
        const t = String(text || '').trim()
        if (!t) return
        const rec = ensure(socketId)
        const last = rec.history[rec.history.length - 1]
        if (last && last.role === 'user' && last.content === t) return
        rec.history.push({ role: 'user', content: t })
        // Hard cap to avoid unbounded growth; summarization will keep it useful
        if (rec.history.length > 1000) rec.history = rec.history.slice(-1000)
    },
    appendInterviewer(socketId: string, text?: string) {
        const t = String(text || '').trim()
        if (!t) return
        const rec = ensure(socketId)
        const last = rec.history[rec.history.length - 1]
        if (last && last.role === 'interviewer' && last.content === t) return
        rec.history.push({ role: 'interviewer', content: t })
        if (rec.history.length > 1000) rec.history = rec.history.slice(-1000)
    },
    getRecent(socketId: string, n: number = 12): ChatMessage[] {
        const rec = ensure(socketId)
        return rec.history.slice(-n)
    },
    getAll(socketId: string): ChatMessage[] {
        const rec = ensure(socketId)
        return rec.history.slice()
    },
    pruneRecent(socketId: string, keep: number) {
        const rec = ensure(socketId)
        if (keep <= 0) { rec.history = []; return }
        if (rec.history.length > keep) rec.history = rec.history.slice(-keep)
    },
    getSummary(socketId: string): string {
        const rec = ensure(socketId)
        return rec.summary
    },
    setSummary(socketId: string, s?: string) {
        const rec = ensure(socketId)
        rec.summary = String(s || '').trim()
    },
    clear(socketId: string) {
        store.delete(socketId)
    },
}

export default chatMemory


