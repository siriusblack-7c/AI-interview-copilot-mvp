import { useEffect, useRef, useState } from 'react'
import { ClockIcon, VideoOff, Sun, Settings, Mic, MicOff, ChevronDown, Phone, Video, LogOut, PhoneOff } from 'lucide-react'
import { useInterviewState } from '../context/InterviewStateContext'

interface InterviewControlBarProps {
    timerSeconds: number
    isSharing: boolean
    onToggleShare: () => void
    onOpenSettings?: () => void
    onLeaveCall?: () => void
    onEndCall?: () => void
}

export default function InterviewControlBar({ timerSeconds, isSharing, onToggleShare, onOpenSettings, onLeaveCall, onEndCall }: InterviewControlBarProps) {
    const { isListening, toggleListening, isMicActive, isCameraOn } = useInterviewState()
    const [menuOpen, setMenuOpen] = useState(false as boolean)
    const menuRef = useRef<HTMLDivElement | null>(null)

    // Close the dropdown on outside click
    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!menuRef.current) return
            if (menuRef.current.contains(e.target as Node)) return
            setMenuOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [])
    const enableCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true })
            try { (window as any).__setCamera?.(true, stream) } catch { }
        } catch {
            try { (window as any).__setCamera?.(false, null) } catch { }
        }
    }
    const disableCamera = () => {
        try { (window as any).__setCamera?.(false, null) } catch { }
    }
    const mm = Math.floor(timerSeconds / 60).toString().padStart(2, '0')
    const ss = (timerSeconds % 60).toString().padStart(2, '0')

    return (
        <div className="w-full flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-3">
                <span className="bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs">Premium</span>
                <div className="text-xs text-gray-300 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    {mm}:{ss}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={isCameraOn ? disableCamera : enableCamera} className={`w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center ${isCameraOn ? 'bg-green-600 hover:bg-green-700' : ''}`} title="Disable Camera" aria-label="Disable Camera">
                    {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
                <button className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center" title="Brightness" aria-label="Brightness">
                    <Sun className="w-4 h-4" />
                </button>
                <button onClick={onOpenSettings} className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center" title="Settings" aria-label="Settings">
                    <Settings className="w-4 h-4" />
                </button>
                <button
                    disabled={!isMicActive}
                    onClick={toggleListening}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${isListening ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300'} ${!isMicActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={isListening ? 'Mute microphone' : 'Unmute microphone'}
                    aria-label={isListening ? 'Mute microphone' : 'Unmute microphone'}
                >
                    {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <div className="relative" ref={menuRef as any}>
                    <button
                        onClick={() => {
                            if (!isSharing) { onToggleShare(); return }
                            setMenuOpen((prev) => !prev)
                        }}
                        className={`ml-3 flex items-center gap-2 ${isSharing ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white text-xs px-3 py-2 rounded-md`}
                        title={isSharing ? 'Leave Interview' : 'Start Interview'}
                    >
                        <Phone className="w-4 h-4 rotate-[135deg]" />
                        {isSharing ? 'Leave Interview' : 'Start Interview'}
                        {isSharing && <ChevronDown className="w-4 h-4" />}
                    </button>
                    {isSharing && menuOpen && (
                        <div className="absolute right-0 mt-2 w-44 rounded-lg bg-[#2c2c2c] border border-gray-700 shadow-lg p-2 z-20">
                            <button
                                onClick={() => { setMenuOpen(false); (onLeaveCall || onToggleShare)() }}
                                className="w-full flex items-center justify-between text-sm text-white hover:bg-[#3a3a3a] px-3 py-2 rounded-md"
                            >
                                <span>Leave Call</span>
                                <LogOut className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); (onEndCall || onToggleShare)() }}
                                className="w-full flex items-center justify-between text-sm text-white hover:bg-[#3a3a3a] px-3 py-2 rounded-md mt-1"
                            >
                                <span>End Call</span>
                                <PhoneOff className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}


