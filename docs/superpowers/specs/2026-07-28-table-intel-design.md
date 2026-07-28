# Table Intel — Design Spec
_2026-07-28_

## Goal

Build two things:

1. `lib/intel.ts` — a pure function `buildIntel(guests: TasteProfile[])` that merges guest taste data into a structured intel object for rendering.
2. `app/(chef)/events/[id]/table/page.tsx` — a server component that fetches RSVPs, joins taste profiles, calls `buildIntel`, and renders the result for the event host or assigned chef.

---

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260728000001_taste_profiles_host_chef_read.sql` | New RLS policy |
| `lib/intel.ts` | Pure function + types |
| `app/(chef)/events/[id]/table/page.tsx` | Server component |

---

## Migration

`supabase/migrations/20260728000001_taste_profiles_host_chef_read.sql`

Adds a second SELECT policy on `taste_profiles` alongside the existing `taste_profiles_select_self` policy:

```sql
create policy taste_profiles_select_host_or_chef on public.taste_profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.rsvps r
      join public.events e on e.id = r.event_id
      where r.user_id = taste_profiles.user_id
        and r.status in ('going', 'maybe')
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );
```

This permits reading a `taste_profiles` row only when **both** conditions hold: the profile's owner has an active RSVP (`going` or `maybe`) on a specific event, **and** the caller is the host or assigned chef of that same event. `cant` RSVPs do not expose the profile. This is intentionally a two-sided join — it does not permit any host to read any taste profile in the system.

> **Invariant:** The USING clause above (`e.host_id = auth.uid() or e.chef_id = auth.uid()`) must stay in sync with the page's redirect condition (see Access Control below). If one is changed without the other, the access model silently breaks — a user could pass the page check but not get data, or vice versa.

---

## `lib/intel.ts`

### Types

```ts
export type TasteProfile = {
  name: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
  adventurousness: number   // 0–100
}

export type HardLimit = {
  label: string
  guests: string[]          // names of guests this applies to
  type: 'allergy' | 'diet'
}

export type Intel = {
  hardLimits: HardLimit[]
  dietMix: { label: string; count: number }[]
  drinksCounts: { label: string; count: number }[]
  avgAdventurousness: number
  adventurousnessLabel: 'cautious' | 'balanced' | 'adventurous' | 'daring'
  brief: string
  guestCount: number
}
```

### Constants

```ts
const STRICT_DIETS = new Set(['Vegetarian', 'Vegan', 'Halal', 'Kosher'])
```

These four dietary values are hard limits (non-negotiable), not preferences. All other dietary values (`Gluten-free`, `No dairy`, `Pescatarian`) are soft preferences and go into `dietMix` only.

### `buildIntel(guests: TasteProfile[]): Intel`

Pure function — no Supabase calls, no side effects, no async.

**Hard limits** (two passes):

1. For each distinct value across all `avoid` arrays: collect guest names → `HardLimit { type: 'allergy' }`. These are allergies/exclusions.
2. For each distinct value across all `dietary` arrays that is in `STRICT_DIETS`: collect guest names → `HardLimit { type: 'diet' }`. These are strict dietary restrictions.

Output order: allergies first, strict diets second.

**dietMix**: count occurrences of each `dietary` value that is NOT in `STRICT_DIETS`. Sort descending by count.

**drinksCounts**: count occurrences of each `drinks` value. Sort descending by count.

**avgAdventurousness**: `Math.round(sum of all scores / guests.length)`. Returns `0` when `guests.length === 0`.

**adventurousnessLabel** breakpoints (aggregate table profile, different from the per-guest slider labels):

| Range | Label |
|-------|-------|
| < 40 | `'cautious'` |
| < 60 | `'balanced'` |
| < 78 | `'adventurous'` |
| ≥ 78 | `'daring'` |

**brief**: one-line deterministic string summarising the table for a chef. Template:

- Start with guest count: `"N guests"`
- Append strict diet summary if any (e.g., `"2 vegan, 1 halal"`)
- Append allergy summary if any (e.g., `"nuts & shellfish off-limits across 3 guests"`)
- Append dominant drink if any (e.g., `"wine dominant"`)
- Append adventurousness: `"cautious table (avg N)"` / `"balanced table (avg N)"` etc.
- If no hard limits: `"no hard limits"`
- If no guests: return `"No guest data yet."`

Example output: `"8 guests — 2 vegan, 1 halal, nuts & shellfish off-limits across 3 guests, wine dominant, balanced table (avg 54)."`

---

## `app/(chef)/events/[id]/table/page.tsx`

### Access Control

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')

const { data: event } = await supabase
  .from('events')
  .select('host_id, chef_id')
  .eq('id', id)
  .single()

if (!event) notFound()

if (user.id !== event.host_id && user.id !== event.chef_id) {
  redirect(`/events/${id}`)
}
```

