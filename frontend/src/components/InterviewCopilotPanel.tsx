import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Mic, MicOff } from 'lucide-react'
import { useInterviewState } from '../context/InterviewStateContext'
import ResponseGenerator from './ResponseGenerator'
import type { ConversationItem } from '../hooks/useConversation'

interface PanelProps {
    conversations: ConversationItem[]
    onClearHistory: () => void
    // Response generator props passthrough
    question: string
    onResponseGenerated: (response: string) => void
    resumeText?: string
    jobDescription?: string
    additionalContext?: string
    sessionId?: string
    onMuteToggle?: (muted: boolean) => void
    isMuted?: boolean
    onManualQuestionSubmit?: (q: string) => void
    sessionType: 'live' | 'mock'
    setSessionType: (type: 'live' | 'mock') => void
}

export default function InterviewCopilotPanel({
    conversations,
    onClearHistory,
    question,
    onResponseGenerated,
    resumeText,
    jobDescription,
    additionalContext,
    sessionId,
    onMuteToggle,
    isMuted,
    onManualQuestionSubmit,
    sessionType,
    setSessionType,
}: PanelProps) {
    const { isGenerating } = useInterviewState()
    const [autoScroll, setAutoScroll] = useState(true)
    const items = useMemo(() => conversations.slice(-1000).reverse(), [conversations])
    const firstItemId = items.length ? items[0]?.id : undefined

    // Virtualizer for O(visible) rendering with dynamic row measurement
    const parentRef = useRef<HTMLDivElement>(null)
    const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 56,
        overscan: 12,
        getItemKey: (index) => items[index]?.id ?? String(index),
        measureElement: (el) => (el ? (el as HTMLElement).getBoundingClientRect().height : 0),
    })

    const scrollToTop = useCallback(() => {
        if (!autoScroll) return
        if (items.length === 0) return
        try {
            rowVirtualizer.scrollToIndex(0, { align: 'start' as const })
        } catch { }
        // Fallback to native scroll in case measurement is delayed
        try {
            const el = parentRef.current
            if (el) el.scrollTop = 0
        } catch { }
    }, [autoScroll, items.length, rowVirtualizer])

    // Auto-scroll when the last item changes (ensures it runs after the question/response is added)
    useEffect(() => {
        if (!autoScroll) return
        const raf1 = window.requestAnimationFrame(() => {
            const raf2 = window.requestAnimationFrame(() => {
                scrollToTop()
            })
            return () => window.cancelAnimationFrame(raf2)
        })
        return () => window.cancelAnimationFrame(raf1)
    }, [firstItemId, scrollToTop, autoScroll])

    // Auto-scroll immediately when toggling autoScroll on
    useEffect(() => {
        if (!autoScroll) return
        const t = setTimeout(scrollToTop, 0)
        return () => clearTimeout(t)
    }, [autoScroll, scrollToTop])

    return (
        <div className="bg-[#2c2c2c] rounded-md shadow-lg border border-gray-700 p-4 flex flex-col justify-between h-full">
            <div className="flex flex-col mb-2">
                <div className="flex flex-row justify-between gap-2">
                    <div className="text-xs text-gray-200">Interview Copilot</div>
                    {/* Mode Toggle */}
                    <div className="flex items-center justify-end gap-3">
                        <div className="text-xs text-gray-300">Mode</div>
                        <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
                            <button
                                className={`px-3 py-1 text-xs ${sessionType === 'live' ? 'bg-green-600 text-white' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'}`}
                                onClick={() => setSessionType('live')}
                                aria-pressed={sessionType === 'live'}
                            >
                                Live
                            </button>
                            <button
                                className={`px-3 py-1 text-xs ${sessionType === 'mock' ? 'bg-purple-600 text-white' : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'}`}
                                onClick={() => setSessionType('mock')}
                                aria-pressed={sessionType === 'mock'}
                            >
                                Mock
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${!isMuted ? 'text-white' : 'bg-[#3a3a3a] text-gray-300'}`}
                            style={!isMuted ? { backgroundColor: '#16a34a' } : undefined}
                            title={!isMuted ? 'AI Speech On (click to mute)' : 'AI Speech Muted (click to unmute)'}
                            onClick={() => onMuteToggle?.(!isMuted)}
                        >
                            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <label className="flex items-center gap-2 text-xs text-gray-300 select-none">
                            <span>Auto Scroll</span>
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                                className="accent-purple-600 cursor-pointer"
                            />
                        </label>
                    </div>
                </div>
                <div className="mb-2">
                    {isGenerating ? (
                        <span className="inline-flex items-center gap-2 text-xs" style={{ color: '#d8b4fe' }}>
                            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#a855f7' }} />
                            AI is thinking...
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-2 text-xs text-gray-300">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                            Ready
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-2 h-full">
                <div className="flex-1 order-1 lg:order-1">
                    <div
                        ref={parentRef}
                        className="flex-1 h-[42vh] sm:h-[48vh] md:h-[52vh] lg:h-[calc(100vh-150px)] max-h-full bg-[#303030] border border-gray-700 rounded-md p-4 sm:p-6 overflow-y-auto mb-2"
                    >
                        {items.length === 0 ? (
                            <div className="h-full w-full flex items-center justify-center text-sm text-gray-300 text-center">
                                The Interview Copilot is ready and waiting for interviewer's question
                            </div>
                        ) : (
                            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                                {rowVirtualizer.getVirtualItems().map((vi) => {
                                    const item = items[vi.index]
                                    return (
                                        <div
                                            key={item.id}
                                            ref={rowVirtualizer.measureElement}
                                            data-index={vi.index}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
                                            className="text-sm text-gray-200 py-1"
                                        >
                                            <span className={`px-2 py-0.5 rounded-full text-xs mr-2 text-white`}
                                                style={{ backgroundColor: item.type === 'question' ? '#2563eb' : item.type === 'response' ? '#9333ea' : '#ca8a04' }}>
                                                {item.type === 'question' ? 'Q' : item.type === 'response' ? 'AI' : 'Live'}
                                            </span>
                                            <span className="align-middle whitespace-pre-wrap break-words">{item.content}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {isGenerating && (
                            <div className="flex items-center gap-3 p-4">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#9333ea', animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#9333ea', animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#9333ea', animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
                <div className="w-full lg:max-w-[280px] lg:min-w-[260px] h-auto lg:h-full flex flex-col justify-between order-2 lg:order-2">
                    {items.length > 0 && (
                        <div className="mt-4 flex justify-end">
                            <button onClick={onClearHistory} className="text-xs text-red-500 hover:text-red-400">Clear history</button>
                        </div>
                    )}

                    <ResponseGenerator
                        question={question}
                        onResponseGenerated={onResponseGenerated}
                        resumeText={resumeText}
                        jobDescription={jobDescription}
                        additionalContext={additionalContext}
                        sessionId={sessionId}
                        onMuteToggle={onMuteToggle}
                        isMuted={isMuted}
                        onManualQuestionSubmit={onManualQuestionSubmit}
                    />

                </div>
            </div>
        </div>
    )
}


