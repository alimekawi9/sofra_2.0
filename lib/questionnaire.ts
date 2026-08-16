import { DIETARY, NOGOS, FLAVORS } from './theme'
import { PROTEIN_PREFERENCE_OPTIONS } from './protein-preferences'

// The five existing canonical preference questions. These map 1:1 to fixed
// columns on public.taste_profiles (dietary, avoid, protein_preferences,
// flavor_preference, adventurousness) -- a host can never add, remove, or
// retarget a canonical question to a different underlying field.
export type CanonicalKey = 'dietary' | 'avoid' | 'protein' | 'flavor' | 'adventurousness'

export const CANONICAL_KEYS: CanonicalKey[] = ['dietary', 'avoid', 'protein', 'flavor', 'adventurousness']

export interface CanonicalQuestionConfig {
  id: CanonicalKey
  kind: 'canonical'
  canonicalKey: CanonicalKey
  title?: string
  helperText?: string
  // Maps the untouched canonical stored value -> a host-chosen display
  // label. The stored value is never a key in reverse -- renaming a label
  // never changes what gets written to taste_profiles.
  optionLabels?: Record<string, string>
  hiddenOptionValues?: string[]
  // Display-only endpoint labels for the one canonical slider question
  // (adventurousness). The underlying 0-100 scale/persistence never changes.
  sliderMinLabel?: string
  sliderMaxLabel?: string
  order: number
}

export type CustomQuestionType = 'single' | 'multiple' | 'ranking' | 'text' | 'slider'

export interface CustomOption {
  value: string
  label: string
}

export const DEFAULT_SLIDER_STEPS = 5
export const MIN_SLIDER_STEPS = 2
export const MAX_SLIDER_STEPS = 10

export interface CustomQuestionConfig {
  id: string
  kind: 'custom'
  type: CustomQuestionType
  title: string
  helperText?: string
  options?: CustomOption[]
  maxSelections?: number
  // Slider-only. Answers are stored as a 1-based numeric position
  // (1..sliderSteps); the labels below are display metadata only.
  sliderMinLabel?: string
  sliderMaxLabel?: string
  sliderSteps?: number
  order: number
}

export type QuestionConfig = CanonicalQuestionConfig | CustomQuestionConfig

export interface QuestionnaireConfig {
  header?: string
  questions: QuestionConfig[]
}

export const DEFAULT_QUESTIONNAIRE_HEADER = "WHAT'S ON YOUR MIND,\nBEFORE IT'S ON YOUR PLATE"

export const CANONICAL_DEFAULTS: Record<
  CanonicalKey,
  { title: string; helperText?: string; sliderMinLabel?: string; sliderMaxLabel?: string }
> = {
  dietary: { title: 'ANY LANE TO STAY IN?' },
  avoid: { title: 'ANYTHING YOU AVOID?' },
  protein: { title: 'WHAT SOUNDS BEST TONIGHT?', helperText: 'Choose up to two.' },
  flavor: { title: 'FLAVOURS YOU LEAN TOWARDS', helperText: 'Choose up to three.' },
  adventurousness: { title: 'HOW BRAVE IS YOUR PALATE?', sliderMinLabel: 'THE USUAL', sliderMaxLabel: 'ANYTHING ONCE' },
}

export const DEFAULT_QUESTIONNAIRE: QuestionnaireConfig = {
  header: DEFAULT_QUESTIONNAIRE_HEADER,
  questions: CANONICAL_KEYS.map((canonicalKey, order) => ({
    id: canonicalKey,
    kind: 'canonical',
    canonicalKey,
    order,
  })),
}

