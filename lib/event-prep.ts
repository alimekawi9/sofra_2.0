import type { SupabaseClient } from '@supabase/supabase-js'
import { isEventDateUndecided } from './event-date'

export type EventPrepKey =
  | 'theme_concept'
  | 'guest_budget'
  | 'date_invites'
  | 'signature_drink'
  | 'decor'
  | 'cameras'
  | 'audio'
  | 'dietary_review'
  | 'timing_schedule'
  | 'seating_finalized'
  | 'photos_reminder'
  | 'feedback'

export type EventPrepPeriod = 'weeks' | 'one_two_weeks' | 'day_of' | 'after'

export type EventPrepManualState = Partial<Record<EventPrepKey, { completed: boolean; note: string }>>

export type EventPrepSignals = {
  eventDate: string
  tagline: string | null
  customDetailCount: number
  venue: string | null
  address: string | null
  estimatedGuestCount: number | null
  budgetAmount: number | null
  menuDrafted: boolean
  playlistStarted: boolean
  photosUploaded: boolean
  feedbackSubmitted: boolean
}

export type EventPrepItem = {
  key: EventPrepKey | 'venue' | 'menu_drafted' | 'playlist_started'
  label: string
  period: EventPrepPeriod
  required: boolean
  completed: boolean
  note: string
  alerting: boolean
  action: 'edit-concept' | 'edit-estimates' | 'edit-location' | 'invite' | 'menu' | 'inline' | 'vibe' | 'table' | 'timeline' | 'seating' | 'album' | 'photo-reminder' | 'feedback'
}

const MS_DAY = 86_400_000

export function daysUntilEvent(eventDate: string, now = new Date()): number | null {
  if (isEventDateUndecided(eventDate)) return null
  const value = new Date(eventDate).getTime()
  if (!Number.isFinite(value)) return null
  return (value - now.getTime()) / MS_DAY
}

function threshold(period: EventPrepPeriod): number | null {
  if (period === 'weeks') return 14
  if (period === 'one_two_weeks') return 7
  if (period === 'day_of') return 2
  return null
}

function isAlerting(required: boolean, completed: boolean, period: EventPrepPeriod, days: number | null): boolean {
  const due = threshold(period)
  return required && !completed && due !== null && days !== null && days >= 0 && days <= due
}

export function buildEventPrepItems(
  signals: EventPrepSignals,
  manual: EventPrepManualState,
  now = new Date()
): EventPrepItem[] {
  const days = daysUntilEvent(signals.eventDate, now)
  const manualDone = (key: EventPrepKey) => Boolean(manual[key]?.completed)
  const manualNote = (key: EventPrepKey) => manual[key]?.note ?? ''
  const dateLocked = !isEventDateUndecided(signals.eventDate)
  const definitions: Array<Omit<EventPrepItem, 'alerting'>> = [
    { key: 'theme_concept', label: 'Theme/concept set', period: 'weeks', required: false, completed: Boolean(signals.tagline?.trim()) || signals.customDetailCount > 0 || manualDone('theme_concept'), note: manualNote('theme_concept'), action: 'edit-concept' },
    { key: 'guest_budget', label: 'Guest count & budget estimated', period: 'weeks', required: true, completed: (signals.estimatedGuestCount ?? 0) > 0 && (signals.budgetAmount ?? 0) > 0, note: manualNote('guest_budget'), action: 'edit-estimates' },
    { key: 'venue', label: 'Venue confirmed', period: 'weeks', required: true, completed: Boolean(signals.venue?.trim() || signals.address?.trim()), note: '', action: 'edit-location' },
    { key: 'date_invites', label: 'Date/time locked, invites sent', period: 'weeks', required: true, completed: dateLocked && manualDone('date_invites'), note: manualNote('date_invites'), action: 'invite' },
    { key: 'menu_drafted', label: 'Menu drafted', period: 'one_two_weeks', required: true, completed: signals.menuDrafted, note: '', action: 'menu' },
    { key: 'signature_drink', label: 'Custom name tags', period: 'one_two_weeks', required: false, completed: manualDone('signature_drink'), note: manualNote('signature_drink'), action: 'inline' },
    { key: 'decor', label: 'Props/decor sourced', period: 'one_two_weeks', required: false, completed: manualDone('decor'), note: manualNote('decor'), action: 'inline' },
    { key: 'cameras', label: 'Disposable cameras ordered', period: 'one_two_weeks', required: false, completed: manualDone('cameras'), note: manualNote('cameras'), action: 'inline' },
    { key: 'playlist_started', label: 'Playlist started', period: 'one_two_weeks', required: false, completed: signals.playlistStarted, note: '', action: 'vibe' },
    { key: 'audio', label: 'Speakers/audio access confirmed', period: 'one_two_weeks', required: false, completed: manualDone('audio'), note: manualNote('audio'), action: 'inline' },
    { key: 'dietary_review', label: 'Dietary follow-ups reviewed', period: 'one_two_weeks', required: true, completed: manualDone('dietary_review'), note: manualNote('dietary_review'), action: 'table' },
    { key: 'timing_schedule', label: 'Timing schedule set', period: 'one_two_weeks', required: true, completed: manualDone('timing_schedule'), note: manualNote('timing_schedule'), action: 'timeline' },
    { key: 'seating_finalized', label: 'Seating finalized', period: 'day_of', required: true, completed: manualDone('seating_finalized'), note: manualNote('seating_finalized'), action: 'seating' },
    { key: 'photos_reminder', label: 'Upload photos / send a reminder', period: 'after', required: false, completed: signals.photosUploaded || manualDone('photos_reminder'), note: manualNote('photos_reminder'), action: 'album' },
    { key: 'feedback', label: 'Feedback for Sofra', period: 'after', required: false, completed: signals.feedbackSubmitted, note: '', action: 'feedback' },
  ]
  return definitions.map((item) => ({
    ...item,
    // Product feedback is the one deliberate optional-item exception: once
    // the Sofra has passed, it remains a visible follow-up until submitted.
    alerting: item.key === 'feedback'
      ? days !== null && days < 0 && !item.completed
      : isAlerting(item.required, item.completed, item.period, days),
  }))
}

export async function fetchEventPrepState(supabase: SupabaseClient, eventId: string, managerId: string) {
  const { data, error } = await supabase.rpc('get_event_prep_state', { p_event_id: eventId, p_manager_id: managerId })
  if (error) return { manual: {} as EventPrepManualState, menuDrafted: false, feedbackSubmitted: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return { manual: {} as EventPrepManualState, menuDrafted: false, feedbackSubmitted: false, error: null }
  return {
    manual: (row.manual_items && typeof row.manual_items === 'object' ? row.manual_items : {}) as EventPrepManualState,
    menuDrafted: row.menu_drafted === true,
    feedbackSubmitted: row.feedback_submitted === true,
    error: null,
  }
}

export async function saveEventPrepItem(supabase: SupabaseClient, eventId: string, managerId: string, key: EventPrepKey, completed: boolean, note = '') {
  const { data, error } = await supabase.rpc('set_event_prep_item', {
    p_event_id: eventId, p_manager_id: managerId, p_item_key: key, p_completed: completed, p_note: note,
  })
  return { ok: !error && data === true, error: error?.message ?? null }
}

export async function hasSubmittedSofraFeedback(supabase: SupabaseClient, eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_sofra_feedback', { p_event_id: eventId, p_user_id: userId })
  return !error && data === true
}
