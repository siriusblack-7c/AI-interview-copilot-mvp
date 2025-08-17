import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import openaiService from '../services/openai';
import { useInterviewState } from '../context/InterviewStateContext';

interface ResponseGeneratorProps {
    question: string;
    onResponseGenerated: (response: string) => void;
    openaiConfigured?: boolean;
    resumeText?: string;
    jobDescription?: string;
    additionalContext?: string;
    onMuteToggle?: (muted: boolean) => void;
    isMuted?: boolean;
    // New props for manual typing + mic control
    onManualQuestionSubmit?: (question: string) => void;
}

export default function ResponseGenerator({
    question,
    onResponseGenerated,
    openaiConfigured = false,
    resumeText = '',
    jobDescription = '',
    additionalContext = '',
    // props kept for compatibility; not used here
    onMuteToggle: _onMuteToggle,
    isMuted: _isMuted = false,
    onManualQuestionSubmit,
}: ResponseGeneratorProps) {
    const { isListening, stopListening, startListening, setSystemListening, setIsGenerating } = useInterviewState();
    // const [currentResponse, setCurrentResponse] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [typedQuestion, setTypedQuestion] = useState('');
    const pausedByTypingRef = useRef(false);
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

    const generateResponse = async (incoming: string): Promise<string> => {
        console.log('🔧 generateResponse (stream) called with:', incoming);
        setIsGenerating(true);
        setError(null);
        // setCurrentResponse('');
        responseTextRef.current = '';

        // cancel previous stream if any
        try { streamCleanupRef.current?.(); } catch { }
        streamCleanupRef.current = null;

        try {
            if (!openaiConfigured || !openaiService.isConfigured()) {
                throw new Error('OpenAI is not configured. Please configure your API key first.');
            }

            const context = {
                resume: resumeText || undefined,
                jobDescription: jobDescription || undefined,
                additionalContext: additionalContext || undefined
            };

            const donePromise = new Promise<string>((resolve) => {
                openaiService
                    .streamAnswer({
                        question: incoming,
                        context,
                        onDelta: (delta) => {
                            responseTextRef.current += delta;
                            // setCurrentResponse((prev) => prev + delta);
                        },
                        onDone: () => {
                            resolve(responseTextRef.current);
                        },
                        onError: (msg) => {
                            setError(msg);
                            resolve('');
                        },
                    })
                    .then((cleanup) => {
                        streamCleanupRef.current = cleanup;
                    })
                    .catch((e) => {
                        setError(e?.message || 'stream error');
                        resolve('');
                    });
            });

            const finalText = await donePromise;
            onResponseGenerated(finalText);
            return finalText;
        } catch (error: any) {
            setError(error.message);
            // setCurrentResponse('');
            onResponseGenerated('');
            return '';
        } finally {
            setIsGenerating(false);
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
        <div className="bg-[#2c2c2c] rounded-md">
            <div className="rounded-lg">
                <textarea
                    value={typedQuestion}
                    onChange={(e) => setTypedQuestion(e.target.value)}
                    onFocus={handleFocusInput}
                    onBlur={handleBlurInput}
                    rows={3}
                    ref={detectedInputRef}
                    placeholder="Ready responses captures from AI"
                    className="w-full text-sm resize-none px-3 py-3 bg-[#4a4a4a]  border border-gray-600 rounded-md text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-transparent"
                />
            </div>

            <div className="mt-2 flex items-center justify-center">
                <button
                    onClick={submitTypedQuestion}
                    disabled={!typedQuestion.trim()}
                    className="px-8 py-3 rounded-md font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generate"
                >
                    Generate
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">Error</span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                    <p className="text-xs text-red-600 mt-1">Please check your OpenAI configuration and try again.</p>
                </div>
            )}
            {/* 
            {isGenerating ? (
                <div className="flex items-center gap-3 p-4 bg-[#404040] rounded-lg">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-purple-600 font-medium">
                        OpenAI is thinking...
                    </span>
                </div>
            ) : currentResponse ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Response Ready</span>
                    </div>
                    <div className="p-4 bg-[#404040] rounded-lg border border-green-200">
                        <p className="text-gray-300 leading-relaxed">{currentResponse}</p>
                    </div>
                </div>
            ) : (
                <></>
            )} */}

        </div>
    );
}