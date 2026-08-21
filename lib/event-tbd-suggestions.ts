import type { CustomQuestionConfig } from './questionnaire'
import { rankingWinners, choiceCounts } from './event-planning'
import { isEventDateUndecided } from './event-date'

export type TbdField = 'dateTime' | 'location'

// Matches the guest-only RSVP readiness convention: fewer responses than
// this is treated as too little signal to act on.
export const MIN_RESPONSES_FOR_SUGGESTION = 3

const FIELD_KEYWORDS: Record<TbdField, string[]> = {
  dateTime: ['date', 'day', 'when', 'time', 'schedule', 'weekend', 'evening', 'morning', 'afternoon'],
  location: ['where', 'location', 'venue', 'restaurant', 'address', 'place'],
}

function keywordScore(question: Pick<CustomQuestionConfig, 'title' | 'helperText'>, field: TbdField): number {
  const text = `${question.title} ${question.helperText ?? ''}`.toLowerCase()
  return FIELD_KEYWORDS[field].filter((keyword) => new RegExp(`\\b${keyword}\\b`).test(text)).length
}

// Only a question's title/helper text are scanned, never its option labels
// -- those are the candidate answers (e.g. "Saturday Aug 30, 7pm"), not the
// topic of the question.
export function classifyQuestion(question: Pick<CustomQuestionConfig, 'title' | 'helperText'>): Record<TbdField, number> {
  return {
    dateTime: keywordScore(question, 'dateTime'),
    location: keywordScore(question, 'location'),
  }
}

export type TbdSuggestion = {
  field: TbdField
  value: string
  sourceQuestionTitle: string
  responseCount: number
}

type ResponseRow = { question_id: string; response: unknown }

function eligibleQuestions(questions: CustomQuestionConfig[]): CustomQuestionConfig[] {
  return questions.filter((q) => q.type === 'ranking' || q.type === 'single' || q.type === 'multiple')
}

// Highest keyword-score wins; ties broken by the survey's own question
// order (earlier wins), so the result is always deterministic.
function bestQuestionForField(questions: CustomQuestionConfig[], field: TbdField): CustomQuestionConfig | null {
  let best: { question: CustomQuestionConfig; score: number } | null = null
  for (const question of questions) {
    const score = classifyQuestion(question)[field]
    if (score <= 0) continue
    if (!best || score > best.score || (score === best.score && question.order < best.question.order)) {
      best = { question, score }
    }
  }
  return best?.question ?? null
}

// Returns null when there's no responses, or when the top spot is an exact
// tie -- a tie means there's no real winner to suggest, matching
// rankingInsight's own "no clear favorite" handling.
function winnerFor(question: CustomQuestionConfig, responseRows: ResponseRow[]): { label: string; responseCount: number } | null {
  const answers = responseRows.filter((row) => row.question_id === question.id).map((row) => row.response)
  const options = question.options ?? []

  if (question.type === 'ranking') {
    const { rankings, responseCount } = rankingWinners(options, answers)
    if (rankings.length === 0) return null
    const topScore = rankings[0].bordaScore
    if (rankings.filter((item) => item.bordaScore === topScore).length > 1) return null
    return { label: rankings[0].label, responseCount }
  }

  const counts = choiceCounts(options, answers)
  if (counts.length === 0) return null
  const topCount = counts[0].count
  if (counts.filter((item) => item.count === topCount).length > 1) return null
  return { label: counts[0].label, responseCount: answers.length }
}

export function computeTbdSuggestions(
  event: { event_date: string; venue: string | null; address: string | null },
  questions: CustomQuestionConfig[],
  responseRows: ResponseRow[]
): TbdSuggestion[] {
  const fields: TbdField[] = []
  if (isEventDateUndecided(event.event_date)) fields.push('dateTime')
  if (!event.venue?.trim() && !event.address?.trim()) fields.push('location')
  if (fields.length === 0) return []

  const candidates = eligibleQuestions(questions)
  const suggestions: TbdSuggestion[] = []

  for (const field of fields) {
    const question = bestQuestionForField(candidates, field)
    if (!question) continue
    const winner = winnerFor(question, responseRows)
    if (!winner || winner.responseCount < MIN_RESPONSES_FOR_SUGGESTION) continue

    suggestions.push({
      field,
      value: winner.label,
      sourceQuestionTitle: question.title,
      responseCount: winner.responseCount,
    })
  }

  return suggestions
}
