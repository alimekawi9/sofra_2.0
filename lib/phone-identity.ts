import type { SupabaseClient } from '@supabase/supabase-js'
import { PHONE_COUNTRIES } from './phone-countries'

export type PhoneUserCandidate = { id: string; phone: string | null }

const DIAL_CODES = Array.from(new Set(PHONE_COUNTRIES.map((country) => country.dialCode)))
  .sort((a, b) => b.length - a.length)

export function phoneLookupVariants(phone: string): string[] {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  const variants = new Set<string>()
  if (trimmed) variants.add(trimmed)
  if (!digits) return Array.from(variants)

  variants.add(digits)
  variants.add(`+${digits}`)

  if (trimmed.startsWith('+')) {
    const dialCode = DIAL_CODES.find((code) => trimmed.startsWith(code))
    if (dialCode) {
      const dialDigits = dialCode.replace(/\D/g, '')
      const national = digits.slice(dialDigits.length)
      if (national) {
        variants.add(national)
        variants.add(`0${national}`)
      }
    }
  } else if (digits.startsWith('0') && digits.length > 1) {
    variants.add(digits.slice(1))
  }

  return Array.from(variants)
}

export function eventIdFromNext(next: string): string | null {
  const match = /^\/events\/([^/?#]+)/.exec(next)
  return match?.[1] ?? null
}

export function selectPhoneCandidate(
  candidates: PhoneUserCandidate[],
  exactPhone: string,
  memberIds: ReadonlySet<string>
): PhoneUserCandidate | null {
  if (candidates.length === 0) return null
  const memberCandidates = candidates.filter((candidate) => memberIds.has(candidate.id))
  if (memberCandidates.length > 0) {
    return memberCandidates.find((candidate) => candidate.phone === exactPhone) ?? memberCandidates[0]
  }
  return candidates.find((candidate) => candidate.phone === exactPhone) ?? candidates[0]
}

export async function findExistingUserByPhone(
  supabase: SupabaseClient,
  phone: string,
  next: string
): Promise<{ userId: string | null; error: string | null }> {
  const variants = phoneLookupVariants(phone)
  const { data, error } = await supabase
    .from('users')
    .select('id,phone')
    .in('phone', variants)

  if (error) return { userId: null, error: error.message }
  const candidates = (data ?? []) as PhoneUserCandidate[]
  if (candidates.length === 0) return { userId: null, error: null }
  if (candidates.length === 1) return { userId: candidates[0].id, error: null }

  const eventId = eventIdFromNext(next)
  if (!eventId) {
    return { userId: selectPhoneCandidate(candidates, phone.trim(), new Set())?.id ?? null, error: null }
  }

  const ids = candidates.map((candidate) => candidate.id)
  const [{ data: event }, { data: rsvps }, { data: cohosts }] = await Promise.all([
    supabase.from('events').select('host_id,chef_id').eq('id', eventId).maybeSingle(),
    supabase.from('rsvps').select('user_id').eq('event_id', eventId).in('user_id', ids),
    supabase.from('event_cohosts').select('user_id').eq('event_id', eventId).in('user_id', ids),
  ])
  const memberIds = new Set<string>([
    ...((rsvps ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
    ...((cohosts ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
  ])
  const eventMembership = event as { host_id?: string; chef_id?: string | null } | null
  if (eventMembership?.host_id) memberIds.add(eventMembership.host_id)
  if (eventMembership?.chef_id) memberIds.add(eventMembership.chef_id)

  return {
    userId: selectPhoneCandidate(candidates, phone.trim(), memberIds)?.id ?? null,
    error: null,
  }
}
