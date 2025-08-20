import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
// const ResponseGenerator = lazy(() => import('./ResponseGenerator'));
const TextToSpeech = lazy(() => import('./TextToSpeech'));
const DocumentManager = lazy(() => import('./DocumentManager'));
import { useConversation } from '../hooks/useConversation';
import { useInterviewState } from '../context/InterviewStateContext';
import type { TextToSpeechRef } from '../types/speech';
const LiveTranscript = lazy(() => import('./LiveTranscript'));
import useDeepgramLive from '../hooks/useDeepgramLive';
import useTranscriptBuffer from '../hooks/useTranscriptBuffer';
import { getSocket } from '../services/backend';
import createAudioAttribution from '../utils/audioAttribution';
// import ConversationHistory from './ConversationHistory';
const ScreenSharePreview = lazy(() => import('./ScreenSharePreview'));
const InterviewCopilotPanel = lazy(() => import('./InterviewCopilotPanel'));


export default function InterviewDashboard() {
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [currentResponse, setCurrentResponse] = useState('');
    // Removed OpenAI configuration panel/state
    // Removed voice input panel; keep only muted state
    const [isMuted, setIsMuted] = useState(false);
    const [resumeText, setResumeText] = useState('');
    const [jobDescription, setJobDescription] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');

    const textToSpeechRef = useRef<TextToSpeechRef>(null);

    // Custom hooks
    const { addQuestion, addResponse, conversations, clearHistory } = useConversation();
    const { isSharing, systemStream } = useInterviewState();

    // Decouple system-audio transcription from mic listening: system stays active while sharing

    // If system audio sharing is active, mute TTS to avoid capturing our own AI response
    useEffect(() => {
        if (isSharing && textToSpeechRef.current) {
            textToSpeechRef.current.setMuted(true);
        }
    }, [isSharing]);

    // ScreenSharePreview binds its own video element using context

    // Live transcript buffered (dedup interim vs final)
    const { segments, upsertTranscript } = useTranscriptBuffer();
    // Track last 'them' finalized text to suppress duplicate 'me' lines when sharing
    const lastThemFinalRef = useRef<{ text: string; at: number } | null>(null);
    const lastResponseRef = useRef<string>('');
    const lastMicSnapshotRef = useRef<string | null>(null);
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    // Middleware for consistent speaker attribution
    const attribution = createAudioAttribution({
        isSystemActive: () => !!systemStream,
        systemBiasMs: 500,
        vadThreshold: 0.06,
    });

    // Single Deepgram live session for system/tab audio → 'them'
    useDeepgramLive({
        stream: systemStream || null,
        enabled: !!systemStream,
        onTranscript: ({ text, isFinal }) => {
            const { speaker } = attribution.classifySystem();
            upsertTranscript({ speaker, text, isFinal });
            if (isFinal) {
                lastThemFinalRef.current = { text: normalize(text), at: Date.now() };
                // Rely solely on server detection to avoid duplicates
            }
        },
    });

    // Use Web Speech API output for 'me' to avoid needing a second Deepgram session
    // Push microphone interim/final to live transcript for fast local display
    const seenDetectIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const socket = getSocket();
        const onDetected = (payload: { id: string; question: string; source: string }) => {
            try {
                const id = String(payload?.id || '');
                const q = String(payload?.question || '').trim();
                if (!id || !q) return;
                const seen = seenDetectIdsRef.current;
                if (seen.has(id)) return;
                seen.add(id);
                setCurrentQuestion(q);
                addQuestion(q);
            } catch { }
        };
        socket.on('detect:question', onDetected);
        return () => {
            try { socket.off('detect:question', onDetected) } catch { }
        };
    }, [addQuestion]);

    useEffect(() => {
        // Poll for mic interim/final updates since __micLive is a global and doesn't trigger re-renders
        const timer = window.setInterval(() => {
            try {
                const micLive = (window as any).__micLive as { text: string; isFinal: boolean } | undefined;
                if (!micLive || !micLive.text) return;
                const snapshot = JSON.stringify(micLive);
                if (snapshot === lastMicSnapshotRef.current) return;
                lastMicSnapshotRef.current = snapshot;
                const vad = (window as any).__micVAD as { rms?: number; ts?: number } | undefined;
                const { accept, speaker } = attribution.classifyMic({ isFinal: micLive.isFinal, rms: vad?.rms });
                if (!accept) return;
                // Additional dedupe against very recent them finals to avoid echo artifacts
                if (isSharing && micLive.isFinal && lastThemFinalRef.current) {
                    const nowTs = Date.now();
                    const withinWindow = nowTs - lastThemFinalRef.current.at < 6000;
                    const micNorm = normalize(micLive.text);
                    const themNorm = lastThemFinalRef.current.text;
                    const isDuplicate = withinWindow && (micNorm === themNorm || micNorm.includes(themNorm) || themNorm.includes(micNorm));
                    if (isDuplicate) return;
                }
                upsertTranscript({ speaker, text: micLive.text, isFinal: micLive.isFinal });
                if (micLive.isFinal) {
                    try {
                        const socket = getSocket();
                        socket.emit('openai:detect:utterance', {
                            utterance: micLive.text,
                            source: 'speech',
                            context: {
                                resume: resumeText || undefined,
                                jobDescription: jobDescription || undefined,
                                additionalContext: additionalContext || undefined,
                            },
                        });
                    } catch { }
                }
            } catch { }
        }, 100);
        return () => { try { window.clearInterval(timer); } catch { } };
    }, [isSharing, attribution, upsertTranscript, resumeText, jobDescription, additionalContext]);

    const handleResponseGenerated = useCallback((response: string) => {
        const trimmed = (response || '').trim();
        setCurrentResponse(trimmed);
        if (!trimmed) return;
        if (lastResponseRef.current === trimmed) return;
        lastResponseRef.current = trimmed;
        addResponse(trimmed);
    }, [addResponse]);

    const handleSpeechStateChange = useCallback((_playing: boolean, muted: boolean) => {
        setIsMuted(muted);
    }, []);

    const handleMuteToggle = useCallback((muted: boolean) => {
        setIsMuted(muted);
        // Update the TextToSpeech component's mute state
        if (textToSpeechRef.current) {
            textToSpeechRef.current.setMuted(muted);
        }
    }, []);

    // Voice input removed; retain stop control for TTS only
    // no external usage

    const handleResumeUpdate = useCallback((text: string) => {
        setResumeText(text);
    }, []);

    const handleJobDescriptionUpdate = useCallback((text: string) => {
        setJobDescription(text);
    }, []);

    const handleAdditionalContextUpdate = useCallback((text: string) => {
        setAdditionalContext(text);
    }, []);

    // Resizable split between left and right columns (desktop only)
    const containerRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef<boolean>(false);
    const [isDesktop, setIsDesktop] = useState<boolean>(() => {
        try { return window.matchMedia('(min-width: 1024px)').matches } catch { return false }
    });
    const [splitPercent, setSplitPercent] = useState<number>(() => {
        try {
            const v = Number(localStorage.getItem('layout:splitPercent'));
            if (Number.isFinite(v) && v > 20 && v < 80) return v;
        } catch { }
        return 50;
    });

    useEffect(() => {
        let mql: MediaQueryList | null = null;
        try {
            mql = window.matchMedia('(min-width: 1024px)');
            const onChange = () => setIsDesktop(mql ? mql.matches : false);
            onChange();
            mql.addEventListener('change', onChange);
            return () => { try { mql && mql.removeEventListener('change', onChange) } catch { } };
        } catch { return }
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const el = containerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = (x / rect.width) * 100;
            const clamped = Math.max(20, Math.min(80, pct));
            setSplitPercent(clamped);
        };
        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            try { document.body.style.userSelect = ''; } catch { }
            try { localStorage.setItem('layout:splitPercent', String(splitPercent)) } catch { }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [splitPercent]);

    const onDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        try { document.body.style.userSelect = 'none' } catch { }
        e.preventDefault();
    }, []);

    return (
        <div className="min-h-screen bg-[#1a1a1a] from-blue-50 via-white to-purple-50">
            {/* Main Content */}
            <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div ref={containerRef} className="flex flex-col lg:flex-row gap-8 lg:gap-0">
                    {/* Left Column */}
                    <div
                        className="space-y-6 pr-1 min-w-[350px] h-[calc(100vh-45px)] flex flex-col justify-between"
                        style={isDesktop ? { flex: `0 0 ${splitPercent}%` } : { width: '100%' }}
                    >
                        {/* Screen Share Preview (shown on top of voice input box while sharing) */}
                        <Suspense fallback={<div className="h-64 bg-[#2a2a2a] rounded-md animate-pulse" />}>
                            <ScreenSharePreview />
                        </Suspense>

                        {/* Voice input panel removed */}
                        {/* Live Transcript */}
                        <Suspense fallback={<div className="h-64 bg-[#2a2a2a] rounded-md animate-pulse" />}>
                            <LiveTranscript segments={segments} />
                        </Suspense>
                        {/* Hidden Text-to-Speech for automatic playback */}
                        <Suspense fallback={null}>
                            <TextToSpeech
                                ref={textToSpeechRef}
                                text={currentResponse}
                                autoPlay={true}
                                onStateChange={handleSpeechStateChange}
                            />
                        </Suspense>

                    </div>

                    {/* Drag Handle (desktop only) */}
                    {isDesktop && (
                        <div
                            className="hidden lg:block w-2 cursor-col-resize"
                            style={{ background: 'transparent' }}
                            onMouseDown={onDragStart}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize panels"
                        />
                    )}

                    {/* Right Column */}
                    <div
                        className="space-y-6 pl-1 h-[calc(100vh-45px)]"
                        style={isDesktop ? { flex: `1 1 ${100 - splitPercent}%` } : { width: '100%' }}
                    >
                        {/* Response Generator removed here to avoid duplicate; now rendered within InterviewCopilotPanel */}
                        {/* Copilot Panel: Conversation + Response Generator */}
                        <Suspense fallback={<div className="min-h-[420px] bg-[#2a2a2a] rounded-md animate-pulse" />}>
                            <InterviewCopilotPanel
                                conversations={conversations}
                                onClearHistory={clearHistory}
                                question={currentQuestion}
                                onResponseGenerated={handleResponseGenerated}
                                resumeText={resumeText}
                                jobDescription={jobDescription}
                                additionalContext={additionalContext}
                                onMuteToggle={handleMuteToggle}
                                isMuted={isMuted}
                                onManualQuestionSubmit={(q) => {
                                    // Immediately set as current question so ResponseGenerator streams it
                                    // Do NOT re-emit detection for typed question to avoid duplicate question entries
                                    setCurrentQuestion(q);
                                    addQuestion(q);
                                }}
                            />
                        </Suspense>
                        {/* OpenAI Configuration removed */}
                    </div>
                </div>
                {/* Document Manager */}
                <Suspense fallback={<div className="h-40 bg-[#2a2a2a] rounded-md animate-pulse mt-4 pt-4" />}>
                    <DocumentManager
                        onResumeUpdate={handleResumeUpdate}
                        onJobDescriptionUpdate={handleJobDescriptionUpdate}
                        onAdditionalContextUpdate={handleAdditionalContextUpdate}
                        resumeText={resumeText}
                        jobDescription={jobDescription}
                        additionalContext={additionalContext}
                    />
                </Suspense>
            </div>
        </div>
    );
}