# Kitchen Scroll Transition and Unified Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Kitchen page's two independently-submitted sections (Signatures, Pantry) with: one
shared submit button, staged (not immediate) pantry ingredient removal, no per-item pantry edit UI, and a
sticky scroll-driven crossfade between the two sections.

**Architecture:** All changes live in `app/(chef)/kitchen/page.tsx` (a single large client component) plus
its stylesheet and test file. Task 1 unifies the data/submit model (no visual change beyond one button
replacing two). Task 2 layers the scroll-driven crossfade on top via Framer Motion, already a project
dependency. Task 3 verifies and documents.

**Tech Stack:** Next.js App Router (client component), React 18, Framer Motion, Jest + Testing Library,
Supabase.

**Reference:** `docs/superpowers/specs/2026-09-06-kitchen-scroll-transition-and-unified-submit-design.md` —
read this first for full rationale. **One deviation from that spec, found while cross-checking the existing
test suite during planning:** the spec's §4 suggested "I LITERALLY HAVE NOTHING" require *both* sections
empty. The existing test `'offers clear-all controls for signatures and pantry, with the empty pantry
action on submit'` (in `__tests__/kitchen-page.test.tsx`) clears only the pantry while 2 signature rows
remain seeded, and expects that label to appear anyway. Requiring both-empty would break this
still-otherwise-valid test and would be inventing a UX change nobody asked for — "I LITERALLY HAVE NOTHING"
is pantry copy ("what's in your kitchen/fridge"), not a whole-kitchen statement. This plan keeps that label
gated on pantry emptiness alone, exactly as it works today — the only actual change is that it's now the
one shared button's label in that state, not a second button's.

---

### Task 1: Stage pantry removal, remove the edit dropdown, and unify submit

**Files:**
- Modify: `app/(chef)/kitchen/page.tsx`
- Modify: `__tests__/kitchen-page.test.tsx`

- [ ] **Step 1: Write the updated/new tests**

Replace `__tests__/kitchen-page.test.tsx` completely with:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KitchenPage from '@/app/(chef)/kitchen/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

type Write = { table: string; kind: 'insert' | 'update' | 'delete'; payload: Record<string, unknown> }
let writes: Write[] = []

const signature = {
  id: 'sig-1',
  name: 'Roast Chicken',
  tags: ['main', 'room_temperature'],
  contains_allergens: [],
  preset_key: null,
}
const savedPreset = {
  id: 'sig-baba',
  name: 'Baba Ganoush',
  tags: ['starter', 'veg'],
  contains_allergens: [],
  preset_key: 'Levantine::baba ganoush',
}
const pantry = {
  id: 'pantry-1',
  name: 'Tomato',
  week_of: '2026-08-03',
  tags: ['savory', 'main'],
  contains_allergens: [],
}

// Mutable "server" rows so order() reflects writes made earlier in a test
// (e.g. renaming, then reloading). Reset fresh in beforeEach.
let signatureRows: Array<Record<string, unknown>> = []
let pantryRows: Array<Record<string, unknown>> = []

function applyUpdate(table: string, id: string, payload: Record<string, unknown>) {
  const rows = table === 'signatures' ? signatureRows : pantryRows
  const idx = rows.findIndex((r) => r.id === id)
  if (idx !== -1) rows[idx] = { ...rows[idx], ...payload }
}

