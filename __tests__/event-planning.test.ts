import { buildPlanningPrompt, buildEventPlanningSchema, rankingInsight, validateRecommendations } from '@/lib/event-planning'
import { buildIntel } from '@/lib/intel'

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
