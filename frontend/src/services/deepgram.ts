import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export type DeepgramTranscript = {
    text: string
    isFinal: boolean
}

class DeepgramService {
    private apiKey: string
    constructor() {
        const envKey = (import.meta as any).env?.VITE_DEEPGRAM_API_KEY || ''
        const stored = typeof window !== 'undefined' ? localStorage.getItem('deepgram_api_key') || '' : ''
        this.apiKey = stored || envKey || ''
    }

    isConfigured(): boolean {
        return !!this.apiKey && this.apiKey !== 'your_deepgram_api_key_here'
    }

    updateApiKey(key: string) {
        this.apiKey = key
        if (typeof window !== 'undefined') localStorage.setItem('deepgram_api_key', key)
    }

    /**
     * Start a Deepgram live transcription session and stream a MediaStream to it via MediaRecorder.
     * Returns a cleanup function that closes the session and stops the recorder.
     */
    startLiveFromStream(
        stream: MediaStream,
        {
            model = 'nova-3',
            interim_results = true,
            smart_format = true,
            punctuate = true,
            language = 'en-US',
            timesliceMs = 250,
            onTranscript,
            onError,
        }: {
            model?: string
            interim_results?: boolean
            smart_format?: boolean
            punctuate?: boolean
            language?: string
            timesliceMs?: number
            onTranscript: (t: DeepgramTranscript) => void
            onError?: (err: any) => void
        }
    ): () => void {
        if (!this.isConfigured()) throw new Error('Deepgram API key not configured')

        const dg = createClient(this.apiKey)
        const live: LiveClient = dg.listen.live({
            model,
            interim_results,
            smart_format,
            punctuate,
            language,
            endpointing: 500,
        } as any)

        let recorder: MediaRecorder | null = null
        let isOpen = false
        let keepAliveTimer: number | null = null

        const closeAll = () => {
            try {
                if (recorder && recorder.state !== 'inactive') recorder.stop()
            } catch { }
            try { if (isOpen) (live as any).finish?.() } catch { }
        }

        live.on(LiveTranscriptionEvents.Open, () => {
            isOpen = true
            // Keep-alive to prevent idle timeout during silence
            try {
                keepAliveTimer = window.setInterval(() => {
                    try { (live as any).send?.(JSON.stringify({ type: 'KeepAlive' })) } catch { }
                }, 5000) as unknown as number
            } catch { }
            const mimeCandidates = [
                // For display media, some Chromium builds require video mimeTypes
                'video/webm;codecs=vp8,opus',
                'video/webm',
                // Audio-only fallbacks
                'audio/webm;codecs=opus',
                'audio/webm',
            ]
            const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m))
            try {
                recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
            } catch {
                recorder = new MediaRecorder(stream)
            }
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    try {
                        live.send(e.data)
                        console.log(`${e.data.size}`)
                    } catch { }
                }
            }
            try {
                recorder.start(timesliceMs)
            } catch {
                try { recorder.start(250) } catch { }
            }
        })

        live.on(LiveTranscriptionEvents.Transcript, (evt: any) => {
            try {
                const alt = evt?.channel?.alternatives?.[0]
                const text = alt?.transcript || ''
                if (!text) return
                const isFinal = !!evt?.is_final
                console.log(text, isFinal)
                onTranscript({ text, isFinal })
            } catch (err) {
                console.error('❌ Transcript parsing error:', err)
            }
        })

        live.on(LiveTranscriptionEvents.Error, (err: any) => {
            onError?.(err)
        })

        live.on(LiveTranscriptionEvents.Close, () => {
            isOpen = false
            try {
                if (recorder && recorder.state !== 'inactive') recorder.stop()
            } catch { }
            if (keepAliveTimer !== null) {
                try { window.clearInterval(keepAliveTimer) } catch { }
                keepAliveTimer = null
            }
        })

        return closeAll
    }
}

export const deepgramService = new DeepgramService()
export default deepgramService