function builder(table: string) {
  let write: Write | null = null
  const chain: Record<string, jest.Mock> & { then?: Promise<unknown>['then'] } = {
    select: jest.fn(() => chain),
    eq: jest.fn((col: string, val: string) => {
      if (col === 'id' && write?.kind === 'update') applyUpdate(table, val, write.payload)
      if (col === 'id' && write?.kind === 'delete') {
        if (table === 'pantry_items') pantryRows = pantryRows.filter((row) => row.id !== val)
        if (table === 'signatures') signatureRows = signatureRows.filter((row) => row.id !== val)
      }
      return chain
    }),
    order: jest.fn(() => Promise.resolve({
      data: table === 'signatures' ? [...signatureRows] : [...pantryRows],
      error: null,
    })),
    insert: jest.fn((payload) => {
      write = { table, kind: 'insert', payload }
      writes.push(write)
      return chain
    }),
    update: jest.fn((payload) => {
      write = { table, kind: 'update', payload }
      writes.push(write)
      return chain
    }),
    single: jest.fn(() => {
      const insertedId = table === 'signatures' ? 'sig-2' : 'pantry-2'
      const data = table === 'signatures'
        ? { ...signature, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? insertedId : signature.id }
        : { ...pantry, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? insertedId : pantry.id }
      if (write?.kind === 'insert') {
        const rows = table === 'signatures' ? signatureRows : pantryRows
        rows.push(data)
      }
      return Promise.resolve({ data, error: null })
    }),
    delete: jest.fn(() => {
      write = { table, kind: 'delete', payload: {} }
      writes.push(write)
      return chain
    }),
  }
  return chain
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}))

beforeEach(() => {
  writes = []
  signatureRows = [{ ...signature }, { ...savedPreset }]
  pantryRows = [{ ...pantry }]
  localStorage.setItem('sofra_user_id', 'chef-1')
  global.fetch = jest.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { kind?: string }
    return {
      ok: true,
      json: async () => body.kind === 'signature'
        ? { tags: ['main', 'rich'], allergens: [] }
        : { tags: ['savory'], allergens: [] },
    } as Response
  })
})

test('signature picker exposes Main while pantry has no role controls or legacy role chip', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Test dish' } })
  expect(screen.queryByRole('button', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.getByText('Finding suggested tags...')).toBeInTheDocument()
  const main = await screen.findByRole('button', { name: 'Main' })
  expect(main).toBeInTheDocument()
  expect(main).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText(/review or adjust them/i)).toBeInTheDocument()

  const pantryCard = screen.getByText("This week’s pantry").parentElement?.parentElement
  expect(pantryCard).toBeTruthy()
  expect(within(pantryCard as HTMLElement).queryByText('Role')).not.toBeInTheDocument()
  expect(within(pantryCard as HTMLElement).queryByText('Main')).not.toBeInTheDocument()
  expect(within(pantryCard as HTMLElement).queryByText('Savory')).not.toBeInTheDocument()
})

test('saved signatures and pantry items render once as active chips', async () => {
  render(<KitchenPage />)

  const savedSignature = await screen.findByRole('button', { name: 'Roast Chicken' })
  const savedPantry = await screen.findByRole('button', { name: 'Tomato' })

  expect(savedSignature).toHaveAttribute('aria-pressed', 'true')
  expect(savedPantry).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('button', { name: 'Roast Chicken' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Tomato' })).toHaveLength(1)
})

test('rehydrates a saved preset with the exact filled pending-selection style', async () => {
  render(<KitchenPage />)

  const saved = await screen.findByRole('button', { name: 'Baba Ganoush' })
  expect(saved).toHaveAttribute('aria-pressed', 'true')
  expect(saved).toHaveStyle({ background: '#5C1515', color: 'var(--sf-intel-on-burgundy)' })
})

test('renders a saved pantry preset with visible selected text colors', async () => {
  render(<KitchenPage />)
  const tomato = await screen.findByRole('button', { name: 'Tomato' })
  expect(tomato).toHaveStyle({ background: '#5C1515', color: 'var(--sf-intel-on-burgundy)' })
})

test('inactive Kitchen chips use the theme primary text color in dark mode', async () => {
  render(<KitchenPage />)
  const guacamole = await screen.findByRole('button', { name: 'Guacamole' })
  expect(guacamole).toHaveStyle({ color: 'var(--sf-intel-text)' })
  expect(guacamole.style.border).toBe('1px solid var(--sf-intel-text)')
})

test('stages preset changes until the single shared submit action', async () => {
  render(<KitchenPage />)
  const hummus = await screen.findByRole('button', { name: 'Hummus' })

  fireEvent.click(hummus)
  expect(hummus).toHaveAttribute('aria-pressed', 'true')
  expect(writes.some(write => write.kind === 'insert')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some(write => write.table === 'signatures' && write.kind === 'insert')).toBe(true))
})

test('preset picker shows a preset-derived signature under its current stored name, not the stale preset label', async () => {
  // Simulates a legacy signature whose stored name differs from the preset.
  signatureRows.push({
    id: 'sig-renamed-hummus',
    name: "Grandma's Hummus",
    tags: ['starter', 'veg'],
    contains_allergens: [],
    preset_key: 'Levantine::hummus',
  })

  render(<KitchenPage />)

  const renamed = await screen.findByRole('button', { name: "Grandma's Hummus" })
  expect(renamed).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('button', { name: 'Hummus' })).not.toBeInTheDocument()
})

