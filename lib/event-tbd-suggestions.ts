import type { CustomQuestionConfig } from './questionnaire'
import { rankingWinners, choiceCounts } from './event-planning'
import { isEventDateUndecided } from './event-date'

export type TbdField = 'dateTime' | 'location'

// Matches the guest-only RSVP readiness convention: fewer responses than
// this is treated as too little signal to act on.
export const MIN_RESPONSES_FOR_SUGGESTION = 3

// "date" and "time" are scored as two independent sub-concerns, not one
// merged bucket -- a real questionnaire often asks them as two separate
// questions (e.g. "Which date works?" / "Which time works?"), and each one
// deserves its own winner rather than the two competing for a single slot
// where only one could ever win.
const DATE_KEYWORDS = ['date', 'day', 'when', 'weekend']
const TIME_KEYWORDS = ['time', 'schedule', 'morning', 'afternoon', 'evening']
const LOCATION_KEYWORDS = ['where', 'location', 'venue', 'restaurant', 'address', 'place']

function questionText(question: Pick<CustomQuestionConfig, 'title' | 'helperText'>): string {
  return `${question.title} ${question.helperText ?? ''}`.toLowerCase()
}

function keywordScore(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => new RegExp(`\\b${keyword}\\b`).test(text)).length
}

// General-purpose classifier: does this question relate to date/time or
// location at all, and how strongly. dateTime is the sum of the date and
// time sub-scores -- this is a coarse signal only; winner selection below
// scores date and time independently so one doesn't crowd out the other.
// Only a question's title/helper text are scanned, never its option labels
// -- those are the candidate answers (e.g. "Saturday Aug 30, 7pm"), not the
// topic of the question.
export function classifyQuestion(question: Pick<CustomQuestionConfig, 'title' | 'helperText'>): Record<TbdField, number> {
  const text = questionText(question)
  return {
    dateTime: keywordScore(text, DATE_KEYWORDS) + keywordScore(text, TIME_KEYWORDS),
    location: keywordScore(text, LOCATION_KEYWORDS),
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
function bestQuestionForKeywords(questions: CustomQuestionConfig[], keywords: string[]): CustomQuestionConfig | null {
  let best: { question: CustomQuestionConfig; score: number } | null = null
  for (const question of questions) {
    const score = keywordScore(questionText(question), keywords)
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

type AspectResult = { question: CustomQuestionConfig; winner: { label: string; responseCount: number } }

// Resolves one sub-concern (date, time, or location) independently: finds
// its best-matching question, then applies the same tie/floor rules as
// before. Returns null if nothing qualifies -- a missing aspect never blocks
// a different aspect that did resolve.
function resolveAspect(
  questions: CustomQuestionConfig[],
  keywords: string[],
  responseRows: ResponseRow[]
): AspectResult | null {
  const question = bestQuestionForKeywords(questions, keywords)
  if (!question) return null
  const winner = winnerFor(question, responseRows)
  if (!winner || winner.responseCount < MIN_RESPONSES_FOR_SUGGESTION) return null
  return { question, winner }
}

// Combines an independently-resolved date answer and time answer into the
// one suggestion the (single, combined) date/time field can show. If both
// come from the very same question (one question already covers both,
// e.g. "What date and time works?"), it's shown once, not duplicated.
function combineDateTime(date: AspectResult | null, time: AspectResult | null): TbdSuggestion | null {
  if (!date && !time) return null
  if (date && time && date.question.id !== time.question.id) {
    return {
      field: 'dateTime',
      value: `${date.winner.label} at ${time.winner.label}`,
      sourceQuestionTitle: `"${date.question.title}" and "${time.question.title}"`,
      responseCount: Math.min(date.winner.responseCount, time.winner.responseCount),
    }
  }
  const only = date ?? time!
  return {
    field: 'dateTime',
    value: only.winner.label,
    sourceQuestionTitle: only.question.title,
    responseCount: only.winner.responseCount,
  }
}

export function computeTbdSuggestions(
  event: { event_date: string; venue: string | null; address: string | null },
  questions: CustomQuestionConfig[],
  responseRows: ResponseRow[]
): TbdSuggestion[] {
  const needsDateTime = isEventDateUndecided(event.event_date)
  const needsLocation = !event.venue?.trim() && !event.address?.trim()
  if (!needsDateTime && !needsLocation) return []

  const candidates = eligibleQuestions(questions)
  const suggestions: TbdSuggestion[] = []

  if (needsDateTime) {
    const dateTime = combineDateTime(
      resolveAspect(candidates, DATE_KEYWORDS, responseRows),
      resolveAspect(candidates, TIME_KEYWORDS, responseRows)
    )
    if (dateTime) suggestions.push(dateTime)
  }

  if (needsLocation) {
    const location = resolveAspect(candidates, LOCATION_KEYWORDS, responseRows)
    if (location) {
      suggestions.push({
        field: 'location',
        value: location.winner.label,
        sourceQuestionTitle: location.question.title,
        responseCount: location.winner.responseCount,
      })
    }
  }

  return suggestions
}
