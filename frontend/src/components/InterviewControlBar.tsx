import { ClockIcon, VideoOff, Sun, Settings, Mic, MicOff, ChevronDown, Phone } from 'lucide-react'
import { useInterviewState } from '../context/InterviewStateContext'

interface InterviewControlBarProps {
    timerSeconds: number
    isSharing: boolean
    onToggleShare: () => void
}

export default function InterviewControlBar({ timerSeconds, isSharing, onToggleShare }: InterviewControlBarProps) {
    const { isListening, toggleListening, isMicActive } = useInterviewState()
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
                <button className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center" title="Camera Off" aria-label="Camera Off">
                    <VideoOff className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center" title="Brightness" aria-label="Brightness">
                    <Sun className="w-4 h-4" />
                </button>
                <button className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 flex items-center justify-center" title="Settings" aria-label="Settings">
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
                <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                <button
                    onClick={onToggleShare}
                    className="ml-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-md"
                    title={isSharing ? 'End Interview' : 'Start Interview'}
                >
                    <Phone className="w-4 h-4" />
                    Live Interview
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}