This is a hard server-side redirect — no HTML is sent to unauthorised callers. The check condition mirrors the RLS USING clause exactly (see Invariant above).

> **v1 limitation:** `events.chef_id` is defined in the schema and referenced in RLS policies for menus/menu_courses, but **no application code currently writes it**. There is no chef assignment UI or API endpoint in this build. The `user.id === event.chef_id` branch in the access-control check will never match in v1 — only the host can reach this page. The check is included so that when a chef-assignment flow is added, the table page becomes accessible to the assigned chef automatically without touching this file.

### Data Fetching

After the access check:

```ts
// Step 1: RSVPs + user names
const { data: rsvps } = await supabase
  .from('rsvps')
  .select('user_id, users(name)')
  .eq('event_id', id)
  .in('status', ['going', 'maybe'])

const userIds = (rsvps ?? []).map(r => r.user_id)

// Step 2: taste profiles (permitted by the new RLS policy)
const { data: profiles } = userIds.length
  ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
  : { data: [] }

// Step 3: merge
const guests: TasteProfile[] = (rsvps ?? []).map(r => {
  const p = profiles?.find(p => p.user_id === r.user_id)
  return {
    name: (r.users as { name: string } | null)?.name ?? 'Unknown',
    dietary: p?.dietary ?? [],
    avoid: p?.avoid ?? [],
    drinks: p?.drinks ?? [],
    adventurousness: p?.adventurousness ?? 50,
  }
})

const intel = buildIntel(guests)
```

Guests who RSVPed going/maybe but have no taste_profile row (edge case: profile deleted after RSVP) default to empty arrays and `adventurousness: 50`.

### Render Structure

All styles are inline. Color palette matches the rest of the app:

```ts
const C = {
  ink:       '#140E10',
  ink2:      '#1E1518',
  cream:     '#F3E9DD',
  dim:       '#B7A493',
  faint:     '#7C6B5F',
  gold:      '#D9A15B',
  rose:      '#C97B6E',
  burgundy:  '#5C1A1B',
}
```

**1. Hard Limits card**

- Background: `rgba(224,119,107,0.12)`, border: `1px solid #C97B6E`
- Heading: `"Hard Limits — Non-Negotiable"` in rose
- Two sub-sections: Allergies (type = `'allergy'`), then Strict Diets (type = `'diet'`)
- Each item: `"Nuts — Ali, Sara"` (label — comma-joined names)
- If `hardLimits.length === 0`: render card but show `"No hard limits reported."` in dim text
- Card always renders (empty state is meaningful information for a chef)

**2. Diet Mix bar chart**

- Horizontal bars; label left, count right (`"3 of 8"`)
- Bar width: `count / guestCount * 100%`, gold fill
- Section hidden if `dietMix.length === 0`

**3. Drinks bar chart**

- Same structure as Diet Mix
- Section hidden if `drinksCounts.length === 0`

**4. Adventurousness track**

- Single horizontal 0–100 track
- Guest pins: small dots (`12px` diameter, cream `#F3E9DD`) positioned at `adventurousness / 100 * 100%` via `position: absolute; left: calc(${pct}% - 6px)`
- Average fill bar: gold, width `avgAdventurousness%`, `position: absolute; left: 0`
- Track itself: `4px` tall, `border-radius: 2px`, `background: #7C6B5F`
- Below track: `"Avg ${avgAdventurousness} — ${adventurousnessLabel}"` in cream, `"N guests"` in dim

**5. Brief**

- `intel.brief` in cream, italic, below the track

### Page Chrome

- Background gradient + radial glow matching app style: `linear-gradient(180deg, #1B1214 0%, #241619 100%)` with `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)` overlay
- Page title: event id is available; optionally fetch event title for display (simple addition, not load-bearing)
- No sub-components — all rendered inline in the page function

---

## Out of Scope

- Chef assignment UI (writing `events.chef_id`) — v1 limitation documented above
- Pagination or filtering of the guest list
- Export / print view
- Real-time updates as RSVPs come in
