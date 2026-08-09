import {
  DEFAULT_QUESTIONNAIRE,
  CANONICAL_KEYS,
  CANONICAL_DEFAULTS,
  canonicalOptionsFor,
  resolveCanonicalTitle,
  resolveCanonicalHelperText,
  resolveCanonicalOptionLabel,
  isDefaultQuestionnaire,
  validateQuestionnaire,
  generateOptionValue,
  sortedQuestions,
  type CanonicalQuestionConfig,
  type CustomQuestionConfig,
  type QuestionnaireConfig,
} from '@/lib/questionnaire'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import { PROTEIN_PREFERENCE_OPTIONS } from '@/lib/protein-preferences'

describe('DEFAULT_QUESTIONNAIRE', () => {
  it('has exactly the five canonical questions, in order, with no overrides', () => {
    expect(DEFAULT_QUESTIONNAIRE.questions).toHaveLength(5)
    expect(DEFAULT_QUESTIONNAIRE.questions.map((q) => q.kind)).toEqual(Array(5).fill('canonical'))
    expect(sortedQuestions(DEFAULT_QUESTIONNAIRE).map((q) => (q as CanonicalQuestionConfig).canonicalKey)).toEqual(
      CANONICAL_KEYS
    )
  })

  it('is recognized as the default questionnaire', () => {
    expect(isDefaultQuestionnaire(DEFAULT_QUESTIONNAIRE)).toBe(true)
  })

  it('null/undefined config counts as default (guest sees today\'s behavior with no saved row)', () => {
    expect(isDefaultQuestionnaire(null)).toBe(true)
    expect(isDefaultQuestionnaire(undefined)).toBe(true)
  })
})

describe('canonical option resolution', () => {
  it('dietary/avoid/flavor canonical options use the raw stored value as both value and label', () => {
    expect(canonicalOptionsFor('dietary')).toEqual(DIETARY.map((v) => ({ value: v, label: v })))
    expect(canonicalOptionsFor('avoid')).toEqual(NOGOS.map((v) => ({ value: v, label: v })))
    expect(canonicalOptionsFor('flavor')).toEqual(FLAVORS.map((v) => ({ value: v, label: v })))
  })

  it('protein canonical options keep value and label distinct', () => {
    const options = canonicalOptionsFor('protein')
    expect(options).toEqual(PROTEIN_PREFERENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })))
    expect(options.find((o) => o.value === 'beef_lamb')?.label).toBe('Beef or lamb')
  })

  it('adventurousness has no options (it is a slider)', () => {
    expect(canonicalOptionsFor('adventurousness')).toEqual([])
  })

  it('resolveCanonicalTitle falls back to the Sofra default when unset or blank', () => {
    const q: CanonicalQuestionConfig = { id: 'dietary', kind: 'canonical', canonicalKey: 'dietary', order: 0 }
    expect(resolveCanonicalTitle(q)).toBe(CANONICAL_DEFAULTS.dietary.title)
    expect(resolveCanonicalTitle({ ...q, title: '   ' })).toBe(CANONICAL_DEFAULTS.dietary.title)
    expect(resolveCanonicalTitle({ ...q, title: 'KEEP IT DAIRY-FREE?' })).toBe('KEEP IT DAIRY-FREE?')
  })

  it('resolveCanonicalHelperText falls back to the Sofra default, distinguishing unset from explicitly cleared', () => {
    const q: CanonicalQuestionConfig = { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 }
    expect(resolveCanonicalHelperText(q)).toBe(CANONICAL_DEFAULTS.protein.helperText)
    expect(resolveCanonicalHelperText({ ...q, helperText: 'Pick two favorites.' })).toBe('Pick two favorites.')
  })

  it('resolveCanonicalOptionLabel falls back to the canonical default LABEL, never the raw value', () => {
    const q: CanonicalQuestionConfig = { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 }
    // No override: must return the real label ("Beef or lamb"), not the slug ("beef_lamb").
    expect(resolveCanonicalOptionLabel(q, 'beef_lamb', 'Beef or lamb')).toBe('Beef or lamb')
  })

  it('resolveCanonicalOptionLabel uses the host override when present, never mutating the raw value', () => {
    const q: CanonicalQuestionConfig = {
      id: 'dietary',
      kind: 'canonical',
      canonicalKey: 'dietary',
      order: 0,
      optionLabels: { 'No dairy': 'KEEP IT DAIRY-FREE' },
    }
    expect(resolveCanonicalOptionLabel(q, 'No dairy', 'No dairy')).toBe('KEEP IT DAIRY-FREE')
    // Untouched options still resolve to their own default label.
    expect(resolveCanonicalOptionLabel(q, 'Vegan', 'Vegan')).toBe('Vegan')
  })
})