test('creating a signature persists the raw main role and hides saved-signature editing', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), {
    target: { value: 'Lamb Shoulder' },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true'))
  expect(writes.some((write) => write.table === 'signatures' && write.kind === 'insert')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some((write) =>
    write.table === 'signatures'
      && write.kind === 'insert'
      && (write.payload.tags as string[]).includes('main')
  )).toBe(true))
  expect(screen.queryByLabelText('Edit a saved signature')).not.toBeInTheDocument()
})

test('adding a pantry item persists binary availability without quantity or unit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Chicken' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Savory' })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    const insert = writes.find((write) => write.table === 'pantry_items' && write.kind === 'insert')
    expect(insert?.payload.name).toBe('Chicken')
    expect(insert?.payload).not.toHaveProperty('quantity_amount')
    expect(insert?.payload).not.toHaveProperty('quantity_unit')
  })
})

test('does not render pantry quantity or unit controls', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  expect(screen.queryByLabelText('Quantity amount')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity unit')).not.toBeInTheDocument()
})

test('offers clear-all controls for signatures and pantry, with the empty pantry action on submit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const signatureCard = document.querySelector('.sv2-kitchen-signatures') as HTMLElement
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  expect(within(signatureCard).getByRole('button', { name: 'CLEAR ALL' })).toBeInTheDocument()
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(within(pantryCard).getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('button', { name: 'I HAVE NOTHING' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' }))
  await waitFor(() => expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true))
})

test('a pantry selection immediately replaces the empty action and stays selected when filtered out of view', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Chicken thighs' }))
  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Fruits' }))
  expect(within(pantryCard).queryByRole('button', { name: 'Chicken thighs' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()
})

test('clicking a saved pantry chip stages its removal instead of deleting immediately', async () => {
  render(<KitchenPage />)
  const tomato = await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.click(tomato)
  expect(tomato).toHaveAttribute('aria-pressed', 'false')
  expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))
  await waitFor(() => expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true))
})

test('there is no way to reopen a saved pantry item for editing', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  expect(screen.queryByLabelText('Edit a saved pantry item')).not.toBeInTheDocument()
})
```

Compared to the current file, this: keeps the first 6 tests unchanged; rewrites 3 tests
(`'stages preset changes...'`, `'creating a signature...'`, `'adding a pantry item...'`,
`'offers clear-all controls...'`, `'a pantry selection immediately replaces...'`) to look up the submit
button unscoped (`screen.getByRole`) instead of scoped to one card, since there's now only one; **deletes**
`'pantry update strips legacy roles and keeps raw descriptive tags'` entirely (it exercised editing an
existing pantry item via the now-removed dropdown — that user action no longer exists, so this specific
regression can't happen anymore either); and **adds** two new tests for the staged-removal and
no-edit-dropdown behavior this task introduces.

- [ ] **Step 2: Run the tests and confirm the expected failures**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: FAIL — multiple failures, primarily because `screen.getByRole('button', { name: 'UPDATE' })`
currently matches *two* buttons (one per card), and the two new tests reference behavior that doesn't
exist yet (chip click currently deletes immediately; the edit dropdown is currently present).

- [ ] **Step 3: State changes**

In `app/(chef)/kitchen/page.tsx`, change:

```ts
  const [editingPantryId, setEditingPantryId] = useState<string | null>(null)
  const [pantryAdding, setPantryAdding] = useState(false)
  const [pantryAddError, setPantryAddError] = useState('')
  const [pantryDeleteError, setPantryDeleteError] = useState('')
