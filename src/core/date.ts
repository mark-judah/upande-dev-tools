import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export type DueTone = 'late' | 'today' | 'soon' | 'later' | 'none';

export type Due = { label: string; tone: DueTone; days: number | null };

/** "2026-11-20" -> { label: 'Fri', tone: 'soon' }. Compares calendar days, so time zones never shift it. */
export function relativeDue(date?: string | null, today: Date = new Date()): Due {
  if (!date) return { label: 'No date', tone: 'none', days: null };
  const d = parseISO(date.slice(0, 10));
  if (!isValid(d)) return { label: 'No date', tone: 'none', days: null };
  const days = differenceInCalendarDays(d, today);
  if (days < 0) return { label: days === -1 ? 'Yesterday' : `${-days}d late`, tone: 'late', days };
  if (days === 0) return { label: 'Today', tone: 'today', days };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon', days };
  if (days < 7) return { label: format(d, 'EEE'), tone: 'soon', days };
  return { label: format(d, 'd MMM'), tone: 'later', days };
}

export const todayKey = (d: Date = new Date()) => format(d, 'yyyy-MM-dd');

/** "09:30" from a Frappe datetime string ("2026-11-16 09:30:00"). */
export function timeOf(value: string): string {
  const d = new Date(value.replace(' ', 'T'));
  return isValid(d) ? format(d, 'HH:mm') : '';
}
