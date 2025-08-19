import { useEffect, useMemo, useRef, useState } from 'react'
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
    onMuteToggle?: (muted: boolean) => void
    isMuted?: boolean
    onManualQuestionSubmit?: (q: string) => void
}

export default function InterviewCopilotPanel({
    conversations,
    onClearHistory,
    question,
    onResponseGenerated,
    resumeText,
    jobDescription,
    additionalContext,
    onMuteToggle,
    isMuted,
    onManualQuestionSubmit,
}: PanelProps) {
    const { isGenerating } = useInterviewState()
    const [autoScroll, setAutoScroll] = useState(true)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!autoScroll) return
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [autoScroll, conversations.length])

    const items = useMemo(() => conversations.slice(-1000), [conversations])

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

    return (
        <div className="bg-[#2c2c2c] rounded-md shadow-lg border border-gray-700 p-4 flex flex-col h-[calc(100vh-120px)]">
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-200">Interview Copilot</div>
                <div className="flex items-center gap-4">
                    <button
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${!isMuted ? 'bg-green-600 text-white' : 'bg-[#3a3a3a] text-gray-300'}`}
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
                    <span className="inline-flex items-center gap-2 text-xs text-purple-300">
                        <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                        AI is thinking...
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-2 text-xs text-gray-300">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                        Ready
                    </span>
                )}
            </div>

            <div
                ref={(el) => { parentRef.current = el as HTMLDivElement; scrollRef.current = el as HTMLDivElement; }}
                className="flex-1 min-h-[250px] bg-[#303030] border border-gray-700 rounded-md p-6 overflow-y-auto mb-2"
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
                                    <span className={`px-2 py-0.5 rounded-full text-xs mr-2 ${item.type === 'question' ? 'bg-blue-600 text-white' : item.type === 'response' ? 'bg-purple-600 text-white' : 'bg-yellow-600 text-white'}`}>
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
                            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                    </div>
                )}

            </div>

            <div className="mb-2 text-[10px] text-gray-400 uppercase tracking-wide">AI Response Generator</div>
            <ResponseGenerator
                question={question}
                onResponseGenerated={onResponseGenerated}
                resumeText={resumeText}
                jobDescription={jobDescription}
                additionalContext={additionalContext}
                onMuteToggle={onMuteToggle}
                isMuted={isMuted}
                onManualQuestionSubmit={onManualQuestionSubmit}
            />

            {items.length > 0 && (
                <div className="mt-4 flex justify-end">
                    <button onClick={onClearHistory} className="text-xs text-red-500 hover:text-red-400">Clear history</button>
                </div>
            )}
        </div>
    )
}