```

to:

```ts
  const [pantryAdding, setPantryAdding] = useState(false)
  const [pantryAddError, setPantryAddError] = useState('')
  const [pendingRemovedPantryIds, setPendingRemovedPantryIds] = useState<string[]>([])
```

- [ ] **Step 4: Replace `deletePantryItem` with `togglePantryRemoval`**

Change:

```ts
  async function deletePantryItem(item: PantryItem) {
    const uid = uidRef.current
    if (!uid) return
    setPantryDeleteError('')
    const prev = pantry
    setPantry((p) => p.filter((x) => x.id !== item.id))

    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', item.id)
      .eq('chef_id', uid)

    if (error) {
      setPantry(prev)
      setPantryDeleteError('Failed to remove item. Try again.')
    }
  }
```

to:

```ts
  function togglePantryRemoval(item: PantryItem) {
    setPendingRemovedPantryIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])
  }
```

- [ ] **Step 5: Remove `editPantryItem`, simplify `cancelPantryEdit`**

Find `editPantryItem` and `cancelPantryEdit` (they sit next to each other, right after
`toggleSignatureRemoval`/`clearAllSignatures`):

```ts
  function editPantryItem(item: PantryItem) {
    setEditingPantryId(item.id)
    setPantryName(item.name)
    setPantryTagsList(pantryTagsForPersistence(item.tags))
    setPantryAllergensList([...item.contains_allergens])
    setPantryAddError('')
    setPantryTagsRevealed(true)
    setPantrySuggestionReady(false)
  }

  function cancelPantryEdit() {
    setEditingPantryId(null)
    setPantryName('')
    setPantryTagsList([])
    setPantryAllergensList([])
    setPantryTagsRevealed(false)
    setPantrySuggestionReady(false)
  }
```

Replace with just:

```ts
  function cancelPantryEdit() {
    setPantryName('')
    setPantryTagsList([])
    setPantryAllergensList([])
    setPantryTagsRevealed(false)
    setPantrySuggestionReady(false)
  }
```

- [ ] **Step 6: Remove the `editingPantryId` dependency from the pantry metadata-suggestion effect**

Find (this effect debounces the Gemini tag-suggestion call while typing a new ingredient name):

```ts
    const name = pantryName.trim()
    if (editingPantryId || !name) {
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
```

and the effect's dependency array a few lines below it:

```ts
  }, [editingPantryId, pantryName]) // eslint-disable-line react-hooks/exhaustive-deps
```

Change to:

```ts
    const name = pantryName.trim()
    if (!name) {
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
```

```ts
  }, [pantryName]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 7: Update `pantryHasAnythingSelected`**

Change:

```ts
  const pantryHasAnythingSelected = selectedIngredients.length > 0
    || Boolean(pantryName.trim())
    || (!nothingInPantry && pantry.length > 0)
```

to:

```ts
  const pantryHasAnythingSelected = selectedIngredients.length > 0
    || Boolean(pantryName.trim())
    || (!nothingInPantry && pantry.some(item => !pendingRemovedPantryIds.includes(item.id)))
```

- [ ] **Step 8: Replace both save functions with one `submitKitchen`**

Delete `saveSignatureChanges` (the whole function, from `async function saveSignatureChanges() {` through
its closing `}`) and `savePantryAndContinue` (same, through its closing `}` — note `handlePantryDone`, the
function *between* them, stays exactly where it is and is unchanged). In their place — i.e., spanning from
where `saveSignatureChanges` used to start through where `savePantryAndContinue` used to end, with
`handlePantryDone` preserved in the middle exactly as-is — put:

