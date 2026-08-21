import {
  classifyQuestion,
  computeTbdSuggestions,
  MIN_RESPONSES_FOR_SUGGESTION,
} from '@/lib/event-tbd-suggestions'
import type { CustomQuestionConfig } from '@/lib/questionnaire'

function question(overrides: Partial<CustomQuestionConfig> & { id: string; title: string }): CustomQuestionConfig {
  return {
    kind: 'custom',
    type: 'single',
    order: 0,
    ...overrides,
  } as CustomQuestionConfig
}

describe('classifyQuestion', () => {
  it('does not match "day" as a substring inside "today"', () => {
    const score = classifyQuestion({ title: "What do you think of today's menu?" })
    expect(score.dateTime).toBe(0)
  })

  it('scores more distinct keyword hits higher than one', () => {
    const rich = classifyQuestion({ title: 'What day and time works, and when should we meet?' })
    const sparse = classifyQuestion({ title: 'When are you free?' })
    expect(rich.dateTime).toBe(3) // day, time, when
    expect(sparse.dateTime).toBe(1)
    expect(rich.dateTime).toBeGreaterThan(sparse.dateTime)
  })

  it('scores the location keyword set independently of the date/time set', () => {
    const score = classifyQuestion({ title: 'What venue or restaurant location should we pick?' })
    expect(score.location).toBe(3) // venue, restaurant, location
    expect(score.dateTime).toBe(0)
  })
})

