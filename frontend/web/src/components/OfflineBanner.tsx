import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/** Persistent shell banner when the browser reports offline (APP-O02). */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b-2 border-amber-700 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950"
    >
      <WifiOff size={16} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span>
        You are offline. Lists and saves need a network connection — reconnect, then retry.
      </span>
    </div>
  )
}