```ts
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

    const results = await Promise.allSettled([
      ...dishTargets.map((p) =>
        supabase.from('signatures').insert({
          chef_id: uid, name: p.name, tags: withDishRole(p.tags, p.role), contains_allergens: p.allergens,
          novelty_score: p.novelty_score ?? null, is_substantial: p.is_substantial ?? (p.role === 'main'),
          preset_key: dishPresetKey(p),
        }).select('id, name, tags, contains_allergens, novelty_score, is_substantial, preset_key').single()
      ),
      ...pendingRemovedSignatureIds.map(id => supabase.from('signatures').delete().eq('id', id).eq('chef_id', uid)),
      ...(sigFormOperation ? [sigFormOperation] : []),
      ...(nothingInPantry ? pantry.map((item) => supabase.from('pantry_items').delete().eq('id', item.id).eq('chef_id', uid)) : []),
      ...(!nothingInPantry ? pendingRemovedPantryIds.map(id => supabase.from('pantry_items').delete().eq('id', id).eq('chef_id', uid)) : []),
      ...selectedIngredients.map((selectedName) =>
        supabase.from('pantry_items').insert({ chef_id: uid, name: selectedName, week_of: weekOf, tags: pantryTags, contains_allergens: pantryAllergens })
      ),
      ...(pantryFormOperation ? [pantryFormOperation] : []),
    ])

    const failed = results.some(result => result.status === 'rejected' || Boolean(result.value.error))
    setSigAdding(false)
    setPantryAdding(false)
    setIngredientBatchAdding(false)
    if (failed) {
      setDishBatchError("Couldn't update your kitchen. Your pending changes are still here with the option to try again.")
      return
    }

    setSelectedDishKeys([])
    setPendingRemovedSignatureIds([])
    cancelSignatureEdit()
    setSelectedIngredients([])
    setPendingRemovedPantryIds([])
    setNothingInPantry(false)
    cancelPantryEdit()
    await loadData()
    await handlePantryDone()
  }
```

- [ ] **Step 9: Update the pantry chip JSX to use staged removal**

Change (the `customPantry`/`filteredIngredients` chip rendering inside the Pantry section):

```tsx
                  {customPantry.map((item) => nothingInPantry ? (
                    <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
                  ) : (
                    <button key={item.id} type="button" aria-pressed="true" style={presetChip(true)} onClick={() => void deletePantryItem(item)}>{item.name}</button>
                  ))}
                  {filteredIngredients.map((name) => {
                    const saved = pantry.find((item) => item.name.toLowerCase() === name.toLowerCase())
                    const on = (!nothingInPantry && Boolean(saved)) || selectedIngredients.includes(name)
                    return saved && !nothingInPantry ? (
                      <button key={name} type="button" aria-pressed="true" style={presetChip(true)} onClick={() => void deletePantryItem(saved)}>{name}</button>
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
```

to:

```tsx
                  {customPantry.map((item) => nothingInPantry ? (
                    <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
                  ) : (
                    <button key={item.id} type="button" aria-pressed={!pendingRemovedPantryIds.includes(item.id)} style={presetChip(!pendingRemovedPantryIds.includes(item.id))} onClick={() => togglePantryRemoval(item)}>{item.name}</button>
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
```

- [ ] **Step 10: Remove the "Edit a saved pantry item" dropdown and the pantry Cancel button**

Delete this whole block:

```tsx
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {pantry.length > 0 && (
                  <label className="sv2-inventory-edit-select">
                    Edit a saved pantry item
                    <select
                      value={editingPantryId ?? ''}
                      onChange={(event) => {
                        const item = pantry.find((savedItem) => savedItem.id === event.target.value)
                        if (item) editPantryItem(item)
                        else cancelPantryEdit()
                      }}
                    >
                      <option value="">Choose a pantry item</option>
                      {pantry.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
```

Then, in the ingredient-name-input block right after it, remove the "Cancel" button and the now-always-true
guard:

