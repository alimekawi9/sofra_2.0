# Restaurant Menu Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a host types a restaurant name that closely matches one already reviewed anywhere in Sofra, offer to reuse that reviewed dish list instead of re-running AI extraction and manual review.

**Architecture:** A new Postgres migration adds a `pg_trgm`-powered fuzzy-match RPC (`search_similar_restaurant_menu`, anonymous/read-only, system-wide) and a copy RPC (`reuse_restaurant_menu`, event-scoped like every other write in this table). The existing restaurant-menu review page (`app/(chef)/events/[id]/out/page.tsx`) gets a debounced search-as-you-type effect (same shape as `HostLocationAutocomplete`) that shows a small suggestion banner under the restaurant name field.

**Tech Stack:** Next.js App Router, Supabase Postgres (RPC functions, `pg_trgm` extension), React state/effects, Jest + Testing Library.

**Reference:** `docs/superpowers/specs/2026-08-31-restaurant-menu-reuse-design.md` — read this first for the full rationale (why system-wide, why anonymous, why `pg_trgm`).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260831000002_add_restaurant_menu_reuse.sql`

- [ ] **Step 1: Write the migration file**

```sql
create extension if not exists pg_trgm;

alter table public.restaurant_menus drop constraint if exists restaurant_menus_source_type_check;
alter table public.restaurant_menus
  add constraint restaurant_menus_source_type_check
  check (source_type in ('text', 'image', 'pdf', 'reused'));

create or replace function public.search_similar_restaurant_menu(p_user_id uuid, p_restaurant_name text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with normalized as (
    select m.id, m.restaurant_name,
      similarity(
        lower(regexp_replace(m.restaurant_name, '[^a-zA-Z0-9 ]', '', 'g')),
        lower(regexp_replace(p_restaurant_name, '[^a-zA-Z0-9 ]', '', 'g'))
      ) as score,
      m.created_at
    from public.restaurant_menus m
    where exists (
      select 1 from public.users u where u.id = p_user_id
    )
    and char_length(btrim(coalesce(p_restaurant_name, ''))) >= 3
    and exists (
      select 1 from public.restaurant_menu_dishes d
      where d.restaurant_menu_id = m.id and d.review_status in ('confirmed', 'auto_confirmed')
    )
  ),
  best as (
    select id, restaurant_name from normalized
    where score > 0.45
    order by score desc, created_at desc
    limit 1
  )
  select case when best.id is null then null else jsonb_build_object(
    'restaurant_name', best.restaurant_name,
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', d.name, 'role', d.role, 'tags', d.tags, 'contains_allergens', d.contains_allergens
      ) order by d.source_order, d.id)
      from public.restaurant_menu_dishes d
      where d.restaurant_menu_id = best.id and d.review_status in ('confirmed', 'auto_confirmed')
    ), '[]'::jsonb)
  ) end
  from best
$$;

grant execute on function public.search_similar_restaurant_menu(uuid, text) to anon, authenticated;

