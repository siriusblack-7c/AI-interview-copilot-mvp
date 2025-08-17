import { type ReactNode, useState } from 'react';
import { InterviewStateProvider } from '../context/InterviewStateContext';
import { useMicrophone } from '../hooks/useMicrophone';
import { useSystemAudio } from '../hooks/useSystemAudio';

export type MicEngine = 'webspeech';
export type ShareEngine = 'displayMedia';

export default function InterviewProvider({
    children,
}: {
    children: ReactNode;
}) {
    // Mic variant (currently only webspeech)
    const mic = useMicrophone({ onQuestionDetected: () => { } });

    // System audio share variant (currently only getDisplayMedia)
    const sys = useSystemAudio({ onQuestionDetected: () => { } });

    // Global UI state flags
    const [isGenerating, setIsGenerating] = useState(false);

    return (
        <InterviewStateProvider
            value={{
                // mic
                isListening: mic.isListening,
                toggleListening: mic.toggleListening,
                startListening: mic.startListening,
                stopListening: mic.stopListening,
                isMicActive: mic.isMicActive,
                transcript: mic.transcript,
                // system share
                isSharing: sys.isSharing,
                startShare: sys.startShare,
                stopShare: sys.stopShare,
                systemStream: sys.stream ?? null,
                setSystemListening: sys.setListening,
                // global flags
                isGenerating,
                setIsGenerating,
            }}
        >
            {children}
        </InterviewStateProvider>
    );
}


