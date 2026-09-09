'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/theme'
import '@/components/sofra-v2/sofra-v2.css'
import {
  DISH_PRESETS,
  CUISINES,
  DISH_ROLES,
  isDishRole,
  dishRoleFromTags,
  withDishRole,
  withoutDishRoles,
  canonicalDishName,
  dishPresetKey,
  type DishPreset,
} from '@/lib/dish-presets'
import { INGREDIENT_PRESETS, INGREDIENT_CATEGORIES, inferIngredientCategory } from '@/lib/ingredient-presets'
import { formatTagLabel } from '@/lib/tag-format'
import SofraTransition from '@/components/SofraTransition'
import ChefTabs from '@/components/ChefTabs'
import {
  PANTRY_TAG_GROUPS,
  SIGNATURE_TAG_GROUPS,
  KITCHEN_ALLERGENS,
  pantryTagsForPersistence,
  type TagGroup,
} from '@/lib/kitchen-tags'

const CUISINE_FILTERS = ['All', ...CUISINES] as const
type CuisineFilter = (typeof CUISINE_FILTERS)[number]

const ROLE_FILTERS = ['All', ...DISH_ROLES] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]

const INGREDIENT_CATEGORY_FILTERS = ['All', ...INGREDIENT_CATEGORIES] as const
type IngredientCategoryFilter = (typeof INGREDIENT_CATEGORY_FILTERS)[number]

// Fixed vocabularies keep tag/allergen values consistent so the hard-limit
// safety check in lib/menu.ts (case-insensitive) reliably matches guest avoid
// entries — e.g. chef "nuts" ↔ guest "Nuts". 'side'/'starter' don't affect
// diet matching — they tell inferSlot this dish isn't eligible for a Main
// slot even if it's also tagged 'meat'/'veg' (see lib/menu.ts inferSlot).
//
// Picker configuration lives in lib/kitchen-tags.ts. Signature roles and
// pantry descriptors are intentionally separate there.
// ALLERGEN_VOCAB must cover every value in NOGOS (lib/theme.ts) — otherwise
// a guest's avoid label has no chef-side chip to declare against, and the
// exclusion silently misses. It ALSO carries dairy/gluten/soy, which aren't
// in NOGOS but are true medical allergens (TRUE_ALLERGENS in lib/menu.ts)
// the chef must be able to declare. Cilantro/Mushrooms/Pork are preferences
// (not TRUE_ALLERGENS) and score as kind='preference' → labeled substitute
// rather than hard block. sesame/mustard/celery/sulfites/lupin/molluscs are
// standard EU/UK regulated allergens added alongside the existing set.
function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

let draftIdCounter = 0
function nextLocalDraftId(): string {
  draftIdCounter += 1
  return `draft-${draftIdCounter}`
}

type Signature = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
  novelty_score: number | null
  is_substantial: boolean | null
  preset_key: string | null
}

type StagedSignatureDraft = { localId: string; name: string; tags: string[]; allergens: string[] }
type StagedPantryDraft = { localId: string; name: string; tags: string[]; allergens: string[] }

type PantryItem = {
  id: string
  name: string
  week_of: string
  tags: string[]
  contains_allergens: string[]
  // Optional -- availability itself stays binary (a row means "on hand this
  // week" regardless of these). Purely additive data for later use; not read
  // by any deduction/shopping-cart logic yet.
  quantity_amount: number | null
  quantity_unit: string | null
}

export default function KitchenPage() {
  return (
    <Suspense fallback={null}>
      <KitchenPageInner />
    </Suspense>
  )
}

function KitchenPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromEventId = searchParams?.get('from') ?? null
  const fromPage = searchParams?.get('from_page') === 'table' ? 'table' : 'menu'
  // Scroll-linked opacity via useTransform isn't part of Framer Motion's animation engine, so
  // MotionConfig's reducedMotion prop (used in HostEntryPlate.tsx) wouldn't affect it — no reduced-motion
  // handling needed here since this is a plain scroll-position mapping, not a triggered animation.
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: scrollTrackRef, offset: ['start start', 'end end'] })
  const signaturesOpacity = useTransform(scrollYProgress, [0, 0.45, 0.55], [1, 1, 0])
  const pantryOpacity = useTransform(scrollYProgress, [0.45, 0.55, 1], [0, 1, 1])
  const [signaturesActive, setSignaturesActive] = useState(true)
  useEffect(() => scrollYProgress.on('change', (v) => setSignaturesActive(v < 0.5)), [scrollYProgress])
  const signaturesSectionRef = useRef<HTMLElement>(null)
  const pantrySectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // aria-hidden alone doesn't remove an element from the Tab order or block a keypress on an
    // already-focused control inside it — set the native `inert` DOM property (not typed on JSX by this
    // project's @types/react version, so assigned imperatively) so the currently invisible section is
    // truly unreachable by keyboard too, not just by pointer/screen reader.
    // No dependency array: the sections (and their refs) don't exist until `loading` flips false, and
    // `signaturesActive` itself doesn't change value between mount and that point (it defaults to `true`,
    // matching scroll position 0), so a `[signaturesActive]`-only effect would never re-run once the refs
    // actually attach. Running after every render is cheap (two conditional property writes) and
    // guarantees the very first render where the refs are non-null still applies the correct value.
    if (signaturesSectionRef.current) signaturesSectionRef.current.inert = !signaturesActive
    if (pantrySectionRef.current) pantrySectionRef.current.inert = signaturesActive
  })
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [backEvent, setBackEvent] = useState<{ id: string; title: string; isPublished: boolean; isDelegatedChef: boolean } | null>(null)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [publishError, setPublishError] = useState('')

  const [signatures, setSignatures] = useState<Signature[]>([])
  const [sigName, setSigName] = useState('')
  const [sigTagsList, setSigTagsList] = useState<string[]>([])
  const [sigAllergensList, setSigAllergensList] = useState<string[]>([])
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(null)
  const [sigAdding, setSigAdding] = useState(false)
  const [sigAddError, setSigAddError] = useState('')
  const [sigTagsRevealed, setSigTagsRevealed] = useState(false)
  const [sigSuggesting, setSigSuggesting] = useState(false)
  const [sigSuggestionReady, setSigSuggestionReady] = useState(false)
  const sigSuggestionRequestRef = useRef(0)
  const [stagedSignatureDrafts, setStagedSignatureDrafts] = useState<StagedSignatureDraft[]>([])
  // Set when the draft area is blurred while a suggestion fetch is still in flight -- staging can't
  // happen yet (no tags to stage), so this defers it until the auto-stage effect below sees the
  // suggestion actually resolve. Cleared by that effect once consumed, and by onFocus if the chef comes
  // back to keep editing before it resolves.
  const sigStageIntentRef = useRef(false)
  // Tracks the name last set programmatically via editStagedSignatureDraft, so the suggestion effect
  // below can skip re-fetching for it. Compared by NAME (not a plain boolean) because setSigName can be
  // a same-value no-op re-render (e.g. reopening a draft whose name matches whatever's already typed) --
  // a boolean flag would never get consumed in that case (the effect's [sigName] dependency wouldn't
  // change), leaking the suppression into a later, unrelated name change. Cleared unconditionally on the
  // effect's next run regardless of match, so it can never stay stuck.
  const suppressSigSuggestForNameRef = useRef<string | null>(null)
  const sigDraftContainerRef = useRef<HTMLDivElement>(null)
  const [presetCuisine, setPresetCuisine] = useState<CuisineFilter>('All')
  const [presetRole, setPresetRole] = useState<RoleFilter>('All')
  const [selectedDishKeys, setSelectedDishKeys] = useState<string[]>([])
  const [pendingRemovedSignatureIds, setPendingRemovedSignatureIds] = useState<string[]>([])
  const [dishBatchError, setDishBatchError] = useState('')

  const [pantry, setPantry] = useState<PantryItem[]>([])
  const [pantryName, setPantryName] = useState('')
  const [pantryTagsList, setPantryTagsList] = useState<string[]>([])
  const [pantryAllergensList, setPantryAllergensList] = useState<string[]>([])
  const [pantryAdding, setPantryAdding] = useState(false)
  const [pantryAddError, setPantryAddError] = useState('')
  const [pendingRemovedPantryIds, setPendingRemovedPantryIds] = useState<string[]>([])
  const [pantryTagsRevealed, setPantryTagsRevealed] = useState(false)
  const [pantrySuggesting, setPantrySuggesting] = useState(false)
  const [pantrySuggestionReady, setPantrySuggestionReady] = useState(false)
  const pantrySuggestionRequestRef = useRef(0)
  const [stagedPantryDrafts, setStagedPantryDrafts] = useState<StagedPantryDraft[]>([])
  // See sigStageIntentRef above -- same "stage once the in-flight suggestion resolves" purpose.
  const pantryStageIntentRef = useRef(false)
  // See suppressSigSuggestForNameRef above -- same name-comparison approach for the same reason.
  const suppressPantrySuggestForNameRef = useRef<string | null>(null)
  const pantryDraftContainerRef = useRef<HTMLDivElement>(null)
  const [pantryDoneSaved, setPantryDoneSaved] = useState(false)
  const pantryDoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ingredientCategory, setIngredientCategory] = useState<IngredientCategoryFilter>('All')
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([])
  const [nothingInPantry, setNothingInPantry] = useState(false)
  const [ingredientBatchAdding, setIngredientBatchAdding] = useState(false)
  const [ingredientBatchError, setIngredientBatchError] = useState('')

  const weekOf = currentMonday()

  const transitionActive = loading || publishingDraft || pantryAdding || ingredientBatchAdding

  async function loadData() {
    setLoading(true)
    setFetchError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored
      const uid = stored

      const [backEventResult, { data: sigs, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        fromEventId ? loadBackEvent(uid, fromEventId) : Promise.resolve(null),
        supabase
          .from('signatures')
          .select('id, name, tags, contains_allergens, novelty_score, is_substantial, preset_key')
          .eq('chef_id', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('pantry_items')
          .select('id, name, week_of, tags, contains_allergens, quantity_amount, quantity_unit')
          .eq('chef_id', uid)
          .eq('week_of', weekOf)
          .order('created_at', { ascending: false }),
      ])

      if (e1 || e2) throw new Error('fetch failed')
      if (backEventResult) setBackEvent(backEventResult)
      const loadedSignatures = sigs ?? []
      setSignatures(loadedSignatures)
      void backfillLegacyPresetKeys(uid, loadedSignatures)
      setPantry(
        (items ?? []).map((item: PantryItem) => ({
          ...item,
          tags: pantryTagsForPersistence(item.tags),
        }))
      )
    } catch {
      setFetchError("Couldn't load your kitchen. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function backfillLegacyPresetKeys(uid: string, rows: Signature[]) {
    const presetByName = new Map(DISH_PRESETS.map(preset => [canonicalDishName(preset.name), preset]))
    const legacy = rows.filter(row => !row.preset_key).map(row => ({ row, preset: presetByName.get(canonicalDishName(row.name)) })).filter((entry): entry is { row: Signature; preset: DishPreset } => Boolean(entry.preset))
    if (!legacy.length) return
    const results = await Promise.all(legacy.map(({ row, preset }) => supabase.from('signatures').update({ preset_key: dishPresetKey(preset) }).eq('id', row.id).eq('chef_id', uid)))
    if (results.some(result => result.error)) return
    setSignatures(current => current.map(row => {
      const match = legacy.find(entry => entry.row.id === row.id)
      return match ? { ...row, preset_key: dishPresetKey(match.preset) } : row
    }))
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBackEvent(uid: string, eventId: string) {
    const { data, error } = await supabase
      .from('events')
      .select('id, host_id, chef_id, title, is_published')
      .eq('id', eventId)
      .single()

    if (error || !data) return null
    if (data.host_id !== uid && data.chef_id !== uid) return null
    return { id: data.id, title: data.title, isPublished: data.is_published !== false, isDelegatedChef: data.chef_id === uid && data.host_id !== uid }
  }

  function cancelSignatureEdit() {
    setEditingSignatureId(null)
    setSigName('')
    setSigTagsList([])
    setSigAllergensList([])
    setSigTagsRevealed(false)
    setSigSuggestionReady(false)
  }

  function toggleDishSelection(p: DishPreset) {
    const key = dishPresetKey(p)
    const saved = persistedPresetByKey.get(key)
    if (saved) {
      setPendingRemovedSignatureIds(prev => prev.includes(saved.id) ? prev.filter(id => id !== saved.id) : [...prev, saved.id])
      return
    }
    setSelectedDishKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function toggleTag(t: string) {
    setSigTagsList((prev) => {
      if (!isDishRole(t)) {
        return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
      }
      return prev.includes(t) ? withoutDishRoles(prev) : withDishRole(prev, t)
    })
  }

  function toggleAllergen(a: string) {
    setSigAllergensList((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  function toggleIngredientSelection(name: string) {
    setNothingInPantry(false)
    setSelectedIngredients((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  function selectEmptyPantry() {
    setPendingRemovedPantryIds([])
    setNothingInPantry(true)
    setSelectedIngredients([])
    setPantryName('')
    setPantryTagsList([])
    setPantryAllergensList([])
    setPantryTagsRevealed(false)
    cancelPantryEdit()
  }

  function togglePantryTag(t: string) {
    setPantryTagsList((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  function togglePantryAllergen(a: string) {
    setPantryAllergensList((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  // Kept as the retry primitive for any future partial batch-recovery UI.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function addSelectedIngredients() {
    const uid = uidRef.current
    if (!uid || ingredientBatchAdding || selectedIngredients.length === 0) return
    setIngredientBatchAdding(true)
    setIngredientBatchError('')

    // Currently-selected tag/allergen chips apply to every ingredient in this
    // batch — same UX as "Add your own dish" applying chips to the next add.
    const tags = pantryTagsForPersistence(pantryTagsList)
    const allergens = pantryAllergensList

    const targets = [...selectedIngredients]
    const results = await Promise.allSettled(
      targets.map((name) =>
        supabase
          .from('pantry_items')
          .insert({ chef_id: uid, name, week_of: weekOf, tags, contains_allergens: allergens })
          .select('id, name, week_of, tags, contains_allergens, quantity_amount, quantity_unit')
          .single()
      )
    )

    const inserted: PantryItem[] = []
    const failedNames: string[] = []
    results.forEach((res, i) => {
      const name = targets[i]
      const ok = res.status === 'fulfilled' && !res.value.error && res.value.data
      if (ok) {
        inserted.push(res.value.data as PantryItem)
      } else {
        failedNames.push(name)
      }
    })

    if (inserted.length > 0) {
      setPantry((prev) => [...inserted, ...prev])
      setPantryTagsList([])
      setPantryAllergensList([])
    }
    setSelectedIngredients(failedNames)
    if (failedNames.length > 0) {
      const list = failedNames.join(', ')
      setIngredientBatchError(
        `Couldn't add: ${list}. They stay selected with the option to tap "Add selected" again to retry just those.`
      )
    }
    setIngredientBatchAdding(false)
  }

  const filteredPresets = DISH_PRESETS.filter((d) =>
    (presetCuisine === 'All' || d.cuisine === presetCuisine)
    && (presetRole === 'All' || d.role === presetRole)
  )

  const persistedPresetByKey = useMemo(() => {
    const byKey = new Map<string, Signature>()
    const presetByName = new Map(DISH_PRESETS.map(preset => [canonicalDishName(preset.name), preset]))
    for (const signature of signatures) {
      if (signature.preset_key) {
        byKey.set(signature.preset_key, signature)
        continue
      }
      const legacyPreset = presetByName.get(canonicalDishName(signature.name))
      if (legacyPreset) byKey.set(dishPresetKey(legacyPreset), signature)
    }
    return byKey
  }, [signatures])

  const persistedSelectedPresetKeys = useMemo(
    () => new Set(persistedPresetByKey.keys()),
    [persistedPresetByKey]
  )

  const signatureFormDirty = useMemo(() => {
    const existing = editingSignatureId ? signatures.find(signature => signature.id === editingSignatureId) : null
    if (!existing) return Boolean(sigName.trim() || sigTagsList.length || sigAllergensList.length)
    const sameValues = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    return sigName.trim() !== existing.name || !sameValues(sigTagsList, existing.tags) || !sameValues(sigAllergensList, existing.contains_allergens)
  }, [editingSignatureId, sigAllergensList, sigName, sigTagsList, signatures])

  const filteredIngredients: string[] =
    ingredientCategory === 'All'
      ? INGREDIENT_CATEGORIES.flatMap((c) => INGREDIENT_PRESETS[c] ?? [])
      : (INGREDIENT_PRESETS[ingredientCategory] ?? [])

  const presetSignatureNamesLC = new Set(DISH_PRESETS.map((preset) => canonicalDishName(preset.name)))
  const customSignatures = signatures.filter((signature) => {
    if (signature.preset_key || presetSignatureNamesLC.has(canonicalDishName(signature.name))) return false
    if (presetRole === 'All') return true
    return dishRoleFromTags(signature.tags) === presetRole
  })
  const presetPantryNamesLC = new Set(
    INGREDIENT_CATEGORIES.flatMap((category) => INGREDIENT_PRESETS[category] ?? [])
      .map((name) => name.toLowerCase())
  )
  const customPantry = pantry.filter((item) => {
    if (presetPantryNamesLC.has(item.name.toLowerCase())) return false
    if (ingredientCategory === 'All') return true
    return inferIngredientCategory(item.tags) === ingredientCategory
  })
  const pantryHasAnythingSelected = selectedIngredients.length > 0
    || stagedPantryDrafts.length > 0
    || Boolean(pantryName.trim())
    || (!nothingInPantry && pantry.length > 0)
  const signatureHasAnythingSelected = selectedDishKeys.length > 0
    || pendingRemovedSignatureIds.length > 0
    || stagedSignatureDrafts.length > 0
    || Boolean(sigName.trim() || editingSignatureId || sigTagsList.length || sigAllergensList.length)

  function toggleSignatureRemoval(signature: Signature) {
    setPendingRemovedSignatureIds(prev => prev.includes(signature.id) ? prev.filter(id => id !== signature.id) : [...prev, signature.id])
  }

  function clearAllSignatures() {
    setSelectedDishKeys([])
    setPendingRemovedSignatureIds(signatures.map(signature => signature.id))
    cancelSignatureEdit()
  }

  function cancelPantryEdit() {
    setPantryName('')
    setPantryTagsList([])
    setPantryAllergensList([])
    setPantryTagsRevealed(false)
    setPantrySuggestionReady(false)
  }

  async function suggestKitchenMetadata(kind: 'signature' | 'pantry', name: string, requestId: number) {
    const setSuggesting = kind === 'signature' ? setSigSuggesting : setPantrySuggesting
    const setError = kind === 'signature' ? setSigAddError : setPantryAddError
    setError('')
    try {
      const response = await fetch('/api/signatures/suggest-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind }),
      })
      const result = await response.json() as { tags?: unknown; allergens?: unknown; error?: unknown }
      if (!response.ok || !Array.isArray(result.tags) || !Array.isArray(result.allergens)) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not suggest metadata.')
      }
      const activeRequestId = kind === 'signature' ? sigSuggestionRequestRef.current : pantrySuggestionRequestRef.current
      if (requestId !== activeRequestId) return
      const tags = result.tags.filter((value): value is string => typeof value === 'string')
      const allergens = result.allergens.filter((value): value is string => typeof value === 'string')
      if (kind === 'signature') {
        setSigTagsList(tags)
        setSigAllergensList(allergens)
        setSigTagsRevealed(true)
        setSigSuggestionReady(true)
      } else {
        setPantryTagsList(pantryTagsForPersistence(tags))
        setPantryAllergensList(allergens)
        setPantryTagsRevealed(true)
        setPantrySuggestionReady(true)
      }
    } catch (error) {
      const activeRequestId = kind === 'signature' ? sigSuggestionRequestRef.current : pantrySuggestionRequestRef.current
      if (requestId !== activeRequestId) return
      if (kind === 'signature') {
        setSigTagsRevealed(true)
        setSigSuggestionReady(false)
      } else {
        setPantryTagsRevealed(true)
        setPantrySuggestionReady(false)
      }
      setError(`${error instanceof Error ? error.message : 'Could not suggest metadata.'} You can choose the tags manually below.`)
    } finally {
      const activeRequestId = kind === 'signature' ? sigSuggestionRequestRef.current : pantrySuggestionRequestRef.current
      if (requestId === activeRequestId) setSuggesting(false)
    }
  }

  useEffect(() => {
    const name = sigName.trim()
    if (suppressSigSuggestForNameRef.current !== null) {
      const shouldSuppress = suppressSigSuggestForNameRef.current === name
      suppressSigSuggestForNameRef.current = null
      if (shouldSuppress) {
        sigSuggestionRequestRef.current += 1
        setSigSuggesting(false)
        return
      }
    }
    if (editingSignatureId || !name) {
      sigSuggestionRequestRef.current += 1
      setSigSuggesting(false)
      return
    }
    const requestId = sigSuggestionRequestRef.current + 1
    sigSuggestionRequestRef.current = requestId
    setSigSuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('signature', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [editingSignatureId, sigName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const name = pantryName.trim()
    if (suppressPantrySuggestForNameRef.current !== null) {
      const shouldSuppress = suppressPantrySuggestForNameRef.current === name
      suppressPantrySuggestForNameRef.current = null
      if (shouldSuppress) {
        pantrySuggestionRequestRef.current += 1
        setPantrySuggesting(false)
        return
      }
    }
    if (!name) {
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
      return
    }
    const requestId = pantrySuggestionRequestRef.current + 1
    pantrySuggestionRequestRef.current = requestId
    setPantrySuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('pantry', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [pantryName]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sigSuggestionReady && sigStageIntentRef.current) {
      sigStageIntentRef.current = false
      tryStageSignatureDraft()
    }
  }, [sigSuggestionReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pantrySuggestionReady && pantryStageIntentRef.current) {
      pantryStageIntentRef.current = false
      tryStagePantryDraft()
    }
  }, [pantrySuggestionReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePantryRemoval(item: PantryItem) {
    setPendingRemovedPantryIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])
  }

  async function handlePantryDone() {
    if (backEvent) {
      if (!uidRef.current || publishingDraft) return
      setPublishingDraft(true)
      setPublishError('')
      const { error } = await supabase
        .from('events')
        .update({ is_published: true, kitchen_status: 'complete' })
        .eq('id', backEvent.id)
      setPublishingDraft(false)
      if (error) {
        setPublishError('Could not mark this kitchen complete. Try again.')
        return
      }
      router.push(backEvent.isDelegatedChef ? `/events/${backEvent.id}/menu` : backEvent.isPublished ? `/events/${backEvent.id}/${fromPage}` : `/events/${backEvent.id}`)
      return
    }
    setPantryDoneSaved(true)
    if (pantryDoneTimeoutRef.current) clearTimeout(pantryDoneTimeoutRef.current)
    pantryDoneTimeoutRef.current = setTimeout(() => setPantryDoneSaved(false), 2000)
  }

  function tryStageSignatureDraft() {
    const name = sigName.trim()
    if (!name) return
    if (sigSuggesting && !sigSuggestionReady) {
      sigStageIntentRef.current = true
      return
    }
    const hasRole = sigTagsList.some(isDishRole)
    const hasDescriptive = withoutDishRoles(sigTagsList).length > 0
    if (!hasRole || !hasDescriptive) return
    setStagedSignatureDrafts((prev) => [...prev, { localId: nextLocalDraftId(), name, tags: [...sigTagsList], allergens: [...sigAllergensList] }])
    cancelSignatureEdit()
  }

  function editStagedSignatureDraft(draft: StagedSignatureDraft) {
    // Preserve any complete, ready-to-stage draft already in the form before switching to edit a
    // different one -- otherwise the setSigName/etc. below would silently overwrite and lose it with no
    // chip, no error, and no recovery. If a suggestion for that old content was still in flight,
    // tryStageSignatureDraft() harmlessly arms stage-intent for it; clear it right after since we're
    // abandoning that draft's suggestion entirely, not waiting for it anymore.
    tryStageSignatureDraft()
    sigStageIntentRef.current = false
    setStagedSignatureDrafts((prev) => prev.filter((d) => d.localId !== draft.localId))
    suppressSigSuggestForNameRef.current = draft.name
    setSigName(draft.name)
    setSigTagsList(draft.tags)
    setSigAllergensList(draft.allergens)
    setSigTagsRevealed(true)
    setSigSuggestionReady(true)
    sigDraftContainerRef.current?.querySelector('input')?.focus()
  }

  function handleSignatureDraftBlur() {
    setTimeout(() => {
      const active = document.activeElement
      if (!sigDraftContainerRef.current) return
      if (!active || !sigDraftContainerRef.current.contains(active)) tryStageSignatureDraft()
    }, 0)
  }

  function tryStagePantryDraft() {
    const name = pantryName.trim()
    if (!name) return
    if (pantrySuggesting && !pantrySuggestionReady) {
      pantryStageIntentRef.current = true
      return
    }
    const tags = pantryTagsForPersistence(pantryTagsList)
    if (tags.length === 0) return
    setStagedPantryDrafts((prev) => [...prev, { localId: nextLocalDraftId(), name, tags, allergens: [...pantryAllergensList] }])
    cancelPantryEdit()
  }

  function editStagedPantryDraft(draft: StagedPantryDraft) {
    // See editStagedSignatureDraft above -- preserve any complete in-progress draft before switching.
    tryStagePantryDraft()
    pantryStageIntentRef.current = false
    setStagedPantryDrafts((prev) => prev.filter((d) => d.localId !== draft.localId))
    suppressPantrySuggestForNameRef.current = draft.name
    setPantryName(draft.name)
    setPantryTagsList(draft.tags)
    setPantryAllergensList(draft.allergens)
    setPantryTagsRevealed(true)
    setPantrySuggestionReady(true)
    pantryDraftContainerRef.current?.querySelector('input')?.focus()
  }

  function handlePantryDraftBlur() {
    setTimeout(() => {
      const active = document.activeElement
      if (!pantryDraftContainerRef.current) return
      if (!active || !pantryDraftContainerRef.current.contains(active)) tryStagePantryDraft()
    }, 0)
  }

  async function submitKitchen() {
    const uid = uidRef.current
    if (!uid || sigAdding || pantryAdding || ingredientBatchAdding || sigSuggesting || pantrySuggesting || publishingDraft) return

    const sigFormHasContent = Boolean(sigName.trim() || editingSignatureId || sigTagsList.length || sigAllergensList.length)
    if (sigFormHasContent && (!sigName.trim() || !sigTagsRevealed || !sigTagsList.some(isDishRole) || withoutDishRoles(sigTagsList).length === 0)) {
      setSigAddError('Enter a name, then choose a role and at least one descriptive tag.')
      return
    }
    const name = pantryName.trim()
    const pantryTags = pantryTagsForPersistence(pantryTagsList)
    const pantryFormHasContent = Boolean(name || pantryTagsList.length || pantryAllergensList.length)
    if (pantryFormHasContent && (!name || pantryTags.length === 0)) {
      setPantryAddError('Enter an ingredient name and choose at least one descriptive tag.')
      return
    }

    setSigAdding(true)
    setPantryAdding(true)
    setIngredientBatchAdding(true)
    setDishBatchError('')
    setPantryAddError('')
    setIngredientBatchError('')

    const keyToPreset = new Map(DISH_PRESETS.map((p) => [dishPresetKey(p), p] as const))
    const dishTargets = selectedDishKeys.map((k) => keyToPreset.get(k)).filter((p): p is DishPreset => Boolean(p))
    const existingSignature = editingSignatureId ? signatures.find(s => s.id === editingSignatureId) : null
    const sigFormOperation = sigFormHasContent
      ? (editingSignatureId
          ? supabase.from('signatures').update({ name: sigName.trim(), tags: Array.from(new Set(sigTagsList)), contains_allergens: sigAllergensList, novelty_score: existingSignature?.novelty_score ?? null, is_substantial: existingSignature?.is_substantial ?? null }).eq('id', editingSignatureId).eq('chef_id', uid)
          : supabase.from('signatures').insert({ chef_id: uid, name: sigName.trim(), tags: Array.from(new Set(sigTagsList)), contains_allergens: sigAllergensList, novelty_score: null, is_substantial: null }))
      : null

    const pantryAllergens = pantryAllergensList
    const pantryFormPayload = { name, week_of: weekOf, tags: pantryTags, contains_allergens: pantryAllergens }
    const pantryFormOperation = pantryFormHasContent
      ? supabase.from('pantry_items').insert({ chef_id: uid, ...pantryFormPayload })
      : null

    const pantryClearIds = nothingInPantry ? pantry.map((item) => item.id) : []
    const pantryRemovalIds = !nothingInPantry ? pendingRemovedPantryIds : []

    type KitchenOp =
      | { kind: 'dishInsert'; key: string }
      | { kind: 'sigRemove'; id: string }
      | { kind: 'sigForm' }
      | { kind: 'stagedSignature'; localId: string }
      | { kind: 'pantryClearAll'; id: string }
      | { kind: 'pantryRemove'; id: string }
      | { kind: 'ingredientInsert'; name: string }
      | { kind: 'pantryForm' }
      | { kind: 'stagedPantry'; localId: string }

    const ops: { meta: KitchenOp; run: () => PromiseLike<{ error: unknown }> }[] = [
      ...dishTargets.map((p) => ({
        meta: { kind: 'dishInsert', key: dishPresetKey(p) } as KitchenOp,
        run: () => supabase.from('signatures').insert({
          chef_id: uid, name: p.name, tags: withDishRole(p.tags, p.role), contains_allergens: p.allergens,
          novelty_score: p.novelty_score ?? null, is_substantial: p.is_substantial ?? (p.role === 'main'),
          preset_key: dishPresetKey(p),
        }).select('id, name, tags, contains_allergens, novelty_score, is_substantial, preset_key').single(),
      })),
      ...pendingRemovedSignatureIds.map((id) => ({
        meta: { kind: 'sigRemove', id } as KitchenOp,
        run: () => supabase.from('signatures').delete().eq('id', id).eq('chef_id', uid),
      })),
      ...(sigFormOperation ? [{ meta: { kind: 'sigForm' } as KitchenOp, run: () => sigFormOperation }] : []),
      ...stagedSignatureDrafts.map((draft) => ({
        meta: { kind: 'stagedSignature', localId: draft.localId } as KitchenOp,
        run: () => supabase.from('signatures').insert({
          chef_id: uid, name: draft.name, tags: Array.from(new Set(draft.tags)), contains_allergens: draft.allergens,
          novelty_score: null, is_substantial: null,
        }),
      })),
      ...pantryClearIds.map((id) => ({
        meta: { kind: 'pantryClearAll', id } as KitchenOp,
        run: () => supabase.from('pantry_items').delete().eq('id', id).eq('chef_id', uid),
      })),
      ...pantryRemovalIds.map((id) => ({
        meta: { kind: 'pantryRemove', id } as KitchenOp,
        run: () => supabase.from('pantry_items').delete().eq('id', id).eq('chef_id', uid),
      })),
      ...selectedIngredients.map((selectedName) => ({
        meta: { kind: 'ingredientInsert', name: selectedName } as KitchenOp,
        run: () => supabase.from('pantry_items').insert({ chef_id: uid, name: selectedName, week_of: weekOf, tags: pantryTags, contains_allergens: pantryAllergens }),
      })),
      ...(pantryFormOperation ? [{ meta: { kind: 'pantryForm' } as KitchenOp, run: () => pantryFormOperation }] : []),
      ...stagedPantryDrafts.map((draft) => ({
        meta: { kind: 'stagedPantry', localId: draft.localId } as KitchenOp,
        run: () => supabase.from('pantry_items').insert({
          chef_id: uid, name: draft.name, week_of: weekOf, tags: draft.tags, contains_allergens: draft.allergens,
        }),
      })),
    ]

    const results = await Promise.allSettled(ops.map((op) => op.run()))

    const succeeded: KitchenOp[] = []
    const failed: KitchenOp[] = []
    results.forEach((result, i) => {
      const ok = result.status === 'fulfilled' && !result.value?.error
      ;(ok ? succeeded : failed).push(ops[i].meta)
    })

    const failedDishKeys = new Set(failed.filter((m) => m.kind === 'dishInsert').map((m) => (m as { key: string }).key))
    const failedSigRemoveIds = new Set(failed.filter((m) => m.kind === 'sigRemove').map((m) => (m as { id: string }).id))
    const sigFormFailed = failed.some((m) => m.kind === 'sigForm')
    const failedStagedSignatureIds = new Set(failed.filter((m) => m.kind === 'stagedSignature').map((m) => (m as { localId: string }).localId))
    const failedPantryClearIds = new Set(failed.filter((m) => m.kind === 'pantryClearAll').map((m) => (m as { id: string }).id))
    const failedPantryRemoveIds = new Set(failed.filter((m) => m.kind === 'pantryRemove').map((m) => (m as { id: string }).id))
    const failedIngredientNames = new Set(failed.filter((m) => m.kind === 'ingredientInsert').map((m) => (m as { name: string }).name))
    const pantryFormFailed = failed.some((m) => m.kind === 'pantryForm')
    const failedStagedPantryIds = new Set(failed.filter((m) => m.kind === 'stagedPantry').map((m) => (m as { localId: string }).localId))

    setSigAdding(false)
    setPantryAdding(false)
    setIngredientBatchAdding(false)

    // Always refresh from the DB so the UI reflects whatever actually committed, even on partial failure.
    await loadData()

    setSelectedDishKeys((prev) => prev.filter((k) => failedDishKeys.has(k)))
    setPendingRemovedSignatureIds((prev) => prev.filter((id) => failedSigRemoveIds.has(id)))
    setStagedSignatureDrafts((prev) => prev.filter((d) => failedStagedSignatureIds.has(d.localId)))
    if (!sigFormFailed) cancelSignatureEdit()

    if (nothingInPantry) {
      // Stay in the "nothing in pantry" state only if some of those deletions failed; otherwise it's genuinely empty now.
      setNothingInPantry(failedPantryClearIds.size > 0)
      setPendingRemovedPantryIds([])
    } else {
      setPendingRemovedPantryIds((prev) => prev.filter((id) => failedPantryRemoveIds.has(id)))
    }
    setSelectedIngredients((prev) => prev.filter((n) => failedIngredientNames.has(n)))
    setStagedPantryDrafts((prev) => prev.filter((d) => failedStagedPantryIds.has(d.localId)))
    if (!pantryFormFailed) cancelPantryEdit()

    if (failed.length > 0) {
      setDishBatchError(
        succeeded.length > 0
          ? "Some changes saved, but a few couldn't. They're still here so you can try again."
          : "Couldn't update your kitchen. Your pending changes are still here with the option to try again."
      )
      return
    }

    await handlePantryDone()
  }

  useEffect(() => {
    return () => {
      if (pantryDoneTimeoutRef.current) clearTimeout(pantryDoneTimeoutRef.current)
    }
  }, [])

  return (
    <div
      className={`sv2-root sv2-device-page sv2-app-page sv2-production-kitchen${backEvent?.isDelegatedChef ? ' sv2-restricted-chef-page' : ''}`}
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <SofraTransition
        active={transitionActive}
        label={publishingDraft ? 'Publishing your invite' : 'Setting your kitchen'}
      />
      <div
        className="fade sv2-device-shell sv2-app-shell sv2-kitchen-shell"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        {backEvent && (
          <ChefTabs eventId={backEvent.id} active="kitchen" restrictedChef={backEvent.isDelegatedChef} title={backEvent.title} />
        )}
        {/* Chef header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.cream, fontSize: 24, fontStyle: 'italic' }}>
            Sofra{' '}
            <span
              style={{
                color: C.gold,
                fontSize: 14,
                fontStyle: 'normal',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: 1,
              }}
            >
              · Kitchen
            </span>
          </div>
          <div
            style={{
              color: C.dim,
              fontSize: 13,
              marginTop: 4,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Your signatures and this week’s pantry.
          </div>
        </div>

        {loading && (
          <div style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
            Loading…
          </div>
        )}

        {!loading && fetchError && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{fetchError}</p>
            <button
              onClick={loadData}
              style={{
                background: 'none',
                border: `1px solid ${C.dim}`,
                borderRadius: 10,
                color: C.dim,
                padding: '8px 20px',
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'Georgia, serif',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && (
          <>
            <div ref={scrollTrackRef} className="sv2-kitchen-scroll-track">
              <div className="sv2-kitchen-scroll-frame">
            {/* ── Signatures ── */}
            <motion.section ref={signaturesSectionRef} className="sv2-kitchen-card sv2-kitchen-signatures" style={{ ...cardStyle, opacity: signaturesOpacity, pointerEvents: signaturesActive ? 'auto' : 'none' }} aria-hidden={!signaturesActive}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Your signatures</span>
                <span style={faintSm}>dishes Sofra can always plate</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  className="sv2-pantry-preset-heading"
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>Quick add from presets</span>
                  {(signatures.length > 0 || selectedDishKeys.length > 0) && (
                    <button type="button" onClick={clearAllSignatures}>CLEAR ALL</button>
                  )}
                </div>
                <FilterTabRow ariaLabel="Signature cuisine categories" options={CUISINE_FILTERS} value={presetCuisine} onChange={setPresetCuisine} />
                <FilterTabRow
                  ariaLabel="Signature role categories"
                  options={ROLE_FILTERS}
                  value={presetRole}
                  onChange={setPresetRole}
                  formatLabel={(r) => (r === 'All' ? 'All' : formatTagLabel(r))}
                />
                <div
                  className="sv2-production-inventory-chips sv2-preset-subjects"
                  aria-label="Signature dishes"
                  tabIndex={0}
                >
                  {customSignatures.map((signature) => (
                    <button key={signature.id} type="button" aria-pressed={!pendingRemovedSignatureIds.includes(signature.id)} onClick={() => toggleSignatureRemoval(signature)} style={presetChip(!pendingRemovedSignatureIds.includes(signature.id))}>
                      {signature.name}
                    </button>
                  ))}
                  {stagedSignatureDrafts
                    .filter((draft) => presetRole === 'All' || draft.tags.find(isDishRole) === presetRole)
                    .map((draft) => (
                      <span key={draft.localId} className="sv2-staged-draft-chip">
                        <button type="button" aria-pressed="true" style={presetChip(true)} disabled>{draft.name}</button>
                        <button type="button" aria-label={`Edit ${draft.name}`} onClick={() => editStagedSignatureDraft(draft)} className="sv2-staged-draft-edit">✎</button>
                      </span>
                    ))}
                  {filteredPresets.map((p) => {
                    const key = dishPresetKey(p)
                    const saved = persistedPresetByKey.get(key)
                    const on = (persistedSelectedPresetKeys.has(key) && !pendingRemovedSignatureIds.includes(saved?.id ?? '')) || selectedDishKeys.includes(key)
                    return (
                      <button
                        key={key}
                        onClick={() => toggleDishSelection(p)}
                        style={presetChip(on)}
                        aria-pressed={on}
                        title={`${p.cuisine}`}
                      >
                        {saved ? saved.name : p.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                ref={sigDraftContainerRef}
                onBlur={handleSignatureDraftBlur}
                onFocus={() => { sigStageIntentRef.current = false }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {editingSignatureId ? 'Edit signature dish' : 'Add your own dish'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="field sm"
                    placeholder="Add a signature dish…"
                    value={sigName}
                    onChange={(e) => {
                      setSigName(e.target.value)
                      setSigAddError('')
                      if (!editingSignatureId) {
                        setSigTagsList([])
                        setSigAllergensList([])
                        setSigTagsRevealed(false)
                        setSigSuggestionReady(false)
                      }
                    }}
                  />
                  {editingSignatureId && (
                    <button onClick={cancelSignatureEdit} style={clearBtn}>Cancel</button>
                  )}
                </div>
                {sigSuggesting && <SuggestionLoadingNotice />}
                {sigSuggestionReady && <SuggestionReviewNotice />}
                {sigTagsRevealed && <><TagGroupsPicker
                  groups={SIGNATURE_TAG_GROUPS}
                  selected={sigTagsList}
                  onToggle={toggleTag}
                />
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    marginTop: 10,
                  }}
                >
                  Contains allergens
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {KITCHEN_ALLERGENS.map((a) => {
                    const on = sigAllergensList.includes(a)
                    return (
                      <button
                        key={a}
                        onClick={() => toggleAllergen(a)}
                        style={vocabChip(on, true)}
                        aria-pressed={on}
                      >
                        {formatTagLabel(a)}
                      </button>
                    )
                  })}
                </div>
                </>}
                {sigAddError && (
                  <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{sigAddError}</p>
                )}
              </div>
            </motion.section>

            {/* ── Pantry ── */}
            <motion.section ref={pantrySectionRef} className="sv2-kitchen-card sv2-kitchen-pantry" style={{ ...cardStyle, opacity: pantryOpacity, pointerEvents: signaturesActive ? 'none' : 'auto' }} aria-hidden={signaturesActive}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>This week’s pantry</span>
                <span style={faintSm}>what’s fresh with Sofra building new dishes from it</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  className="sv2-pantry-preset-heading"
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>Quick add from presets</span>
                  {(pantry.length > 0 || selectedIngredients.length > 0) && (
                    <button type="button" onClick={selectEmptyPantry}>CLEAR ALL</button>
                  )}
                </div>
                <FilterTabRow ariaLabel="Pantry categories" options={INGREDIENT_CATEGORY_FILTERS} value={ingredientCategory} onChange={setIngredientCategory} />
                <div
                  className="sv2-production-pantry-chips sv2-preset-subjects"
                  aria-label="Pantry items"
                  tabIndex={0}
                >
                  {customPantry.map((item) => nothingInPantry ? (
                    <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
                  ) : (
                    <button key={item.id} type="button" aria-pressed={!pendingRemovedPantryIds.includes(item.id)} style={presetChip(!pendingRemovedPantryIds.includes(item.id))} onClick={() => togglePantryRemoval(item)}>{item.name}</button>
                  ))}
                  {stagedPantryDrafts
                    .filter((draft) => ingredientCategory === 'All' || inferIngredientCategory(draft.tags) === ingredientCategory)
                    .map((draft) => (
                      <span key={draft.localId} className="sv2-staged-draft-chip">
                        <button type="button" aria-pressed="true" style={presetChip(true)} disabled>{draft.name}</button>
                        <button type="button" aria-label={`Edit ${draft.name}`} onClick={() => editStagedPantryDraft(draft)} className="sv2-staged-draft-edit">✎</button>
                      </span>
                    ))}
                  {filteredIngredients.map((name) => {
                    const saved = pantry.find((item) => item.name.toLowerCase() === name.toLowerCase())
                    const on = (!nothingInPantry && Boolean(saved) && !pendingRemovedPantryIds.includes(saved?.id ?? '')) || selectedIngredients.includes(name)
                    return saved && !nothingInPantry ? (
                      <button key={name} type="button" aria-pressed={on} style={presetChip(on)} onClick={() => togglePantryRemoval(saved)}>{name}</button>
                    ) : saved ? (
                      <button key={name} type="button" onClick={() => setNothingInPantry(false)} style={presetChip(false)} aria-pressed="false">{name}</button>
                    ) : (
                      <button
                        key={name}
                        onClick={() => toggleIngredientSelection(name)}
                        style={presetChip(on)}
                        aria-pressed={on}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
                {ingredientBatchError && (
                  <p style={{ color: C.rose, fontSize: 12, margin: 0 }}>{ingredientBatchError}</p>
                )}
              </div>

              <div
                ref={pantryDraftContainerRef}
                onBlur={handlePantryDraftBlur}
                onFocus={() => { pantryStageIntentRef.current = false }}
              >
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="field sm"
                  placeholder="Add an ingredient…"
                  value={pantryName}
                  onChange={(e) => {
                    setNothingInPantry(false)
                    setPantryName(e.target.value)
                    setPantryAddError('')
                    setPantryTagsList([])
                    setPantryAllergensList([])
                    setPantryTagsRevealed(false)
                    setPantrySuggestionReady(false)
                  }}
                />
              </div>
              {pantrySuggesting && <SuggestionLoadingNotice />}
              {pantrySuggestionReady && <SuggestionReviewNotice />}
              {/* Tag/allergen chips apply to whichever pantry insert fires next —
                  the manual "Add" button OR the preset "Add selected" batch —
                  and clear on success. Same UX pattern as signatures. */}
              {pantryTagsRevealed && <><div style={{ marginTop: 12 }}>
                <TagGroupsPicker
                  groups={PANTRY_TAG_GROUPS}
                  selected={pantryTagsList}
                  onToggle={togglePantryTag}
                />
              </div>
              <div
                style={{
                  color: C.faint,
                  fontSize: 11,
                  fontFamily: 'system-ui, sans-serif',
                  marginTop: 10,
                }}
              >
                Contains allergens
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {KITCHEN_ALLERGENS.map((a) => {
                  const on = pantryAllergensList.includes(a)
                  return (
                    <button
                      key={a}
                      onClick={() => togglePantryAllergen(a)}
                      style={vocabChip(on, true)}
                      aria-pressed={on}
                    >
                      {formatTagLabel(a)}
                    </button>
                  )
                })}
              </div>
              </>}

              {pantryAddError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{pantryAddError}</p>
              )}
              </div>
            </motion.section>
              </div>
            </div>

            <button
              className="add"
              onClick={() => void submitKitchen()}
              disabled={pantryDoneSaved || publishingDraft || sigAdding || pantryAdding || ingredientBatchAdding || sigSuggesting || pantrySuggesting}
              style={{ width: '100%', marginTop: 12 }}
            >
              {publishingDraft
                ? 'Publishing…'
                : sigAdding || pantryAdding || ingredientBatchAdding
                  ? 'SAVING...'
                : backEvent && !backEvent.isPublished
                  ? 'Publish Invite'
                : pantryDoneSaved
                  ? 'Saved ✓'
                  : !pantryHasAnythingSelected && !signatureHasAnythingSelected
                    ? 'I LITERALLY HAVE NOTHING'
                    : signatures.length === 0 && pantry.length === 0 ? 'SUBMIT' : 'UPDATE'}
            </button>
            {dishBatchError && (
              <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{dishBatchError}</p>
            )}
            {publishError && (
              <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{publishError}</p>
            )}

            {/* Brief */}
            <div style={briefStyle}>
              <span style={{ color: C.gold, fontSize: 15 }}>✦</span>
              <span>
                Signatures give Sofra dishes it can trust. The pantry lets it invent new ones that
                fit the table with no need to write every recipe.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(92, 21, 21, 0.22)',
  borderRadius: 18,
  padding: 18,
  marginBottom: 14,
}

const cardHeadRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 10,
}

const cardTitle: React.CSSProperties = {
  color: 'inherit',
  fontSize: 17,
}

const faintSm: React.CSSProperties = {
  color: 'rgba(92, 21, 21, 0.62)',
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'right',
}

function SuggestionLoadingNotice() {
  return (
    <div role="status" style={{ color: C.faint, fontFamily: 'system-ui, sans-serif', fontSize: 12, lineHeight: 1.45 }}>
      Finding suggested tags...
    </div>
  )
}

function SuggestionReviewNotice() {
  return (
    <div role="status" style={{ color: C.cream, fontFamily: 'system-ui, sans-serif', fontSize: 12, lineHeight: 1.45 }}>
      Sofra suggested the selected tags below. Review or adjust them, then save to confirm.
    </div>
  )
}

function FilterTabRow<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  formatLabel,
}: {
  ariaLabel: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  formatLabel?: (value: T) => string
}) {
  return (
    <div className="sv2-preset-categories" aria-label={ariaLabel}>
      {options.map((option) => {
        const on = value === option
        return (
          <button
            key={option}
            className="chip"
            onClick={() => onChange(option)}
            style={{
              background: on ? C.burgundy : 'transparent',
              borderColor: on ? C.onBurgundy : C.cream,
              color: on ? C.onBurgundy : C.cream,
              padding: '5px 11px',
              fontSize: 12,
              fontFamily: 'system-ui, sans-serif',
              borderRadius: 14,
            }}
          >
            {formatLabel ? formatLabel(option) : option}
          </button>
        )
      })}
    </div>
  )
}

function presetChip(on: boolean): React.CSSProperties {
  return {
    background: on ? '#5C1515' : 'transparent',
    border: `1px solid ${on ? C.onBurgundy : C.cream}`,
    borderRadius: 999,
    color: on ? C.onBurgundy : C.cream,
    padding: '5px 10px',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.18s',
  }
}

function TagGroupsPicker({
  groups,
  selected,
  onToggle,
}: {
  groups: readonly TagGroup[]
  selected: string[]
  onToggle: (tag: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map((group) => (
        <div key={group.label}>
          <div
            style={{
              color: C.faint,
              fontSize: 11,
              fontFamily: 'system-ui, sans-serif',
              marginBottom: 4,
            }}
          >
            {group.label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.tags.map((t) => {
              const on = selected.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => onToggle(t)}
                  style={vocabChip(on, false)}
                  aria-pressed={on}
                >
                  {formatTagLabel(t)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function vocabChip(on: boolean, danger: boolean): React.CSSProperties {
  // Allergen chips use rose/danger palette to match how "avoid" chips look on
  // the guest RSVP page — visual language for "off-limits".
  return {
    background: on ? (danger ? C.danger : C.burgundy) : 'transparent',
    border: `1px solid ${
      on ? C.onBurgundy : C.cream
    }`,
    borderRadius: 14,
    color: on ? C.onBurgundy : C.cream,
    padding: '5px 11px',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.18s',
  }
}

const clearBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(92, 21, 21, 0.62)',
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
  padding: '4px 6px',
  textDecoration: 'underline',
}

const briefStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  background: 'rgba(217,161,91,0.08)',
  border: '1px solid rgba(217,161,91,0.22)',
  borderRadius: 16,
  padding: '14px 16px',
  color: '#5C1515',
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: 'system-ui, sans-serif',
  marginTop: 4,
}