```tsx
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="field sm"
                  placeholder="Add an ingredient…"
                  value={pantryName}
                  onChange={(e) => {
                    setNothingInPantry(false)
                    setPantryName(e.target.value)
                    setPantryAddError('')
                    if (!editingPantryId) {
                      setPantryTagsList([])
                      setPantryAllergensList([])
                      setPantryTagsRevealed(false)
                      setPantrySuggestionReady(false)
                    }
                  }}
                />
                {editingPantryId && (
                  <button onClick={cancelPantryEdit} style={clearBtn}>Cancel</button>
                )}
              </div>
```

becomes:

```tsx
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
```

- [ ] **Step 11: Remove both existing submit buttons; add the one shared button**

Delete the signatures button (at the end of the Signatures section):

```tsx
                <button className="add" onClick={() => void saveSignatureChanges()} disabled={!signaturesDirty || sigAdding || sigSuggesting} style={{ marginTop: 12, width: '100%' }}>
                  {sigAdding ? 'SAVING...' : signatures.length === 0 ? 'SUBMIT' : 'UPDATE'}
                </button>
```

(just the button — the `</div></section>` that follow it stay, closing out the Signatures section
normally.)

Delete the pantry button and its two error paragraphs, and everything from `pantryDeleteError` in that
final block (it no longer exists after Step 3):

```tsx
              <button
                className="add"
                onClick={() => void savePantryAndContinue()}
                disabled={pantryDoneSaved || publishingDraft || pantryAdding || ingredientBatchAdding || pantrySuggesting}
                style={{
                  width: '100%',
                  marginTop: 12,
                }}
              >
                {publishingDraft
                  ? 'Publishing…'
                  : pantryAdding || ingredientBatchAdding
                    ? 'SAVING...'
                  : backEvent && !backEvent.isPublished
                    ? 'Publish Invite'
                  : pantryDoneSaved
                    ? 'Saved ✓'
                    : !pantryHasAnythingSelected
                      ? 'I LITERALLY HAVE NOTHING'
                      : pantry.length === 0 ? 'SUBMIT' : 'UPDATE'}
              </button>
              {publishError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{publishError}</p>
              )}
            </section>
```

Replace with (note this moves the closing `</section>` to right after the Pantry section's own content,
then the new button and its errors sit *outside* both sections, before the Brief block):

```tsx
            </section>

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
                  : !pantryHasAnythingSelected
                    ? 'I LITERALLY HAVE NOTHING'
                    : signatures.length === 0 && pantry.length === 0 ? 'SUBMIT' : 'UPDATE'}
            </button>
            {dishBatchError && (
              <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{dishBatchError}</p>
            )}
            {publishError && (
              <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{publishError}</p>
            )}
```

`signaturesDirty` is now unused (verified: its only two references in the whole file are its own
declaration and the just-deleted button). Delete its declaration too:

```ts
  const signaturesDirty = selectedDishKeys.length > 0 || pendingRemovedSignatureIds.length > 0 || signatureFormDirty
```

(This line sits right after `signatureFormDirty`'s own `useMemo` block. `signatureFormDirty` itself is
still used elsewhere and stays.)

`dishBatchError` was already rendered inline inside the Signatures section before (right after the preset
chip grid: `{dishBatchError && (<p style={{ color: C.rose, fontSize: 12, margin: 0 }}>{dishBatchError}</p>)}`).
Delete that old inline render site — it's now rendered once, after the shared button, as shown above.

- [ ] **Step 12: Run the tests and confirm they pass**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS — all 13 tests (11 kept/updated + 2 new) pass.

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors. (This will also catch any other file in the codebase that imports
`saveSignatureChanges`/`savePantryAndContinue`/`editPantryItem`/`deletePantryItem` — there shouldn't be any,
since they're all locally-scoped functions inside this one page component, but the compiler is the
authority here.)

- [ ] **Step 14: Commit**

```bash
git add "app/(chef)/kitchen/page.tsx" __tests__/kitchen-page.test.tsx
git commit -m "Unify Kitchen submit and stage pantry removal instead of deleting immediately"
```

---

### Task 2: Sticky-pinned scroll crossfade