describe('computeTbdSuggestions', () => {
  const DECIDED_DATE = '2026-09-01T19:00:00.000Z'
  const UNDECIDED_DATE = '9999-12-31T12:00:00.000Z'

  it('returns nothing at all for a fully-set event, even with matching questions and plenty of responses', () => {
    const questions = [
      question({ id: 'q1', title: 'What day works?', type: 'ranking', options: [{ value: 'a', label: 'Sat' }, { value: 'b', label: 'Sun' }] }),
    ]
    const responseRows = [
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['a', 'b'] },
    ]
    const result = computeTbdSuggestions({ event_date: DECIDED_DATE, venue: 'The Garden Room', address: '1 Main St' }, questions, responseRows)
    expect(result).toEqual([])
  })

  it('never produces a suggestion from a text or slider question, even when its title matches the keywords', () => {
    const questions = [
      question({ id: 'q1', title: 'When is a good time for you?', type: 'text' }),
      question({ id: 'q2', title: 'How excited are you about the date?', type: 'slider' }),
    ]
    const responseRows = [
      { question_id: 'q1', response: 'Saturday works' },
      { question_id: 'q1', response: 'Saturday works' },
      { question_id: 'q1', response: 'Saturday works' },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, responseRows)
    expect(result).toEqual([])
  })

  it('requires at least 3 responses to the matched question before suggesting anything', () => {
    const questions = [
      question({ id: 'q1', title: 'What day works best?', type: 'ranking', options: [{ value: 'a', label: 'Saturday' }, { value: 'b', label: 'Sunday' }] }),
    ]
    const twoResponses = [
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['a', 'b'] },
    ]
    expect(computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, twoResponses)).toEqual([])

    const threeResponses = [...twoResponses, { question_id: 'q1', response: ['a', 'b'] }]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, threeResponses)
    expect(result).toHaveLength(1)
    expect(result[0].responseCount).toBe(MIN_RESPONSES_FOR_SUGGESTION)
  })

  it('suppresses the suggestion on an exact tie for the top ranking spot', () => {
    const questions = [
      question({
        id: 'q1',
        title: 'What day works best?',
        type: 'ranking',
        options: [{ value: 'a', label: 'Saturday' }, { value: 'b', label: 'Sunday' }],
      }),
    ]
    // 2 options, so bordaScore is just 2x firstChoiceVotes + responseCount
    // (see rankingWinners tests) -- an even 2-2 split of first choice votes
    // across 4 responses always ties: a=2+1+2+1=6, b=1+2+1+2=6.
    const tiedRows = [
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['b', 'a'] },
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['b', 'a'] },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, tiedRows)
    expect(result).toEqual([])
  })

  it('suppresses the suggestion on an exact tie for the top choice count', () => {
    const questions = [
      question({
        id: 'q1',
        title: 'Where should we host?',
        type: 'single',
        options: [{ value: 'a', label: 'The Garden Room' }, { value: 'b', label: 'The Loft' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'b' },
      { question_id: 'q1', response: 'b' },
    ]
    const result = computeTbdSuggestions({ event_date: DECIDED_DATE, venue: null, address: null }, questions, responseRows)
    expect(result).toEqual([])
  })

  it('picks the higher-scoring question for a field even when it comes later in question order', () => {
    const questions = [
      question({ id: 'q1', title: 'Where should we go?', type: 'single', order: 0, options: [{ value: 'a', label: 'Q1 Answer' }] }),
      question({
        id: 'q2',
        title: 'What venue or restaurant location should we pick?',
        type: 'single',
        order: 1,
        options: [{ value: 'b', label: 'Q2 Answer' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'a' },
      { question_id: 'q2', response: 'b' },
      { question_id: 'q2', response: 'b' },
      { question_id: 'q2', response: 'b' },
    ]
    const result = computeTbdSuggestions({ event_date: DECIDED_DATE, venue: null, address: null }, questions, responseRows)
    expect(result).toEqual([
      { field: 'location', value: 'Q2 Answer', sourceQuestionTitle: 'What venue or restaurant location should we pick?', responseCount: 3 },
    ])
  })

  it('breaks an equal keyword-score tie by earlier question order', () => {
    const questions = [
      question({ id: 'q1', title: 'Where should we go?', type: 'single', order: 0, options: [{ value: 'a', label: 'Q1 Answer' }] }),
      question({ id: 'q2', title: 'Any preference on venue?', type: 'single', order: 1, options: [{ value: 'b', label: 'Q2 Answer' }] }),
    ]
    const responseRows = [
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'a' },
      { question_id: 'q1', response: 'a' },
      { question_id: 'q2', response: 'b' },
      { question_id: 'q2', response: 'b' },
      { question_id: 'q2', response: 'b' },
    ]
    const result = computeTbdSuggestions({ event_date: DECIDED_DATE, venue: null, address: null }, questions, responseRows)
    expect(result).toEqual([
      { field: 'location', value: 'Q1 Answer', sourceQuestionTitle: 'Where should we go?', responseCount: 3 },
    ])
  })

  it('never invents a real Date value -- the suggestion is always the raw guest-facing label, even for the date/time field', () => {
    const questions = [
      question({
        id: 'q1',
        title: 'What day works best?',
        type: 'ranking',
        options: [{ value: 'a', label: 'Saturday, August 30 at 7pm' }, { value: 'b', label: 'Sunday, August 31 at 6pm' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['a', 'b'] },
      { question_id: 'q1', response: ['b', 'a'] },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, responseRows)
    expect(result).toEqual([
      {
        field: 'dateTime',
        value: 'Saturday, August 30 at 7pm',
        sourceQuestionTitle: 'What day works best?',
        responseCount: 3,
      },
    ])
  })

  it('combines two separate date and time questions into one suggestion, instead of one crowding out the other', () => {
    const questions = [
      question({
        id: 'q_date', title: 'Which date works?', type: 'ranking', order: 0,
        options: [{ value: 'a', label: 'Thursday' }, { value: 'b', label: 'Friday' }],
      }),
      question({
        id: 'q_time', title: 'Which time works?', type: 'ranking', order: 1,
        options: [{ value: 'x', label: '6pm' }, { value: 'y', label: '9pm' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_time', response: ['y', 'x'] },
      { question_id: 'q_time', response: ['y', 'x'] },
      { question_id: 'q_time', response: ['y', 'x'] },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, responseRows)
    expect(result).toEqual([
      {
        field: 'dateTime',
        value: 'Thursday at 9pm',
        sourceQuestionTitle: '"Which date works?" and "Which time works?"',
        responseCount: 3,
      },
    ])
  })

  it('shows one question once, not duplicated, when a single question already covers both date and time', () => {
    const questions = [
      question({
        id: 'q_both', title: 'What date and time works?', type: 'ranking', order: 0,
        options: [{ value: 'a', label: 'Thursday at 9pm' }, { value: 'b', label: 'Friday at 6pm' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q_both', response: ['a', 'b'] },
      { question_id: 'q_both', response: ['a', 'b'] },
      { question_id: 'q_both', response: ['a', 'b'] },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, responseRows)
    expect(result).toEqual([
      {
        field: 'dateTime',
        value: 'Thursday at 9pm',
        sourceQuestionTitle: 'What date and time works?',
        responseCount: 3,
      },
    ])
  })

  it('still shows the date part alone when the separate time question is below the response floor', () => {
    const questions = [
      question({
        id: 'q_date', title: 'Which date works?', type: 'ranking', order: 0,
        options: [{ value: 'a', label: 'Thursday' }, { value: 'b', label: 'Friday' }],
      }),
      question({
        id: 'q_time', title: 'Which time works?', type: 'ranking', order: 1,
        options: [{ value: 'x', label: '6pm' }, { value: 'y', label: '9pm' }],
      }),
    ]
    const responseRows = [
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_date', response: ['a', 'b'] },
      { question_id: 'q_time', response: ['y', 'x'] },
      { question_id: 'q_time', response: ['y', 'x'] },
    ]
    const result = computeTbdSuggestions({ event_date: UNDECIDED_DATE, venue: 'x', address: null }, questions, responseRows)
    expect(result).toEqual([
      { field: 'dateTime', value: 'Thursday', sourceQuestionTitle: 'Which date works?', responseCount: 3 },
    ])
  })
})
