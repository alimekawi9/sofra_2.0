import { buildPlanningPrompt, rankingInsight } from '@/lib/event-planning'
import { buildIntel } from '@/lib/intel'

describe('event planning insights', () => {
  it('explains a tied ranking instead of presenting an unexplained average', () => {
    expect(rankingInsight([
      { label: 'Wednesday', averageRank: 2, firstChoiceVotes: 1 },
      { label: 'Thursday', averageRank: 2, firstChoiceVotes: 1 },
      { label: 'Friday', averageRank: 2, firstChoiceVotes: 1 },
    ], 3)).toBe('No clear favorite — Wednesday, Thursday, Friday are effectively tied.')
  })

  it('describes a clear ranking winner using first-choice share', () => {
    expect(rankingInsight([
      { label: 'Thursday', averageRank: 1.4, firstChoiceVotes: 4 },
      { label: 'Friday', averageRank: 2.2, firstChoiceVotes: 1 },
    ], 5)).toBe('Thursday is the strongest overall choice, with 80% ranking it first.')
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
})

