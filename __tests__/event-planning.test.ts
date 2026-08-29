import { buildPlanningPrompt, buildEventPlanningSchema, planningTextSegments, rankingInsight, validateRecommendations, rankingWinners, choiceCounts } from '@/lib/event-planning'
import { buildIntel } from '@/lib/intel'

describe('rankingWinners', () => {
  const options = [
    { value: 'sat', label: 'Saturday' },
    { value: 'sun', label: 'Sunday' },
  ]

  it('lets many 2nd-place picks outrank a lone 1st-place pick via Borda score', () => {
    // 4 options, so 2nd place is worth (4 - 1) = 3 points. Underdog finishes
    // 2nd in all 3 responses (3+3+3=9, zero first-choice votes); Leader
    // finishes 1st only once (4 points) and 3rd/last otherwise (8 total,
    // one first-choice vote). Underdog must still win on weighted score.
    const fourOptions = [
      { value: 'leader', label: 'Leader' },
      { value: 'underdog', label: 'Underdog' },
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
    ]
    const { rankings, responseCount } = rankingWinners(fourOptions, [
      ['leader', 'underdog', 'x'],
      ['x', 'underdog', 'leader'],
      ['y', 'underdog', 'leader', 'x'],
    ])
    expect(rankings[0]).toEqual({ label: 'Underdog', bordaScore: 9, firstChoiceVotes: 0 })
    expect(rankings[1]).toEqual({ label: 'Leader', bordaScore: 8, firstChoiceVotes: 1 })
    expect(responseCount).toBe(3)
  })

  it('excludes malformed/legacy response rows from both the score and the count', () => {
    const { rankings, responseCount } = rankingWinners(options, [
      ['sat', 'sun'],
      'not-an-array',
      [1, 2],
      null,
    ])
    expect(responseCount).toBe(1)
    expect(rankings).toEqual([
      { label: 'Saturday', bordaScore: 2, firstChoiceVotes: 1 },
      { label: 'Sunday', bordaScore: 1, firstChoiceVotes: 0 },
    ])
  })

  it('omits an option nobody ranked', () => {
    const { rankings } = rankingWinners(options, [['sat']])
    expect(rankings.map((r) => r.label)).toEqual(['Saturday'])
  })
})

describe('choiceCounts', () => {
  const options = [
    { value: 'garden', label: 'The Garden Room' },
    { value: 'loft', label: 'The Loft' },
  ]

  it('tallies single-value string responses and sorts descending', () => {
    expect(choiceCounts(options, ['garden', 'garden', 'loft'])).toEqual([
      { label: 'The Garden Room', count: 2 },
      { label: 'The Loft', count: 1 },
    ])
  })

  it('tallies multi-select array responses', () => {
    expect(choiceCounts(options, [['garden', 'loft'], ['garden']])).toEqual([
      { label: 'The Garden Room', count: 2 },
      { label: 'The Loft', count: 1 },
    ])
  })

  it('omits an option nobody selected', () => {
    expect(choiceCounts(options, ['garden'])).toEqual([{ label: 'The Garden Room', count: 1 }])
  })
})

