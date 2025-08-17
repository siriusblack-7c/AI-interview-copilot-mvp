import { createContext, useContext, type ReactNode } from 'react';

export interface InterviewState {
    isListening: boolean;
    toggleListening: () => void;
    startListening: () => void;
    stopListening: () => void;
    isMicActive: boolean;

    isSharing: boolean;
    startShare: () => void;
    stopShare: () => void;
    systemStream: MediaStream | null;
    setSystemListening: (listening: boolean) => void;

    transcript: string;

    // Global UI flags
    isGenerating: boolean;
    setIsGenerating: (v: boolean) => void;
}

const InterviewStateContext = createContext<InterviewState | undefined>(undefined);

export const InterviewStateProvider = ({ value, children }: { value: InterviewState; children: ReactNode }) => {
    return (
        <InterviewStateContext.Provider value={value}>
            {children}
        </InterviewStateContext.Provider>
    );
};

export const useInterviewState = (): InterviewState => {
    const ctx = useContext(InterviewStateContext);
    if (!ctx) {
        throw new Error('useInterviewState must be used within an InterviewStateProvider');
    }
    return ctx;
};

export default InterviewStateContext;


