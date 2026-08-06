import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SubmissionStage =
  | 'validating'
  | 'resolving_user'
  | 'resolving_rsvp'
  | 'saving_preferences'
  | 'finalizing_rsvp'
  | 'complete'

type Body = {
  eventId?: unknown
  userId?: unknown
  status?: unknown
  dietary?: unknown
  avoid?: unknown
  proteinPreferences?: unknown
  flavorPreference?: unknown
  adventurousness?: unknown
}

function stringArray(value: unknown, max = 50): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string')
}

function log(stage: SubmissionStage, requestId: string, startedAt: number, fields: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    scope: 'rsvp_submission',
    requestId,
    stage,
    durationMs: Date.now() - startedAt,
    ...fields,
  }))
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  let body: Body
  try {
    body = await request.json() as Body
  } catch {
    log('validating', requestId, startedAt, { status: 400, code: 'INVALID_JSON' })
    return NextResponse.json({ success: false, stage: 'validating', code: 'INVALID_JSON', message: 'Invalid request.' }, { status: 400 })
  }

  const valid =
    typeof body.eventId === 'string' &&
    typeof body.userId === 'string' &&
    (body.status === 'going' || body.status === 'maybe') &&
    stringArray(body.dietary) &&
    stringArray(body.avoid) &&
    stringArray(body.proteinPreferences, 2) &&
    stringArray(body.flavorPreference, 3) &&
    Number.isInteger(body.adventurousness) &&
    Number(body.adventurousness) >= 0 && Number(body.adventurousness) <= 100

  if (!valid) {
    log('validating', requestId, startedAt, { status: 400, code: 'INVALID_SUBMISSION' })
    return NextResponse.json({ success: false, stage: 'validating', code: 'INVALID_SUBMISSION', message: 'Check your RSVP details and try again.' }, { status: 400 })
  }

  log('saving_preferences', requestId, startedAt)
  const supabase = createClient()
  const { data, error } = await supabase.rpc('submit_rsvp_preferences', {
    p_event_id: body.eventId,
    p_user_id: body.userId,
    p_status: body.status,
    p_dietary: body.dietary,
    p_avoid: body.avoid,
    p_protein_preferences: body.proteinPreferences,
    p_flavor_preference: body.flavorPreference,
    p_adventurousness: body.adventurousness,
  })

  if (error) {
    const stage: SubmissionStage = error.message === 'user_not_found'
      ? 'resolving_user'
      : error.message === 'event_not_found'
      ? 'resolving_rsvp'
      : 'saving_preferences'
    const status = error.code === 'P0002' ? 404 : 500
    log(stage, requestId, startedAt, { status, code: error.code ?? 'SUPABASE_ERROR' })
    return NextResponse.json({
      success: false,
      stage,
      code: error.code ?? 'SUPABASE_ERROR',
      message: status === 404 ? 'This invitation is no longer available.' : 'Could not save your preferences.',
    }, { status })
  }

  log('complete', requestId, startedAt, { status: 200 })
  return NextResponse.json(data, { status: 200 })
}