// Canonical stored value -> canonical default label, per question. For
// dietary/avoid/flavor the stored value already IS the label, so value and
// label are identical; protein is the one question with a separate slug.
export function canonicalOptionsFor(key: CanonicalKey): CustomOption[] {
  switch (key) {
    case 'dietary':
      return DIETARY.map((value) => ({ value, label: value }))
    case 'avoid':
      return NOGOS.map((value) => ({ value, label: value }))
    case 'protein':
      return PROTEIN_PREFERENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
    case 'flavor':
      return FLAVORS.map((value) => ({ value, label: value }))
    case 'adventurousness':
      return []
  }
}

export function resolveCanonicalTitle(q: CanonicalQuestionConfig): string {
  return q.title?.trim() || CANONICAL_DEFAULTS[q.canonicalKey].title
}

export function resolveCanonicalHelperText(q: CanonicalQuestionConfig): string | undefined {
  if (q.helperText !== undefined) return q.helperText.trim() || undefined
  return CANONICAL_DEFAULTS[q.canonicalKey].helperText
}

export function resolveCanonicalSliderMinLabel(q: CanonicalQuestionConfig): string {
  return q.sliderMinLabel?.trim() || CANONICAL_DEFAULTS[q.canonicalKey].sliderMinLabel || ''
}

export function resolveCanonicalSliderMaxLabel(q: CanonicalQuestionConfig): string {
  return q.sliderMaxLabel?.trim() || CANONICAL_DEFAULTS[q.canonicalKey].sliderMaxLabel || ''
}

// `defaultLabel` must be the option's own canonical default label (from
// canonicalOptionsFor), NOT canonicalValue -- for protein, value ('beef_lamb')
// and label ('Beef or lamb') differ, so falling back to the value would leak
// the raw stored slug into the guest-facing UI.
export function resolveCanonicalOptionLabel(
  q: CanonicalQuestionConfig,
  canonicalValue: string,
  defaultLabel: string
): string {
  return q.optionLabels?.[canonicalValue]?.trim() || defaultLabel
}

export function sortedQuestions(config: QuestionnaireConfig): QuestionConfig[] {
  return [...config.questions].sort((a, b) => a.order - b.order)
}

export function isCanonical(q: QuestionConfig): q is CanonicalQuestionConfig {
  return q.kind === 'canonical'
}

export function isCustom(q: QuestionConfig): q is CustomQuestionConfig {
  return q.kind === 'custom'
}

export function isCanonicalQuestionCustomized(q: CanonicalQuestionConfig): boolean {
  return Boolean(
    q.title?.trim() ||
    q.helperText?.trim() ||
    q.sliderMinLabel?.trim() ||
    q.sliderMaxLabel?.trim() ||
    (q.optionLabels && Object.keys(q.optionLabels).length > 0) ||
    (q.hiddenOptionValues && q.hiddenOptionValues.length > 0)
  )
}

export function customQuestions(config: QuestionnaireConfig): CustomQuestionConfig[] {
  return sortedQuestions(config).filter(isCustom)
}

const TOPIC_TERMS: Record<CanonicalKey, string[]> = {
  dietary: ['diet', 'dietary', 'vegetarian', 'vegan', 'pescatarian', 'pork', 'dairy'],
  avoid: ['avoid', 'allergy', 'allergies', 'allergen', 'cannot eat', 'can not eat', 'intolerance'],
  protein: ['protein', 'meat', 'chicken', 'fish', 'seafood', 'beef', 'lamb', 'main ingredient'],
  flavor: ['flavor', 'flavour', 'taste', 'spicy', 'savory', 'sweet', 'tangy'],
  adventurousness: ['adventurous', 'adventure', 'brave', 'familiar', 'experimental', 'try something new'],
}

