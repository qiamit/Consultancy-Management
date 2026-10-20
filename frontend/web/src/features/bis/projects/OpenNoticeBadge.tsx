import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Red chip on a licence row: how many BIS notices are still open. Opens License Non-Conformity. */
export function OpenNoticeBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <Link
      to="/bis/stop-marking"
      title="Open BIS Notices on This Licence — Open License Non-Conformity"
      aria-label={`${count} Open BIS ${count === 1 ? 'Notice' : 'Notices'}`}
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-inset ring-red-200 hover:bg-red-100"
      onClick={(e) => e.stopPropagation()}
    >
      <ShieldAlert size={11} aria-hidden />
      {count} Open {count === 1 ? 'Notice' : 'Notices'}
    </Link>
  )
}