**Files:**
- Modify: `app/(chef)/kitchen/page.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`
- Modify: `__tests__/kitchen-page.test.tsx`

- [ ] **Step 1: Add the `framer-motion` mock to the test file**

In `__tests__/kitchen-page.test.tsx`, add this mock alongside the existing `jest.mock('next/navigation', ...)`
call near the top of the file:

```ts
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  useScroll: () => ({ scrollYProgress: { on: () => () => {}, get: () => 0 } }),
  useTransform: () => 0,
}))
```

- [ ] **Step 2: Run the existing suite and confirm it still passes**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS — this step only adds a mock nothing uses yet, so this should be a no-op confirming the
baseline is still green before changing any component code.

- [ ] **Step 3: Add the Framer Motion imports and scroll-progress hook**

In `app/(chef)/kitchen/page.tsx`, change the top of the import block:

```ts
import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
```

to:

```ts
import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
```

Then, inside `KitchenPageInner`, add this near the top of the function body (right after
`const fromPage = ...` and before the rest of the state declarations is fine — it doesn't depend on
anything declared later):

```ts
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: scrollTrackRef, offset: ['start start', 'end end'] })
  const signaturesOpacity = useTransform(scrollYProgress, [0, 0.45, 0.55], [1, 1, 0])
  const pantryOpacity = useTransform(scrollYProgress, [0.45, 0.55, 1], [0, 1, 1])
```

- [ ] **Step 4: Wrap the two sections in the sticky scroll track**

Find the block that currently renders both sections directly inside the `{!loading && !fetchError && (<>`
fragment:

```tsx
        {!loading && !fetchError && (
          <>
            {/* ── Signatures ── */}
            <section className="sv2-kitchen-card sv2-kitchen-signatures" style={cardStyle}>
```

Change the opening to:

```tsx
        {!loading && !fetchError && (
          <>
            <div ref={scrollTrackRef} className="sv2-kitchen-scroll-track">
              <div className="sv2-kitchen-scroll-frame">
            {/* ── Signatures ── */}
            <motion.section className="sv2-kitchen-card sv2-kitchen-signatures" style={{ ...cardStyle, opacity: signaturesOpacity }}>
```

Find the Pantry section's opening tag:

```tsx
            {/* ── Pantry ── */}
            <section className="sv2-kitchen-card sv2-kitchen-pantry" style={cardStyle}>
```

Change to:

```tsx
            {/* ── Pantry ── */}
            <motion.section className="sv2-kitchen-card sv2-kitchen-pantry" style={{ ...cardStyle, opacity: pantryOpacity }}>
```

Find where the Pantry section closes (from Task 1, this is now right before the new shared submit button):

```tsx
            </section>

            <button
              className="add"
              onClick={() => void submitKitchen()}
```

Change to:

```tsx
            </motion.section>
              </div>
            </div>

            <button
              className="add"
              onClick={() => void submitKitchen()}
```

(The Signatures section's own closing tag — the one right before `{/* ── Pantry ── */}` — also needs to
change from `</section>` to `</motion.section>`. There are exactly two `<section className="sv2-kitchen-card"`
tags in this file after Task 1 (Signatures and Pantry) and their two matching closes — both become
`motion.section`/`</motion.section>` as a pair; nothing else in the file uses that exact class prefix.)

- [ ] **Step 5: Add the CSS**

Append to `components/sofra-v2/sofra-v2.css`:

```css
.sv2-kitchen-scroll-track{position:relative;height:180vh}
.sv2-kitchen-scroll-frame{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden}
.sv2-kitchen-scroll-frame .sv2-kitchen-card{position:absolute;inset:0;margin:auto 0;max-height:100%;overflow-y:auto}
```

