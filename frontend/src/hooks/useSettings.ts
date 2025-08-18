import { useInterviewState } from '../context/InterviewStateContext'
import { __setPermissionsInternal, __setSettingsInternal } from '../providers/InterviewProvider'

export default function useSettings() {
    const ctx = useInterviewState()

    // Settings helpers
    const updateSettings = (partial: Partial<typeof ctx.settings>) => {
        if (__setSettingsInternal) __setSettingsInternal({ ...ctx.settings, ...partial } as any)
    }

    // Permission helpers
    const updatePermissions = (partial: Partial<typeof ctx.permissions>) => {
        if (__setPermissionsInternal) __setPermissionsInternal({ ...ctx.permissions, ...partial } as any)
    }

    const requestAudio = async () => {
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); updatePermissions({ audio: true }) } catch { updatePermissions({ audio: false }) }
    }
    const requestVideo = async () => {
        try { await navigator.mediaDevices.getUserMedia({ video: true }); updatePermissions({ video: true }) } catch { updatePermissions({ video: false }) }
    }
    const requestNotifications = async () => {
        try { const res = await Notification.requestPermission(); updatePermissions({ notifications: res === 'granted' }) } catch { updatePermissions({ notifications: false }) }
    }

    return {
        settings: ctx.settings,
        permissions: ctx.permissions,
        updateSettings,
        updatePermissions,
        requestAudio,
        requestVideo,
        requestNotifications,
    }
}