create or replace function public.reuse_restaurant_menu(
  p_event_id uuid,
  p_user_id uuid,
  p_restaurant_name text,
  p_dishes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_id uuid;
  dish jsonb;
  dish_index integer := 0;
  dish_name text;
  dish_role text;
begin
  if not public.can_access_event_restaurant_menus(p_event_id, p_user_id) then return null; end if;
  if char_length(btrim(coalesce(p_restaurant_name, ''))) not between 1 and 160 then return null; end if;
  if jsonb_typeof(p_dishes) <> 'array' or jsonb_array_length(p_dishes) < 1 or jsonb_array_length(p_dishes) > 80 then
    return null;
  end if;

  insert into public.restaurant_menus(event_id, created_by, restaurant_name, source_type, status, confirmed_at)
  values (p_event_id, p_user_id, btrim(p_restaurant_name), 'reused', 'confirmed', now())
  returning id into menu_id;

  for dish in select value from jsonb_array_elements(p_dishes)
  loop
    dish_name := btrim(coalesce(dish->>'name', ''));
    dish_role := coalesce(dish->>'role', 'flex');
    if char_length(dish_name) not between 1 and 160 or dish_role not in ('starter','main','side','dessert','flex') then
      raise exception 'Invalid reused dish';
    end if;
    insert into public.restaurant_menu_dishes(
      restaurant_menu_id, source_order, source_text, name,
      ai_suggested_role, ai_suggested_tags, ai_suggested_allergens, ai_confidence,
      role, tags, contains_allergens, review_status, reviewed_by, reviewed_at
    ) values (
      menu_id, dish_index, dish_name, dish_name,
      dish_role,
      array(select jsonb_array_elements_text(coalesce(dish->'tags', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'contains_allergens', '[]'::jsonb))), 1,
      dish_role,
      array(select jsonb_array_elements_text(coalesce(dish->'tags', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'contains_allergens', '[]'::jsonb))),
      'confirmed', p_user_id, now()
    );
    dish_index := dish_index + 1;
  end loop;
  return menu_id;
end
$$;

grant execute on function public.reuse_restaurant_menu(uuid, uuid, text, jsonb) to anon, authenticated;
```

- [ ] **Step 2: Self-review the SQL**

Read it back top to bottom and confirm:
- The `source_type` constraint drop/add follows the exact same pattern as
  `supabase/migrations/20260830000005_support_restaurant_menu_pdf.sql`.
- `search_similar_restaurant_menu` never selects `created_by`, `event_id`, `reviewed_by`, or any
  timestamp into its returned `jsonb` — only `restaurant_name` and the dish fields.
- `reuse_restaurant_menu` calls `can_access_event_restaurant_menus` (the existing per-event check) before
  writing anything — the read side is intentionally global, the write side is not.
- Every `grant execute` line matches an existing function signature exactly (`(uuid, text)` and
  `(uuid, uuid, text, jsonb)`).

There is no local Postgres instance available in this environment (no `SUPABASE_ACCESS_TOKEN` / DB
connection string — same limitation noted throughout `docs/IMPLEMENTATION_STATUS.md` for prior
migrations), so this cannot be executed against a live database as part of this plan. It will need to be
applied through the Supabase dashboard or CLI once a connection is available — record this as a known
limitation in Task 5.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260831000002_add_restaurant_menu_reuse.sql
git commit -m "Add restaurant menu reuse migration (pg_trgm fuzzy match + reuse RPC)"
```

---

### Task 2: Shared types, constants, and the source-type label helper

**Files:**
- Modify: `lib/restaurant-menu.ts`
- Test: `__tests__/restaurant-menu.test.ts`

- [ ] **Step 1: Write the failing test**

Add this import and `describe` block to `__tests__/restaurant-menu.test.ts` (the file already imports from
`@/lib/restaurant-menu` at the top — extend that import line rather than adding a second one):

```ts
import { buildIntel, type TasteProfile } from '@/lib/intel'
import { parseRestaurantMenuFileDataUrl, restaurantMenuSourceLabel, restaurantProposalNeedsReview, sanitizeRestaurantMenuExtraction, scoreConfirmedRestaurantDish } from '@/lib/restaurant-menu'
```

Then add, right before the final closing `})` of the `describe('restaurant menu extraction boundary', ...)`
block (after the last existing `it(...)`, so it becomes the 7th test in that block):

```ts
  it('labels every restaurant-menu source type, including a reused menu', () => {
    expect(restaurantMenuSourceLabel('text')).toBe('PASTED MENU')
    expect(restaurantMenuSourceLabel('pdf')).toBe('UPLOADED PDF')
    expect(restaurantMenuSourceLabel('image')).toBe('UPLOADED MENU')
    expect(restaurantMenuSourceLabel('reused')).toBe('REUSED MENU')
  })
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest __tests__/restaurant-menu.test.ts`

Expected: FAIL — `restaurantMenuSourceLabel` is not exported from `@/lib/restaurant-menu` (TypeScript/module
resolution error, since the function doesn't exist yet).

- [ ] **Step 3: Implement the types, constants, and helper**

In `lib/restaurant-menu.ts`, change the `RestaurantMenuSourceType` line (currently `export type
RestaurantMenuSourceType = 'text' | 'image' | 'pdf'`) to:

```ts
export type RestaurantMenuSourceType = 'text' | 'image' | 'pdf' | 'reused'
```

Change the `RestaurantMenuInlineFile` type's `sourceType` field (currently
`sourceType: Exclude<RestaurantMenuSourceType, 'text'>`) to a precise literal union, since `Exclude` would
now also (incorrectly) allow `'reused'` for what is always an actual uploaded file:

```ts
export type RestaurantMenuInlineFile = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  data: string
  sourceType: 'image' | 'pdf'
}
```

Add these two constants right after `export const MAX_RESTAURANT_MENU_FILE_BYTES = 5 * 1024 * 1024`:

```ts
export const RESTAURANT_NAME_SEARCH_MIN_LENGTH = 3
export const RESTAURANT_NAME_SEARCH_DEBOUNCE_MS = 450
```

Add these two types right after the closing `}` of the `RestaurantMenu` type (after the `dishes:
RestaurantMenuDish[]` field):

```ts
export type SimilarRestaurantMenuDish = {
  name: string
  role: DishRole
  tags: string[]
  contains_allergens: string[]
}

export type SimilarRestaurantMenu = {
  restaurant_name: string
  dishes: SimilarRestaurantMenuDish[]
}
```

Add the label helper right after those two new types (still before `const allowedTagSet = ...`):

```ts
export function restaurantMenuSourceLabel(sourceType: RestaurantMenuSourceType): string {
  switch (sourceType) {
    case 'text': return 'PASTED MENU'
    case 'pdf': return 'UPLOADED PDF'
    case 'reused': return 'REUSED MENU'
    case 'image': return 'UPLOADED MENU'
  }
}
```

(No `default` case — this keeps the switch exhaustive over `RestaurantMenuSourceType`, so adding a future
source type without updating this function is a compile error, not a silent fallback.)

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest __tests__/restaurant-menu.test.ts`

Expected: PASS — all 7 tests in the file pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no new errors. (This also catches anything else in the codebase that constructs a
`RestaurantMenuInlineFile` or a `RestaurantMenuSourceType` in a way the tightened types no longer accept —
there shouldn't be any, since `parseRestaurantMenuFileDataUrl` already only ever produces `'image'` or
`'pdf'`.)

- [ ] **Step 6: Commit**

```bash
git add lib/restaurant-menu.ts __tests__/restaurant-menu.test.ts
git commit -m "Add restaurant-menu-reuse types and a shared source-type label helper"
```

---

### Task 3: Search-as-you-type suggestion and reuse action on the restaurant menu page

**Files:**
- Modify: `app/(chef)/events/[id]/out/page.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`
- Create: `__tests__/restaurant-menu-reuse.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/restaurant-menu-reuse.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestaurantMenusPage from '@/app/(chef)/events/[id]/out/page'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { fetchEventTasteAttendees } from '@/lib/event-attendees'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
jest.mock('@/lib/supabase/client')
jest.mock('@/lib/event-access', () => ({ isEventManager: jest.fn() }))
jest.mock('@/lib/event-attendees', () => ({ fetchEventTasteAttendees: jest.fn() }))

type SimilarMatch = { restaurant_name: string; dishes: { name: string; role: string; tags: string[]; contains_allergens: string[] }[] }

function makeSupabase({
  menus = [] as unknown[],
  similar = null as SimilarMatch | null,
  reuseMenuId = 'reused-menu-id' as string | null,
} = {}) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { host_id: 'host-1', chef_id: null, title: 'Sunday Table' }, error: null })
  const eq = jest.fn().mockReturnValue({ maybeSingle })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  const rpc = jest.fn((fn: string) => {
    if (fn === 'get_event_restaurant_menus') return Promise.resolve({ data: menus, error: null })
    if (fn === 'search_similar_restaurant_menu') return Promise.resolve({ data: similar, error: null })
    if (fn === 'reuse_restaurant_menu') return Promise.resolve({ data: reuseMenuId, error: reuseMenuId ? null : new Error('nope') })
    return Promise.resolve({ data: null, error: null })
  })
  const sb = { from, rpc }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'host-1')
  ;(isEventManager as jest.Mock).mockResolvedValue(true)
  ;(fetchEventTasteAttendees as jest.Mock).mockResolvedValue([])
})

