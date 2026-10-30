import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  formatDateByPreference,
  formatTimeByPreference,
} from '@/lib/appDateFormat'
import { daysUntilIso } from '@/lib/localDate'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display date using Lab Settings → Date Setting. Returns null when invalid. */
export function formatDateDmyMmm(dateString: string | null | undefined): string | null {
  return formatDateByPreference(dateString)
}

export function formatDate(dateString: string | null | undefined): string {
  return formatDateByPreference(dateString) ?? '—'
}

export function formatDateTime(dateString: string | null | undefined): string {
  const datePart = formatDateByPreference(dateString)
  if (!datePart || !dateString) return '—'
  const time = formatTimeByPreference(dateString)
  if (!time) return datePart
  return `${datePart}, ${time}`
}

export function generateCode(prefix: string, sequence: number, padLength = 5): string {
  return `${prefix}-${String(sequence).padStart(padLength, '0')}`
}

export function isCalibrationDue(dueDateString: string, warningDays = 30): boolean {
  const diffDays = daysUntilIso(dueDateString)
  return diffDays != null && diffDays <= warningDays
}

/** Overdue only after the due date has passed (the due day itself is not overdue). */
export function isCalibrationOverdue(dueDateString: string): boolean {
  const diffDays = daysUntilIso(dueDateString)
  return diffDays != null && diffDays < 0
}