describe('event planning insights', () => {
  it('explains a tied ranking instead of presenting an unexplained average', () => {
    expect(rankingInsight([
      { label: 'Wednesday', bordaScore: 6, firstChoiceVotes: 1 },
      { label: 'Thursday', bordaScore: 6, firstChoiceVotes: 1 },
      { label: 'Friday', bordaScore: 6, firstChoiceVotes: 1 },
    ], 3)).toBe('No clear favorite — Wednesday, Thursday, Friday are effectively tied.')
  })

  it('describes a clear ranking winner based on weighted score, not just first-choice votes', () => {
    expect(rankingInsight([
      { label: 'Thursday', bordaScore: 14, firstChoiceVotes: 4 },
      { label: 'Friday', bordaScore: 9, firstChoiceVotes: 1 },
    ], 5)).toBe('Thursday is the strongest overall choice based on weighted rankings across 5 responses.')
  })

  it('lets many second-place picks outrank a few first-place picks in the underlying score, independent of vote-count phrasing', () => {
    // Friday: three 2nd-place finishes among three options (3 pts each) = 9.
    // Thursday: one 1st-place finish (3 pts) = 3. Friday should win despite
    // having zero first-choice votes.
    expect(rankingInsight([
      { label: 'Friday', bordaScore: 9, firstChoiceVotes: 0 },
      { label: 'Thursday', bordaScore: 3, firstChoiceVotes: 1 },
    ], 3)).toBe('Friday is the strongest overall choice based on weighted rankings across 3 responses.')
  })

  it('does not send guest names in the aggregate table profile', () => {
    const prompt = buildPlanningPrompt({
      eventTitle: 'Dinner',
      intel: buildIntel([{ name: 'Private Guest', dietary: [], avoid: ['Nuts'], adventurousness: 50 }]),
      answers: [],
    })
    expect(prompt).not.toContain('Private Guest')
    expect(prompt).toContain('"label":"Nuts","count":1')
  })

  it('lists every event-specific question so the model can answer each exactly once', () => {
    const prompt = buildPlanningPrompt({
      eventTitle: 'Dinner',
      intel: buildIntel([]),
      answers: [
        { question: 'What time works best?', type: 'ranking', insight: 'x', evidence: [] },
        { question: 'Any drinks preference?', type: 'choice', insight: 'y', evidence: [] },
      ],
    })
    expect(prompt).toContain('1. What time works best?')
    expect(prompt).toContain('2. Any drinks preference?')
  })

  it('builds a schema requiring exactly one recommendation per question', () => {
    const schema = buildEventPlanningSchema(3)
    expect(schema.properties.recommendations.minItems).toBe(3)
    expect(schema.properties.recommendations.maxItems).toBe(3)
    expect(schema.properties.recommendations.items.required).toContain('question')
    expect(schema.properties.recommendations.items.required).toContain('actionHighlights')
    expect(schema.properties.recommendations.items.required).toContain('reasonHighlights')
  })

  it('asks the planning model to identify exact key entities for emphasis', () => {
    const prompt = buildPlanningPrompt({
      eventTitle: 'Dinner',
      intel: buildIntel([]),
      answers: [{ question: 'When and where?', type: 'text', insight: 'Friday at Krasi', evidence: [] }],
    })
    expect(prompt).toContain('NLP entity recognition')
    expect(prompt).toContain('dates, times, quantities, option names, people, and places')
  })
})

describe('planningTextSegments', () => {
  it('marks exact NLP-selected dates, times, people, and places for bold rendering', () => {
    expect(planningTextSegments(
      'Meet Marina at Krasi on Friday at 7:30 PM.',
      ['Marina', 'Krasi', 'Friday', '7:30 PM']
    )).toEqual([
      { text: 'Meet ', highlighted: false },
      { text: 'Marina', highlighted: true },
      { text: ' at ', highlighted: false },
      { text: 'Krasi', highlighted: true },
      { text: ' on ', highlighted: false },
      { text: 'Friday', highlighted: true },
      { text: ' at ', highlighted: false },
      { text: '7:30 PM', highlighted: true },
      { text: '.', highlighted: false },
    ])
  })

  it('ignores model-provided phrases that are not actually in the text', () => {
    expect(planningTextSegments('Choose Friday.', ['Saturday'])).toEqual([
      { text: 'Choose Friday.', highlighted: false },
    ])
  })
})

describe('validateRecommendations', () => {
  const answers = [
    { question: 'What time works best?', type: 'ranking' as const, insight: 'x', evidence: [] },
    { question: 'Any drinks preference?', type: 'choice' as const, insight: 'y', evidence: [] },
  ]

  it('keeps recommendations that match a real asked question', () => {
    const result = {
      overview: 'Here is what the table suggests.',
      recommendations: [
        { question: 'What time works best?', title: 'Set the time', action: 'Pick 7pm', reason: 'Most preferred.' },
        { question: 'Any drinks preference?', title: 'Set drinks', action: 'Offer mocktails', reason: 'Split preference.' },
      ],
    }
    expect(validateRecommendations(result, answers)).toEqual(result)
  })

  it('drops a recommendation that does not match any asked question, e.g. a fabricated dietary-safety category', () => {
    const result = {
      overview: 'Here is what the table suggests.',
      recommendations: [
        { question: 'What time works best?', title: 'Set the time', action: 'Pick 7pm', reason: 'Most preferred.' },
        { question: 'Manage Dietary Safety', title: 'Avoid eggs', action: 'Skip eggs', reason: 'Not an asked question.' },
      ],
    }
    expect(validateRecommendations(result, answers).recommendations).toEqual([
      { question: 'What time works best?', title: 'Set the time', action: 'Pick 7pm', reason: 'Most preferred.' },
    ])
  })
})