afterEach(() => {
  delete (global as unknown as { fetch?: typeof fetch }).fetch
})

it('shows a reuse suggestion once a close match is found while typing the restaurant name', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreem')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })
  expect(screen.getByText('Tanoreen')).toBeInTheDocument()
  expect(screen.getByText(/2 dishes/i)).toBeInTheDocument()
})

it('shows no suggestion when nothing matches', async () => {
  makeSupabase({ similar: null })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Brand New Place')
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
})

it('dismissing the suggestion hides it without touching the rest of the form', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [{ name: 'Baba Ghanouj', role: 'starter', tags: [], contains_allergens: [] }] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreen')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /upload a new menu instead/i }))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText(/restaurant name/i)).toHaveValue('Tanoreen')
})

it('a failed search silently falls back to the plain upload form', async () => {
  const sb = makeSupabase({ similar: null })
  sb.rpc.mockImplementation((fn: string) => {
    if (fn === 'get_event_restaurant_menus') return Promise.resolve({ data: [], error: null })
    if (fn === 'search_similar_restaurant_menu') return Promise.reject(new Error('network down'))
    return Promise.resolve({ data: null, error: null })
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Any Restaurant')
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('using a suggested menu calls the reuse RPC and skips AI extraction entirely', async () => {
  const fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  const sb = makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreem')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /use this menu/i }))

  await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('reuse_restaurant_menu', {
    p_event_id: 'event-1',
    p_user_id: 'host-1',
    p_restaurant_name: 'Tanoreen',
    p_dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ],
  }))
  expect(screen.getByText(/2 dishes reused from a previously reviewed 'Tanoreen' menu/i)).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('shows an error banner and keeps the suggestion visible when the reuse RPC fails', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [{ name: 'Baba Ghanouj', role: 'starter', tags: [], contains_allergens: [] }] },
    reuseMenuId: null,
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreen')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /use this menu/i }))

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reuse this menu/i))
  expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument()
})

