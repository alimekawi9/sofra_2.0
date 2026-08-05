import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DISH_ROLES } from '../lib/dish-presets'
import { DESCRIPTIVE_TAG_GROUPS } from '../lib/kitchen-tags'
import { formatTagLabel } from '../lib/tag-format'

type RecordRow = {
  id: string
  name: string
  tags: unknown
  contains_allergens: unknown
  [key: string]: unknown
}

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const EXPECTED = {
  role: [...DISH_ROLES],
  allergen: [
    'nuts', 'gluten', 'soy', 'dairy', 'shellfish', 'eggs', 'pork',
    'sesame', 'mustard', 'celery', 'sulfites', 'lupin', 'molluscs',
  ],
  protein: [
    'beef', 'lamb', 'chicken', 'turkey', 'pork', 'duck', 'fish', 'shellfish',
    'egg', 'dairy', 'legume', 'tofu', 'mushroom', 'grain', 'pasta',
    'vegetable', 'fruit', 'mixed', 'none',
  ],
  texture: ['crunchy', 'tender', 'chewy', 'juicy', 'silky', 'flaky', 'firm'],
  profile: ['mild', 'bitter', 'savory', 'herbal'],
  method: ['braised', 'baked', 'steamed', 'boiled', 'seared', 'smoked', 'stewed', 'pickled'],
  temperature: ['chilled', 'hot', 'cold', 'room_temperature'],
} as const

// This mirrors the current UI source at app/(chef)/kitchen/page.tsx. It is
// kept separate from EXPECTED so the report can expose drift without changing
// application code during this audit.
const CURRENT_UI_ALLERGENS = [
  'nuts', 'shellfish', 'dairy', 'gluten', 'eggs', 'soy', 'pork',
  'mushrooms', 'cilantro', 'sesame', 'mustard', 'celery', 'sulfites', 'lupin',
  'molluscs',
] as const

const currentUiGroups = Object.fromEntries(
  DESCRIPTIVE_TAG_GROUPS.map((group) => [group.label, [...group.tags]])
)
const currentAllowedTags = new Set([
  ...DISH_ROLES,
  ...DESCRIPTIVE_TAG_GROUPS.flatMap((group) => group.tags),
])
const expectedAllergens = new Set<string>(EXPECTED.allergen)
const currentUiAllergens = new Set<string>(CURRENT_UI_ALLERGENS)
const expectedTagGroups = {
  role: new Set<string>(EXPECTED.role),
  protein: new Set<string>(EXPECTED.protein),
  texture: new Set<string>(EXPECTED.texture),
  profile: new Set<string>(EXPECTED.profile),
  method: new Set<string>(EXPECTED.method),
  temperature: new Set<string>(EXPECTED.temperature),
}
const canonicalRawValues = new Set([
  ...Array.from(currentAllowedTags),
  ...Array.from(currentUiAllergens),
])
const formattedToRaw = new Map(
  Array.from(canonicalRawValues).map((raw) => [formatTagLabel(raw), raw])
)

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      })
  )
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function groupTags(tags: string[], allergens: string[]) {
  const result: Record<string, string[]> = {}
  for (const [group, values] of Object.entries(expectedTagGroups)) {
    result[group] = tags.filter((tag) => values.has(tag))
  }
  result.allergen = allergens.filter((tag) => expectedAllergens.has(tag))
  result.other = tags.filter((tag) =>
    !Object.values(expectedTagGroups).some((values) => values.has(tag))
  )
  result.other_allergens = allergens.filter((tag) => !expectedAllergens.has(tag))
  return result
}

function malformedValues(values: string[]) {
  return values.filter((value) => {
    if (value !== value.trim() || value !== value.toLowerCase()) return true
    const rawForLabel = formattedToRaw.get(value)
    return rawForLabel !== undefined && rawForLabel !== value
  })
}

let supabase: ReturnType<typeof createClient>