describe('isDefaultQuestionnaire', () => {
  it('is false once any canonical title/helper/optionLabel is customized', () => {
    const config: QuestionnaireConfig = {
      questions: DEFAULT_QUESTIONNAIRE.questions.map((q) =>
        q.kind === 'canonical' && q.canonicalKey === 'dietary' ? { ...q, title: 'ANY LANE?' } : q
      ),
    }
    expect(isDefaultQuestionnaire(config)).toBe(false)
  })

  it('is false once a custom question exists', () => {
    const custom: CustomQuestionConfig = { id: 'c1', kind: 'custom', type: 'text', title: 'Craving anything?', order: 5 }
    const config: QuestionnaireConfig = { questions: [...DEFAULT_QUESTIONNAIRE.questions, custom] }
    expect(isDefaultQuestionnaire(config)).toBe(false)
  })

  it('is false if a canonical question is missing', () => {
    const config: QuestionnaireConfig = { questions: DEFAULT_QUESTIONNAIRE.questions.slice(1) }
    expect(isDefaultQuestionnaire(config)).toBe(false)
  })
})

describe('generateOptionValue', () => {
  it('slugifies the label', () => {
    expect(generateOptionValue('Very Adventurous', [])).toBe('very_adventurous')
  })

  it('avoids collisions with existing option values', () => {
    const existing = [{ value: 'very_adventurous', label: 'Very Adventurous' }]
    expect(generateOptionValue('Very Adventurous', existing)).toBe('very_adventurous_2')
  })

  it('falls back to a positional name for an empty label', () => {
    expect(generateOptionValue('', [])).toBe('option_1')
  })
})

describe('validateQuestionnaire', () => {
  function withCustom(question: CustomQuestionConfig): QuestionnaireConfig {
    return { questions: [...DEFAULT_QUESTIONNAIRE.questions, question] }
  }

  it('passes for the untouched default', () => {
    expect(validateQuestionnaire(DEFAULT_QUESTIONNAIRE)).toEqual([])
  })

  it('requires all five canonical questions to remain present', () => {
    const config: QuestionnaireConfig = { questions: DEFAULT_QUESTIONNAIRE.questions.slice(1) }
    const errors = validateQuestionnaire(config)
    expect(errors.some((e) => e.includes('required'))).toBe(true)
  })

  it('rejects a blank custom question title', () => {
    const errors = validateQuestionnaire(
      withCustom({ id: 'c1', kind: 'custom', type: 'text', title: '  ', order: 5 })
    )
    expect(errors.some((e) => e.includes('title'))).toBe(true)
  })

  it('rejects a single/multiple choice question with zero options', () => {
    const errors = validateQuestionnaire(
      withCustom({ id: 'c1', kind: 'custom', type: 'single', title: 'Pick one', order: 5, options: [] })
    )
    expect(errors.some((e) => e.includes('at least one'))).toBe(true)
  })

  it('rejects a blank answer option', () => {
    const errors = validateQuestionnaire(
      withCustom({
        id: 'c1', kind: 'custom', type: 'single', title: 'Pick one', order: 5,
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: '  ' }],
      })
    )
    expect(errors.some((e) => e.includes('blank'))).toBe(true)
  })

  it('rejects duplicate answer options (case-insensitive)', () => {
    const errors = validateQuestionnaire(
      withCustom({
        id: 'c1', kind: 'custom', type: 'single', title: 'Pick one', order: 5,
        options: [{ value: 'a', label: 'Yes' }, { value: 'b', label: 'yes' }],
      })
    )
    expect(errors.some((e) => e.includes('duplicate'))).toBe(true)
  })

  it('rejects max selections greater than the number of options', () => {
    const errors = validateQuestionnaire(
      withCustom({
        id: 'c1', kind: 'custom', type: 'multiple', title: 'Pick some', order: 5,
        options: [{ value: 'a', label: 'A' }], maxSelections: 3,
      })
    )
    expect(errors.some((e) => e.includes('more selections than'))).toBe(true)
  })

  it('rejects max selections below 1', () => {
    const errors = validateQuestionnaire(
      withCustom({
        id: 'c1', kind: 'custom', type: 'multiple', title: 'Pick some', order: 5,
        options: [{ value: 'a', label: 'A' }], maxSelections: 0,
      })
    )
    expect(errors.some((e) => e.includes('at least 1'))).toBe(true)
  })

  it('does not require options for a text question', () => {
    const errors = validateQuestionnaire(
      withCustom({ id: 'c1', kind: 'custom', type: 'text', title: 'Anything else?', order: 5 })
    )
    expect(errors).toEqual([])
  })

  it('allows a blank canonical title/helper override (falls back to default, not an error)', () => {
    const config: QuestionnaireConfig = {
      questions: DEFAULT_QUESTIONNAIRE.questions.map((q) =>
        q.kind === 'canonical' && q.canonicalKey === 'dietary' ? { ...q, title: '' } : q
      ),
    }
    expect(validateQuestionnaire(config)).toEqual([])
  })
})