it('renders REUSED MENU for a menu with source_type reused', async () => {
  makeSupabase({
    menus: [{
      id: 'menu-1', event_id: 'event-1', created_by: 'host-1', restaurant_name: 'Tanoreen',
      source_type: 'reused', raw_menu_text: null, status: 'confirmed', created_at: '2026-08-31T00:00:00Z', confirmed_at: '2026-08-31T00:00:00Z',
      dishes: [],
    }],
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)
  expect(await screen.findByText('REUSED MENU')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest __tests__/restaurant-menu-reuse.test.tsx`

Expected: FAIL on every test — there is no `RESTAURANT NAME` reuse suggestion yet, and the last test fails
because `menu.source_type === 'reused'` currently falls into the `'UPLOADED MENU'` branch of the inline
ternary, not `'REUSED MENU'`.

- [ ] **Step 3: Implement the page changes**

In `app/(chef)/events/[id]/out/page.tsx`, change the import block (currently ending with `} from
'@/lib/restaurant-menu'`) to:

```ts
import {
  scoreConfirmedRestaurantDish,
  restaurantMenuSourceLabel,
  MAX_RESTAURANT_MENU_FILE_BYTES,
  RESTAURANT_NAME_SEARCH_MIN_LENGTH,
  RESTAURANT_NAME_SEARCH_DEBOUNCE_MS,
  type RestaurantDishProposal,
  type RestaurantMenu,
  type RestaurantMenuDish,
  type SimilarRestaurantMenu,
} from '@/lib/restaurant-menu'
```

Add three new state fields right after the existing `const [addingAnotherMenu, setAddingAnotherMenu] =
useState(false)` line:

```ts
  const [similarMenu, setSimilarMenu] = useState<SimilarRestaurantMenu | null>(null)
  const [similarDismissed, setSimilarDismissed] = useState(false)
  const [reusing, setReusing] = useState(false)
```

Add a new effect right after the existing `useEffect(() => { void load() }, [])` block (i.e. right before
`async function extract() {`):

```ts
  useEffect(() => {
    const name = restaurantName.trim()
    setSimilarDismissed(false)
    if (name.length < RESTAURANT_NAME_SEARCH_MIN_LENGTH || !userId) {
      setSimilarMenu(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase.rpc('search_similar_restaurant_menu', {
        p_user_id: userId,
        p_restaurant_name: name,
      })
      if (cancelled) return
      setSimilarMenu(searchError || !data ? null : data as SimilarRestaurantMenu)
    }, RESTAURANT_NAME_SEARCH_DEBOUNCE_MS)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [restaurantName, userId]) // eslint-disable-line react-hooks/exhaustive-deps
```

Add a new `reuseSimilarMenu` function right after `extract()` (i.e. right before `function updateDraft`):

```ts
  async function reuseSimilarMenu() {
    if (!similarMenu) return
    setReusing(true); setError(''); setNotice('')
    const { data: menuId, error: reuseError } = await supabase.rpc('reuse_restaurant_menu', {
      p_event_id: id,
      p_user_id: userId,
      p_restaurant_name: similarMenu.restaurant_name,
      p_dishes: similarMenu.dishes,
    })
    if (reuseError || !menuId) {
      setError('Could not reuse this menu. Try again.')
    } else {
      const dishCount = similarMenu.dishes.length
      setRestaurantName(''); setMenuText(''); setMenuFile(null)
      setSimilarMenu(null); setSimilarDismissed(false)
      setAddingAnotherMenu(false)
      setNotice(`${dishCount} dish${dishCount === 1 ? '' : 'es'} reused from a previously reviewed '${similarMenu.restaurant_name}' menu.`)
      await loadMenus(userId)
    }
    setReusing(false)
  }
```

Replace the `RESTAURANT NAME` label line and the `EXTRACT DISHES` button's `disabled` prop inside the
`sv2-restaurant-upload` section. Currently:

```tsx
          <label>RESTAURANT NAME<input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} maxLength={160} placeholder="Restaurant name" /></label>
          <label>PASTE MENU TEXT<textarea value={menuText} onChange={(event) => setMenuText(event.target.value)} rows={7} maxLength={40000} placeholder="Paste dish names and descriptions…" /></label>
          <label className="sv2-restaurant-file">OR UPLOAD A MENU FILE<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setMenuFile(event.target.files?.[0] ?? null)} /><span>{menuFile?.name ?? 'CHOOSE JPG, PNG, WEBP, OR PDF'}</span></label>
          <button type="button" disabled={busy} onClick={() => void extract()}>{busy ? 'READING MENU…' : 'EXTRACT DISHES FOR REVIEW'}</button>
```

Becomes:

```tsx
          <label>RESTAURANT NAME<input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} maxLength={160} placeholder="Restaurant name" /></label>
          {similarMenu && !similarDismissed && (
            <div className="sv2-restaurant-reuse-suggestion" role="status">
              <p>A previously reviewed menu for <strong>{similarMenu.restaurant_name}</strong> already exists ({similarMenu.dishes.length} dish{similarMenu.dishes.length === 1 ? '' : 'es'}).</p>
              <div>
                <button type="button" disabled={reusing || busy} onClick={() => void reuseSimilarMenu()}>{reusing ? 'ADDING…' : 'USE THIS MENU'}</button>
                <button type="button" disabled={reusing || busy} onClick={() => setSimilarDismissed(true)}>UPLOAD A NEW MENU INSTEAD</button>
              </div>
            </div>
          )}
          <label>PASTE MENU TEXT<textarea value={menuText} onChange={(event) => setMenuText(event.target.value)} rows={7} maxLength={40000} placeholder="Paste dish names and descriptions…" /></label>
          <label className="sv2-restaurant-file">OR UPLOAD A MENU FILE<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setMenuFile(event.target.files?.[0] ?? null)} /><span>{menuFile?.name ?? 'CHOOSE JPG, PNG, WEBP, OR PDF'}</span></label>
          <button type="button" disabled={busy || reusing} onClick={() => void extract()}>{busy ? 'READING MENU…' : 'EXTRACT DISHES FOR REVIEW'}</button>
```

Finally, replace the inline source-type ternary. Currently:

```tsx
        <header><div><p>{menu.source_type === 'text' ? 'PASTED MENU' : menu.source_type === 'pdf' ? 'UPLOADED PDF' : 'UPLOADED MENU'}</p><h2>{menu.restaurant_name}</h2></div><span>{menu.status === 'confirmed' ? 'REVIEW COMPLETE' : 'HUMAN REVIEW REQUIRED'}</span></header>
```

Becomes:

```tsx
        <header><div><p>{restaurantMenuSourceLabel(menu.source_type)}</p><h2>{menu.restaurant_name}</h2></div><span>{menu.status === 'confirmed' ? 'REVIEW COMPLETE' : 'HUMAN REVIEW REQUIRED'}</span></header>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest __tests__/restaurant-menu-reuse.test.tsx`

Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Add the CSS**

In `components/sofra-v2/sofra-v2.css`, find the line added in the previous session that starts
`.sv2-restaurant-add-another{...}` (immediately before the `.sv2-restaurant-dishes{display:grid;gap:14px}`
rule). Add this new rule directly after the `.sv2-restaurant-add-another` line:

```css
.sv2-restaurant-reuse-suggestion{margin:14px 0;padding:14px 16px;border-radius:14px;border-left:2px solid var(--sv2-gold);background:color-mix(in srgb,var(--sv2-gold) 10%,transparent);color:var(--sv2-ink)}.sv2-restaurant-reuse-suggestion p{margin:0 0 10px;font:400 12px/1.5 var(--sv2-sans-family)}.sv2-restaurant-reuse-suggestion div{display:flex;gap:9px;flex-wrap:wrap}.sv2-restaurant-reuse-suggestion button{min-height:38px;padding:8px 14px;border:1px solid var(--sv2-ink);border-radius:999px;background:var(--sv2-ink);color:var(--sv2-card-bg);font:600 9px var(--sv2-sans-family);letter-spacing:.6px;cursor:pointer}.sv2-restaurant-reuse-suggestion button+button{background:transparent;color:var(--sv2-ink)}.sv2-restaurant-reuse-suggestion button:disabled{opacity:.45;cursor:not-allowed}
```

- [ ] **Step 6: Run the full restaurant-menu test group and type-check**

Run: `npx jest --testPathPatterns "restaurant"`

Expected: PASS — all restaurant-menu-related suites (`restaurant-menu.test.ts`,
`restaurant-menu-reuse.test.tsx`, `restaurant-menu-route.test.ts`, `kitchen-setup-choice.test.tsx` if it
matches the pattern) pass.

Run: `npx tsc --noEmit -p .`

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(chef)/events/[id]/out/page.tsx" components/sofra-v2/sofra-v2.css __tests__/restaurant-menu-reuse.test.tsx
git commit -m "Add restaurant menu reuse suggestion to the restaurant review page"
```

---

### Task 4: Full verification and documentation

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run the complete test suite**

Run: `npx jest --silent`

Expected: same pass/fail counts as the pre-existing baseline (the two known-unrelated failures in
`login-page.test.tsx` and `design-preview-application.test.tsx`, both already failing before this feature
and unrelated to restaurant menus), plus all restaurant-menu suites passing. If anything else newly fails,
stop and fix it before continuing — do not proceed with a regression.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 3: Document the feature**

Add a new dated section to `docs/IMPLEMENTATION_STATUS.md`, following the existing convention of one
`## Section title (date)` block per shipped feature, placed after the most recent existing entry (`#
Host event prep checklist (2026-08-30)`):

```markdown
# Restaurant menu reuse (2026-09-03)

- Typing a restaurant name on the restaurant-menu review page (`/events/[id]/out`) now searches for a
  close match against every restaurant menu in Sofra that already has at least one human-reviewed dish,
  using deterministic `pg_trgm` trigram similarity rather than an LLM call. A match surfaces a small
  suggestion under the name field; accepting it copies that restaurant's confirmed dishes straight into
  the current event, already marked confirmed, with no AI extraction call and no re-review needed.
- The match is intentionally anonymous and system-wide: it never reveals which other host or event the
  reused menu came from, and it is not limited to events the current user manages. Only dishes with
  `review_status` of `confirmed` or `auto_confirmed` are ever eligible to be reused.
- `restaurant_menus.source_type` gains a fourth value, `'reused'`, rendered as `REUSED MENU` alongside the
  existing `PASTED MENU` / `UPLOADED PDF` / `UPLOADED MENU` labels via the new shared
  `restaurantMenuSourceLabel` helper in `lib/restaurant-menu.ts`.
- Migration `20260831000002_add_restaurant_menu_reuse.sql` adds the `pg_trgm` extension and two new
  `security definer` functions, `search_similar_restaurant_menu` (anonymous, read-only, global) and
  `reuse_restaurant_menu` (still gated by the existing per-event `can_access_event_restaurant_menus`
  check, same as every other write to this table).
- **Known limitation:** this migration is committed but has not been applied to the live Supabase
  database — this sandbox has no `SUPABASE_ACCESS_TOKEN` / DB connection string to run it, matching the
  same limitation already recorded for several earlier migrations in this file. Until it's applied, the
  restaurant-menu page will continue to work exactly as before (the search RPC call fails, which the
  frontend already treats as "no match found" and silently falls back to the normal upload form) — apply
  `supabase/migrations/20260831000002_add_restaurant_menu_reuse.sql` before relying on the reuse feature.
```

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document restaurant menu reuse feature and its pending migration"
```

---

## Acceptance criteria (from the spec)

- [x] Typing a restaurant name that closely matches one with at least one previously confirmed dish
      surfaces a reuse suggestion within ~450ms, without needing to paste text or pick a file first.
- [x] Accepting the suggestion adds those dishes to the current event already confirmed, without any AI
      extraction call.
- [x] The suggestion never reveals which other host or event the matched menu came from.
- [x] Declining, or a search that finds nothing, changes nothing about the existing paste/upload/extract
      flow.
- [x] A menu's `source_type` correctly reads `'reused'` and renders as "REUSED MENU".
- [ ] The migration is applied to the live database (blocked — no DB connection in this environment; see
      Task 4's documented limitation).
