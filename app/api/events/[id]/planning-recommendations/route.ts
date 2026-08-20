import { NextResponse } from 'next/server'
import { callGeminiJson } from '@/lib/gemini'
import { buildPlanningPrompt, buildEventPlanningSchema, validateRecommendations, type EventPlanningResult, type PlanningAnswerSummary } from '@/lib/event-planning'
import type { TableIntel } from '@/lib/intel'
import { createClient } from '@/lib/supabase/server'
import { requireAppUser } from '@/lib/auth/server-user'
import { isEventManager } from '@/lib/event-access'
import { consumeRateLimit } from '@/lib/auth/rate-limit'

type RequestBody = {
  eventTitle?: unknown
  eventDate?: unknown
  intel?: unknown
  answers?: unknown
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const currentUser = await requireAppUser(supabase)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!await consumeRateLimit(supabase, 'planning_recommendations', 10, 600)) {
      return NextResponse.json({ error: 'Too many recommendation requests. Please wait a few minutes.' }, { status: 429 })
    }
    const { data: event } = await supabase.from('events').select('host_id').eq('id', id).maybeSingle()
    if (!event || !await isEventManager(supabase, id, currentUser.appUserId, event.host_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json() as RequestBody
    if (typeof body.eventTitle !== 'string' || !body.intel || typeof body.intel !== 'object' || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'Invalid planning context' }, { status: 400 })
    }
    if (JSON.stringify(body).length > 50_000) {
      return NextResponse.json({ error: 'Planning context is too large' }, { status: 413 })
    }

    const answers = body.answers as PlanningAnswerSummary[]

    // Recommendations only ever answer real event-specific survey questions —
    // with none asked, there is nothing to recommend rather than falling back
    // to generic, unasked-for advice.
    if (answers.length === 0) {
      return NextResponse.json({ overview: '', recommendations: [] } satisfies EventPlanningResult)
    }

    const result = await callGeminiJson<EventPlanningResult>(
      buildPlanningPrompt({
        eventTitle: body.eventTitle.slice(0, 200),
        eventDate: typeof body.eventDate === 'string' ? body.eventDate.slice(0, 40) : undefined,
        intel: body.intel as TableIntel,
        answers,
      }),
      buildEventPlanningSchema(answers.length)
    )

    return NextResponse.json(validateRecommendations(result, answers))
  } catch (error) {
    console.error('[planning-recommendations]', error)
    return NextResponse.json({ error: 'Could not generate planning recommendations' }, { status: 503 })
  }
}
