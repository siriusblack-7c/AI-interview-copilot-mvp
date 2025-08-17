import { useState, useEffect, useRef } from 'react';
import { ClockIcon, MousePointerClickIcon, XIcon } from 'lucide-react';

interface ScreenSharePreviewProps {
    systemStream: MediaStream | null;
    isSharing: boolean;
    onStartShare: () => void;
    onStopShare: () => void;
}

export default function ScreenSharePreview({
    systemStream,
    isSharing,
    onStartShare,
    onStopShare
}: ScreenSharePreviewProps) {
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
            {isSharing ? (
                <>
                    <div className="w-full flex items-center justify-between">
                        <div className="px-3 py-2 text-xs text-gray-300 flex items-center gap-2">
                            <div className="bg-purple-500 text-white px-3 py-2 rounded-full">
                                Premium
                            </div>
                            <div className="text-xs text-gray-300 flex items-center gap-2">
                                <ClockIcon className="w-4 h-4" />
                                {Math.floor(timer / 60).toString().padStart(2, '0')}:{(timer % 60).toString().padStart(2, '0')}
                            </div>
                        </div>
                        <div className="px-3 py-2 text-xs text-gray-300 flex items-center gap-2">
                            <button
                                onClick={onStopShare}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-full flex items-center gap-2 transition-colors"
                            >
                                <XIcon className="w-4 h-4" />
                                Stop Sharing
                            </button>
                        </div>
                    </div>
                    <div className="bg-[#0f0f0f] border border-gray-700 rounded-md overflow-hidden">
                        <div className="px-3 py-2 text-xs text-gray-300 bg-[#0a0a0a] border-b border-gray-700">
                            Screen Share Preview
                        </div>
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
                                    No video in shared stream. Select a Tab or Window (and enable "Share audio") in the picker.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="bg-[#484848] border border-gray-700 rounded-md overflow-hidden w-full h-[250px] flex flex-col items-center justify-center">
                    <div className="px-3 py-2 text-xs text-gray-300">
                        Select your interview meeting room
                    </div>
                    <button
                        onClick={onStartShare}
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