export function inferCanonicalTopic(title: string): CanonicalKey | null {
  const normalized = title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  let best: { key: CanonicalKey; score: number } | null = null
  for (const key of CANONICAL_KEYS) {
    const score = TOPIC_TERMS[key].reduce((total, term) => total + (normalized.includes(term) ? term.split(' ').length : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { key, score }
  }
  return best?.key ?? null
}

export function relevantCanonicalTopics(config: QuestionnaireConfig): CanonicalKey[] {
  const topics = new Set<CanonicalKey>()
  for (const question of config.questions) {
    if (isCanonical(question)) topics.add(question.canonicalKey)
    else {
      const inferred = inferCanonicalTopic(question.title)
      if (inferred) topics.add(inferred)
    }
  }
  return CANONICAL_KEYS.filter(key => topics.has(key))
}

// True only when nothing a host could see as "customized" has happened --
// used to decide whether the guest RSVP flow needs to load this config at
// all, or can behave exactly as it does today.
export function isDefaultQuestionnaire(config: QuestionnaireConfig | null | undefined): boolean {
  if (!config) return true
  if (config.questions.some(isCustom)) return false
  if (config.header !== undefined && config.header.trim() !== DEFAULT_QUESTIONNAIRE_HEADER) return false
  const canonical = config.questions.filter(isCanonical)
  if (canonical.length !== CANONICAL_KEYS.length) return false
  return canonical.every(
    (q) =>
      !isCanonicalQuestionCustomized(q)
  )
}

function slugify(label: string, fallback: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || fallback
}

// Produces a value unique within the given question's existing options,
// stable once created (renaming a label never changes `value`).
export function generateOptionValue(label: string, existing: readonly CustomOption[]): string {
  const base = slugify(label, `option_${existing.length + 1}`)
  const taken = new Set(existing.map((o) => o.value))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export function generateQuestionId(): string {
  return `q_${Math.random().toString(36).slice(2, 10)}`
}

// Section 15 safety rules. Returns a flat list of human-readable problems;
// empty means the config is safe to save.
export function validateQuestionnaire(config: QuestionnaireConfig): string[] {
  const errors: string[] = []
  if (!(config.header ?? DEFAULT_QUESTIONNAIRE_HEADER).trim()) errors.push('The questionnaire header cannot be blank.')

  for (const q of config.questions) {
    if (isCustom(q)) {
      const label = q.title || 'Untitled question'
      if (!q.title.trim()) {
        errors.push('Every question needs a title.')
      }

      if (q.type === 'single' || q.type === 'multiple' || q.type === 'ranking') {
        const options = q.options ?? []
        if (options.length === 0) {
          errors.push(`"${label}" needs at least one answer option.`)
        }
        const labels = options.map((o) => o.label.trim().toLowerCase())
        if (labels.some((l) => l.length === 0)) {
          errors.push(`"${label}" has a blank answer option.`)
        }
        const duplicates = labels.filter((l, i) => l.length > 0 && labels.indexOf(l) !== i)
        if (duplicates.length > 0) {
          errors.push(`"${label}" has duplicate answer options.`)
        }
        if (q.type === 'multiple' && q.maxSelections !== undefined) {
          if (q.maxSelections < 1) {
            errors.push(`"${label}" needs to allow at least 1 selection.`)
          } else if (q.maxSelections > options.length) {
            errors.push(`"${label}" allows more selections than it has options.`)
          }
        }
      } else if (q.type === 'slider') {
        const steps = q.sliderSteps ?? DEFAULT_SLIDER_STEPS
        if (steps < MIN_SLIDER_STEPS) {
          errors.push(`"${label}" needs at least ${MIN_SLIDER_STEPS} slider positions.`)
        }
        if (!q.sliderMinLabel?.trim()) {
          errors.push(`"${label}" needs a label for the low end of the slider.`)
        }
        if (!q.sliderMaxLabel?.trim()) {
          errors.push(`"${label}" needs a label for the high end of the slider.`)
        }
      }
    }
    // Canonical questions fall back to the Sofra default title/helper text
    // whenever the override is blank, so an empty override is never invalid.
    // Canonical sliders (adventurousness) have no editable step count at
    // all -- scoring depends on the fixed 0-100 scale, so there's nothing
    // to validate there beyond the label fallback already handled above.
  }

  return errors
}
