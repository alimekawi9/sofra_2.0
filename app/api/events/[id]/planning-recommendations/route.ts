import { NextResponse } from 'next/server'
import { callGeminiJson } from '@/lib/gemini'
import { buildPlanningPrompt, EVENT_PLANNING_SCHEMA, type EventPlanningResult, type PlanningAnswerSummary } from '@/lib/event-planning'
import type { TableIntel } from '@/lib/intel'

type RequestBody = {
  eventTitle?: unknown
  eventDate?: unknown
  intel?: unknown
  answers?: unknown
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody
    if (typeof body.eventTitle !== 'string' || !body.intel || typeof body.intel !== 'object' || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'Invalid planning context' }, { status: 400 })
    }
    if (JSON.stringify(body).length > 50_000) {
      return NextResponse.json({ error: 'Planning context is too large' }, { status: 413 })
    }

    const result = await callGeminiJson<EventPlanningResult>(
      buildPlanningPrompt({
        eventTitle: body.eventTitle.slice(0, 200),
        eventDate: typeof body.eventDate === 'string' ? body.eventDate.slice(0, 40) : undefined,
        intel: body.intel as TableIntel,
        answers: body.answers as PlanningAnswerSummary[],
      }),
      EVENT_PLANNING_SCHEMA
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[planning-recommendations]', error)
    return NextResponse.json({ error: 'Could not generate planning recommendations' }, { status: 503 })
  }
}