async function fetchAll(table: 'signatures' | 'pantry_items', columns: string) {
  const rows: RecordRow[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table} query failed: ${error.message}`)
    const page = (data ?? []) as unknown as RecordRow[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function recordAudit(row: RecordRow) {
  const tags = strings(row.tags)
  const allergens = strings(row.contains_allergens)
  return {
    id: row.id,
    name: row.name,
    tags,
    contains_allergens: allergens,
    grouped: groupTags(tags, allergens),
    unknown_tags: tags.filter((tag) => !currentAllowedTags.has(tag)),
    unknown_allergens: allergens.filter((tag) => !currentUiAllergens.has(tag)),
    malformed_values: malformedValues([...tags, ...allergens]),
  }
}

function ids(records: Array<{ id: string; name: string }>) {
  return records.map(({ id, name }) => ({ id, name }))
}

async function main() {
const env = parseEnv(await readFile(resolve(ROOT, '.env.local'), 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase URL or read credential in .env.local')

supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const [signatureRows, pantryRows] = await Promise.all([
  fetchAll('signatures', 'id, name, tags, contains_allergens, slot, chef_id'),
  fetchAll('pantry_items', 'id, name, tags, contains_allergens, week_of, chef_id'),
])
const signatures = signatureRows.map(recordAudit)
const pantry = pantryRows.map(recordAudit)

const signaturesMissingRole = signatures.filter((record) => record.grouped.role.length === 0)
const signaturesMissingProtein = signatures.filter((record) => record.grouped.protein.length === 0)
const signaturesMissingMethod = signatures.filter((record) => record.grouped.method.length === 0)
const signaturesMissingTemperature = signatures.filter((record) => record.grouped.temperature.length === 0)
const signaturesMissingTextureProfile = signatures.filter((record) =>
  record.grouped.texture.length === 0 && record.grouped.profile.length === 0
)
const incompleteSignatures = signatures.filter((record) =>
  record.grouped.role.length === 0
  || record.grouped.protein.length === 0
  || record.grouped.method.length === 0
  || record.grouped.temperature.length === 0
  || (record.grouped.texture.length === 0 && record.grouped.profile.length === 0)
)
const pantryWithRoles = pantry.filter((record) => record.grouped.role.length > 0)
// Protein/base includes `none`, so it is the one applicable classification
// required of every raw pantry record. Dish-specific method/temperature/texture
// are reported but are not used to mark pantry records incomplete.
const incompletePantry = pantry.filter((record) => record.grouped.protein.length === 0)

const usedTags = new Set([...signatures, ...pantry].flatMap((record) => record.tags))
const usedAllergens = new Set([...signatures, ...pantry].flatMap((record) => record.contains_allergens))
const expectedTags = new Set(Object.values(expectedTagGroups).flatMap((values) => Array.from(values)))
const canonicalNeverUsed = {
  tags: Array.from(expectedTags).filter((tag) => !usedTags.has(tag)).sort(),
  allergens: Array.from(expectedAllergens).filter((tag) => !usedAllergens.has(tag)).sort(),
}
const unknownValues = {
  tags: Array.from(new Set([...signatures, ...pantry].flatMap((record) => record.unknown_tags))).sort(),
  allergens: Array.from(new Set([...signatures, ...pantry].flatMap((record) => record.unknown_allergens))).sort(),
  malformed: Array.from(new Set([...signatures, ...pantry].flatMap((record) => record.malformed_values))).sort(),
}
const legacyValues = {
  tags: Array.from(usedTags).filter((tag) => !expectedTags.has(tag)).sort(),
  allergens: Array.from(usedAllergens).filter((tag) => !expectedAllergens.has(tag)).sort(),
}

const uiValuesByExpectedGroup = {
  role: [...DISH_ROLES],
  protein: currentUiGroups.Protein ?? [],
  texture: currentUiGroups.Texture ?? [],
  profile: currentUiGroups.Texture ?? [],
  method: currentUiGroups['Cooking Method'] ?? [],
  temperature: currentUiGroups.Temperature ?? [],
  allergen: [...CURRENT_UI_ALLERGENS],
}
const definitionComparison = Object.fromEntries(
  Object.entries(EXPECTED).map(([group, expected]) => {
    const ui = new Set(uiValuesByExpectedGroup[group as keyof typeof uiValuesByExpectedGroup] ?? [])
    return [group, {
      missing_from_ui: expected.filter((value) => !ui.has(value)),
      extra_in_ui: Array.from(ui).filter((value) => !(expected as readonly string[]).includes(value)),
    }]
  })
)

const report = {
  generated_at: new Date().toISOString(),
  read_only: true,
  storage_model: {
    signatures: { table: 'signatures', tags: 'text[]', allergens: 'contains_allergens text[]', legacy_slot: 'slot text' },
    pantry: { table: 'pantry_items', tags: 'text[]', allergens: 'contains_allergens text[]' },
    typed_tag_columns: false,
  },
  completeness_rule: {
    signature: 'role + protein/base + method + temperature + at least one texture/profile value',
    pantry: 'protein/base (including canonical none); role is forbidden; dish-specific groups are not required',
  },
  canonical_expected: EXPECTED,
  current_ui_definitions: {
    roles: [...DISH_ROLES],
    groups: currentUiGroups,
    allergens_source: 'app/(chef)/kitchen/page.tsx ALLERGEN_VOCAB',
    allergens: CURRENT_UI_ALLERGENS,
  },
  definition_comparison: definitionComparison,
  totals: { signatures: signatures.length, pantry: pantry.length },
  records: { signatures, pantry },
  findings: {
    signatures_missing_role: ids(signaturesMissingRole),
    signatures_missing_protein: ids(signaturesMissingProtein),
    signatures_missing_method: ids(signaturesMissingMethod),
    signatures_missing_temperature: ids(signaturesMissingTemperature),
    signatures_missing_texture_or_profile: ids(signaturesMissingTextureProfile),
    incomplete_signatures: ids(incompleteSignatures),
    pantry_with_roles: ids(pantryWithRoles),
    incomplete_pantry: ids(incompletePantry),
    unknown_values: unknownValues,
    legacy_values: legacyValues,
    canonical_never_used: canonicalNeverUsed,
  },
}

const jsonPath = resolve(ROOT, 'reports', 'tag-coverage-audit.json')
const markdownPath = resolve(ROOT, 'reports', 'tag-coverage-audit.md')
await mkdir(dirname(jsonPath), { recursive: true })
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const list = (values: Array<{ id: string; name: string }>) =>
  values.length ? values.map((value) => `- ${value.name} (${value.id})`).join('\n') : '- None'
const valueList = (values: string[]) => values.length ? values.map((value) => `\`${value}\``).join(', ') : 'None'
const recordLines = (records: typeof signatures) => records.map((record) =>
  `- **${record.name}** (${record.id}) — tags: ${valueList(record.tags)}; allergens: ${valueList(record.contains_allergens)}`
).join('\n') || '- None'

