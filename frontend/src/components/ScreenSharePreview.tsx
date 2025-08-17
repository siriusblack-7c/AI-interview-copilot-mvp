import { useState, useEffect, useRef } from 'react';
import { MousePointerClickIcon } from 'lucide-react';
import { useInterviewState } from '../context/InterviewStateContext';
import InterviewControlBar from './InterviewControlBar';

export default function ScreenSharePreview() {
    const { systemStream, isSharing, startShare, stopShare } = useInterviewState();
    const shareVideoRef = useRef<HTMLVideoElement>(null);
    const [timer, setTimer] = useState<number>(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isSharing) {
            interval = setInterval(() => {
                setTimer(prevTimer => prevTimer + 1);
            }, 1000);
        } else {
            setTimer(0); // Reset timer when not sharing
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isSharing]);

    useEffect(() => {
        const video = shareVideoRef.current;
        if (!video) return;
        if (systemStream) {
            (video as any).srcObject = systemStream;

            video.play().catch(() => { /* ignore */ });
        } else {
            (video as any).srcObject = null;
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
    }, [systemStream]);

    return (
        <div className="w-full flex flex-col items-center justify-center">
            <InterviewControlBar
                timerSeconds={timer}
                isSharing={isSharing}
                onToggleShare={() => (isSharing ? stopShare() : startShare())}
            />

            {isSharing ? (
                <div className="bg-[#0f0f0f] border border-gray-700 rounded-md overflow-hidden w-full">
                    <div className="relative">
                        <video
                            ref={shareVideoRef}
                            className="w-full max-h-64 object-contain bg-black"
                            autoPlay
                            muted
                            playsInline
                        />
                        {(!systemStream || systemStream.getVideoTracks().length === 0) && (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 bg-black/60">
                                No video in shared stream. Select a Tab or Window (and enable \"Share audio\") in the picker.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-[#484848] border border-gray-700 rounded-md overflow-hidden w-full h-[250px] flex flex-col items-center justify-center">
                    <div className="px-3 py-2 text-xs text-gray-300">
                        Select your interview meeting room
                    </div>
                    <button
                        onClick={startShare}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
                    >
                        <MousePointerClickIcon className="w-4 h-4" />
                        Select
                    </button>
                </div>
            )}
        </div>
    );
}