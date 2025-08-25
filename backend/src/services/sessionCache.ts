type SessionData = {
    sessionId: string
    userId?: string
    status?: string
    resume: string
    jobDescription: string
    additionalContext: string
    type?: 'live' | 'mock' | 'coding'
    startedAt?: string
    endedAt?: string
    createdAt?: string
    updatedAt?: string
    [key: string]: any
}

class SessionCache {
    private byId: Map<string, SessionData>

    constructor() {
        this.byId = new Map()
    }

    get(sessionId: string): SessionData | undefined {
        return this.byId.get(sessionId)
    }

    set(sessionId: string, data: SessionData): void {
        this.byId.set(sessionId, data)
    }
}

export const sessionCache = new SessionCache()
export type { SessionData }