const markdown = `# Tag Coverage Audit

Generated: ${report.generated_at}

This report is read-only. No tags were inferred, updated, or backfilled.

## Totals

- Signatures: **${signatures.length}**
- Pantry items: **${pantry.length}**
- Incomplete signatures: **${incompleteSignatures.length}**
- Incomplete pantry items: **${incompletePantry.length}**

## Completeness Rules

- Signature: ${report.completeness_rule.signature}
- Pantry: ${report.completeness_rule.pantry}

## Signature Findings

### Missing role (${signaturesMissingRole.length})
${list(ids(signaturesMissingRole))}

### Missing protein/base (${signaturesMissingProtein.length})
${list(ids(signaturesMissingProtein))}

### Missing method (${signaturesMissingMethod.length})
${list(ids(signaturesMissingMethod))}

### Missing temperature (${signaturesMissingTemperature.length})
${list(ids(signaturesMissingTemperature))}

### Missing texture/profile (${signaturesMissingTextureProfile.length})
${list(ids(signaturesMissingTextureProfile))}

## Pantry Findings

### Pantry records containing forbidden roles (${pantryWithRoles.length})
${list(ids(pantryWithRoles))}

### Missing protein/base (${incompletePantry.length})
${list(ids(incompletePantry))}

## Unknown, Legacy, and Malformed Values

- Unknown tag values: ${valueList(unknownValues.tags)}
- Unknown allergen values: ${valueList(unknownValues.allergens)}
- Malformed/display-formatted stored values: ${valueList(unknownValues.malformed)}
- Legacy/non-target tag values in use: ${valueList(legacyValues.tags)}
- Legacy/non-target allergen values in use: ${valueList(legacyValues.allergens)}

## Canonical Values Never Used

- Tags: ${valueList(canonicalNeverUsed.tags)}
- Allergens: ${valueList(canonicalNeverUsed.allergens)}

## All Signature Records

${recordLines(signatures)}

## All Pantry Records

${recordLines(pantry)}
`
await writeFile(markdownPath, markdown, 'utf8')

console.log(JSON.stringify({
  reports: [jsonPath, markdownPath],
  totals: report.totals,
  incomplete_signatures: incompleteSignatures.length,
  incomplete_pantry: incompletePantry.length,
  pantry_with_roles: pantryWithRoles.length,
  unknown_values: unknownValues,
  legacy_values: legacyValues,
}, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