- [ ] **Step 6: Run the tests and confirm they still pass**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS — the mocked `motion.section` renders as a plain `<section>`, so every existing
`document.querySelector('.sv2-kitchen-signatures')`/`.sv2-kitchen-pantry` lookup and every `within(...)`
scoping in the test file keeps working unchanged.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(chef)/kitchen/page.tsx" components/sofra-v2/sofra-v2.css __tests__/kitchen-page.test.tsx
git commit -m "Add the sticky scroll-driven crossfade between Signatures and Pantry"
```

---

### Task 3: Full verification, manual browser check, and documentation

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run the complete test suite**

Run: `npx jest --silent`

Expected: the same pre-existing baseline failures as before this feature (`login-page.test.tsx`,
`events-page.test.tsx`, `event-detail-page.test.tsx`, `design-preview-application.test.tsx` — 4 suites, 19
tests, all unrelated to the Kitchen page), plus `__tests__/kitchen-page.test.tsx` passing in full. If
anything else newly fails, stop and fix it before continuing.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 3: Manual browser check**

Same limitation as the host-entry-plate feature: no Playwright/chromium-cli is available in this
environment, so the actual scroll feel (crossfade timing, whether `180vh`/`100vh` are the right values,
whether the sticky frame releases cleanly into the rest of the page) cannot be verified here. Do the
reduced structural version instead:

1. Start the dev server (`npm run dev`), poll with `curl` until ready (find the actual bound port from the
   startup log — it may not be 3000).
2. `curl` `/kitchen` and confirm a 200 and that the response includes the expected structural markers:
   `sv2-kitchen-scroll-track`, `sv2-kitchen-signatures`, `sv2-kitchen-pantry`, and exactly one occurrence of
   `class="add"` for the submit button (confirming the old second button is really gone — grep the raw
   HTML, don't just eyeball it).
3. Stop the dev server cleanly.

State explicitly in the report that the actual scroll animation was not visually verified and remains
outstanding — same as the equivalent step in the host-entry-plate plan.

- [ ] **Step 4: Document the feature**

Add a new dated section to `docs/IMPLEMENTATION_STATUS.md`, after the most recent existing entry:

```markdown
# Kitchen scroll transition and unified submit (2026-09-06)

- The Kitchen page's Signatures and Pantry sections now share one sticky scroll frame: scrolling from one
  into the other plays a Framer-Motion-driven crossfade (position/size held in place, opacity swaps) instead
  of the two sections just being stacked one after another.
- One shared submit button, positioned after the Pantry section, now saves everything from both sections in
  a single action — new/removed signature selections, new/removed pantry selections, any newly-typed custom
  dish or ingredient, and the existing kitchen-completion/invite-publish step. The two separate per-section
  submit buttons are gone.
- Removing a saved pantry ingredient is now staged, matching how signature dish removal already worked —
  clicking a saved chip toggles it off visually; nothing is deleted from the database until the shared
  submit button is pressed.
- The "Edit a saved pantry item" dropdown is removed. A saved ingredient can still be removed (by clicking
  its chip), but its tags/allergens can no longer be reopened and changed after the fact. Signature dish
  editing is unaffected.
- **Known limitation:** the actual scroll animation (crossfade timing, exact scroll distance) has not been
  visually verified in this environment — there is no Playwright/chromium-cli tooling available here. A
  structural check (dev server + curl) confirmed the route serves the expected markup, but the transition
  itself needs a real browser check before considering this fully done.
```

- [ ] **Step 5: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document the Kitchen scroll transition and unified submit"
```

---

## Acceptance criteria (from the spec)

- [x] Only one submit button exists on the Kitchen page, positioned after the Pantry section.
- [x] Clicking a saved pantry ingredient chip stages its removal without deleting anything until the next
      real submit.
- [x] There is no way to reopen a saved pantry item's tags/allergens for editing; signature dish editing is
      unaffected.
- [ ] Scrolling from Signatures into Pantry plays a pinned crossfade — blocked on Task 3 Step 3's manual
      check (jsdom cannot verify this).
- [x] The one submit button still correctly handles every existing outcome: first-time SUBMIT, later UPDATE,
      the transient "Saved ✓," and "Publish Invite" for an unpublished draft event.
- [x] Nothing about signature dish behavior (editing, staged removal, custom-dish add) changes.
