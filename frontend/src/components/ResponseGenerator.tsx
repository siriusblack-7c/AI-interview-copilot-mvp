import { useEffect, useRef, useState } from 'react';
import openaiService from '../services/openai';
import { useInterviewState } from '../context/InterviewStateContext';

interface ResponseGeneratorProps {
    question: string;
    onResponseGenerated: (response: string) => void;
    resumeText?: string;
    jobDescription?: string;
    additionalContext?: string;
    sessionId?: string;
    onMuteToggle?: (muted: boolean) => void;
    isMuted?: boolean;
    // New props for manual typing + mic control
    onManualQuestionSubmit?: (question: string) => void;
}

export default function ResponseGenerator({
    question,
    onResponseGenerated,
    sessionId,
    // props kept for compatibility; not used here
    onMuteToggle: _onMuteToggle,
    isMuted: _isMuted = false,
    onManualQuestionSubmit,
}: ResponseGeneratorProps) {
    const { isListening, stopListening, startListening, setSystemListening, setGenerating, isSharing } = useInterviewState();
    // const [currentResponse, setCurrentResponse] = useState('');
    const [typedQuestion, setTypedQuestion] = useState('');
    const pausedByTypingRef = useRef(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const detectedInputRef = useRef<HTMLTextAreaElement | null>(null);

    const autoResizeDetectedInput = () => {
        const el = detectedInputRef.current;
        if (!el) return;
        // Reset height to compute the correct scrollHeight
        el.style.height = 'auto';
        const maxHeightPx = 300; // grow up to this height, then scroll
        const nextHeight = Math.min(el.scrollHeight, maxHeightPx);
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
    };
    // Removed responseSource to simplify logic

    const streamCleanupRef = useRef<null | (() => void)>(null);
    const responseTextRef = useRef('');

    // Default suggestions to show when interview starts
    const DEFAULT_SUGGESTIONS = [
        'Tell me about your self.',
        'Why do you want to leave your current role?',
        'Tell me about your day to day.',
    ];

    // When interview starts (sharing begins), pre-populate suggested questions if none exist yet
    useEffect(() => {
        if (isSharing) {
            setSuggestions((prev) => (prev && prev.length > 0 ? prev : DEFAULT_SUGGESTIONS));
        }
    }, [isSharing]);

    const generateResponse = async (incoming: string): Promise<string> => {
        console.log('🔧 generateResponse (stream) called with:', incoming);
        // indicate generating via local UI state or external container if desired
        // setCurrentResponse('');
        responseTextRef.current = '';

        // cancel previous stream if any
        try { streamCleanupRef.current?.(); } catch { }
        streamCleanupRef.current = null;

        try {
            setGenerating(true);

            const donePromise = new Promise<string>((resolve, reject) => {
                openaiService
                    .streamAnswer({
                        question: incoming,
                        context: undefined as any,
                        sessionId: sessionId,
                        onDelta: (delta) => {
                            responseTextRef.current += delta;
                            // setCurrentResponse((prev) => prev + delta);
                        },
                        onSuggestions: (s) => setSuggestions(s || []),
                        onDone: () => {
                            resolve(responseTextRef.current);
                        },
                        onError: (e) => {
                            console.error('Error generating response:', e);
                            reject(e);
                        },
                    })
                    .then((cleanup) => {
                        streamCleanupRef.current = cleanup;
                    })
                    .catch((e) => {
                        console.error('Error generating response:', e);
                        reject(e);
                    });
            });

            const finalText = await donePromise;
            onResponseGenerated(finalText);
            return finalText;
        } catch (error: any) {
            // setCurrentResponse('');
            onResponseGenerated('');
            return '';
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        console.log('🧠 ResponseGenerator received question:', question);
        if (question) {
            // Populate textarea for visibility but do not focus; auto-generate immediately
            setTypedQuestion(question);
            autoResizeDetectedInput();
            generateResponse(question);
        }
    }, [question]);

    useEffect(() => {
        autoResizeDetectedInput();
    }, [typedQuestion]);

    const handleFocusInput = () => {
        if (isListening) {
            pausedByTypingRef.current = true;
            stopListening?.();
            setSystemListening?.(false);
        }
    };

    const handleBlurInput = () => {
        if (pausedByTypingRef.current) {
            pausedByTypingRef.current = false;
            startListening?.();
            setSystemListening?.(true);
        }
    };

    const submitTypedQuestion = async () => {
        const trimmed = typedQuestion.trim();
        if (!trimmed) return;
        // Optionally notify parent; generation is handled locally
        if (onManualQuestionSubmit) {
            onManualQuestionSubmit(trimmed);
        }
        setTypedQuestion('');
    };

    // keep for API parity; not used in this variant
    // NOTE: Clear action is not exposed in this minimal UI

    return (
        <div className="bg-[#2c2c2c] rounded-md flex flex-col justify-between h-full">
            {/* Suggested questions */}
            <div>
                {suggestions.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs text-gray-400 mb-2">Suggestions (click to ask):</div>
                        <div className="flex flex-wrap gap-2 w-full">
                            {suggestions.map((q, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setTypedQuestion(q);
                                        if (onManualQuestionSubmit) onManualQuestionSubmit(q);
                                    }}
                                    className="text-xs px-3 py-1 w-full text-left rounded-full bg-[#3a3a3a] text-gray-200 hover:bg-[#4a4a4a]"
                                    title="Ask this question"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div>
                <div className="rounded-lg mt-2">
                    <textarea
                        value={typedQuestion}
                        onChange={(e) => setTypedQuestion(e.target.value)}
                        onFocus={handleFocusInput}
                        onBlur={handleBlurInput}
                        rows={2}
                        ref={detectedInputRef}
                        placeholder="Ready responses captures from AI"
                        className="w-full text-sm resize-none px-3 py-3 bg-[#4a4a4a]  border border-gray-600 rounded-md text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-transparent"
                    />
                </div>

                <div className="mt-2 flex items-center justify-center">
                    <button
                        onClick={submitTypedQuestion}
                        disabled={!typedQuestion.trim()}
                        className="px-8 py-1 rounded-md font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generate"
                    >
                        Generate
                    </button>
                </div>
            </div>
        </div>
    );
}