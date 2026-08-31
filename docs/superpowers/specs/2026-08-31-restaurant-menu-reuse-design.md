# Restaurant Menu Reuse — Design

## Goal

Restaurant menus are extracted with an AI call and then hand-reviewed dish by dish
(`app/(chef)/events/[id]/out/page.tsx`). If the same restaurant caters a second Sofra — for the same
host or a completely different one — nothing today remembers that; the host has to paste/upload the menu
and re-review every dish again. When the restaurant name being typed is the same as (or close enough to)
one already reviewed anywhere in Sofra, offer to reuse that reviewed dish list instead, skipping both the
AI extraction call and the manual review step.

## Background: what already exists

- `restaurant_menus` / `restaurant_menu_dishes` (`supabase/migrations/20260830000004_add_restaurant_menus.sql`,
  extended by `20260830000005_support_restaurant_menu_pdf.sql` and
  `20260831000001_add_restaurant_menu_confidence.sql`) are strictly per-`event_id`. Every existing RPC
  (`can_access_event_restaurant_menus`, `get_event_restaurant_menus`, `save_restaurant_menu_extraction`,
  `review_restaurant_menu_dish`) authorizes against one specific event's host/co-host/assigned-chef.
- `app/(chef)/events/[id]/out/page.tsx` already has `restaurantName`, `menuText`, `menuFile` state and an
  `extract()` function that POSTs to `/api/restaurant-menus/extract`, then calls
  `save_restaurant_menu_extraction`. The upload form (`sv2-restaurant-upload` section) was just changed
  (uncommitted, this session) to hide once `menus.length > 0`, replaced by a `+ ADD ANOTHER RESTAURANT
  MENU` toggle — this reuse suggestion slots into that same form, before `extract()` is ever called.
- `dish.review_status` is `'unconfirmed' | 'auto_confirmed' | 'confirmed' | 'excluded'`. Only
  `'auto_confirmed'` and `'confirmed'` dishes have been seen and accepted by a human (or cleared the 90%+
  no-uncertainties auto-confirm bar) — `'unconfirmed'` and `'excluded'` must never be surfaced as reusable.
- `HostLocationAutocomplete.tsx` is the established pattern for this kind of "search as you type, show a
  small suggestion panel, min 3 characters, 450ms debounce, `AbortController`" interaction. This feature
  copies that shape but calls a Supabase RPC directly (as `out/page.tsx` already does for every other
  restaurant-menu operation) instead of an API route — there's no third-party-API key or rate limit to
  hide server-side here, unlike the Nominatim proxy.

## Design

### 1. Matching is system-wide and anonymous

Per explicit product decision: the search looks across **every** event's restaurant menus, not just ones
the current user manages. This is safe to share because restaurant menu data is a restaurant's own public
menu — not personal or guest data. To keep it safe regardless, the read path:

- returns **only** `restaurant_name` and the confirmed dish list (`name`, `role`, `tags`,
  `contains_allergens`) — never `created_by`, `event_id`, `reviewed_by`, or any timestamp,
- only ever draws from dishes with `review_status in ('confirmed', 'auto_confirmed')`,
- requires the caller to be a real, logged-in Sofra user (basic sanity check), but does **not** run
  `can_access_event_restaurant_menus` — that check is specific to one event and doesn't apply to a
  deliberately cross-event lookup.

### 2. Fuzzy matching: `pg_trgm`, not an LLM call

New migration:

```sql
create extension if not exists pg_trgm;
```

Matching normalizes both sides the same way — lowercase, strip everything but letters/digits/spaces,
collapse whitespace — then compares with trigram `similarity()`. This is deterministic and consistent
with how this codebase already does other fuzzy text matching (semantic dish-name dedup uses normalized
text + structured overlap, not an LLM judgment call).

```sql
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
```

`0.45` is a starting threshold (Postgres's own `pg_trgm` default operator threshold is `0.3`; this is
deliberately stricter to avoid false positives like unrelated restaurants that merely share common words).
It's a plain constant in the function body, easy to retune later without a new migration format.

A restaurant with reviewed dishes across multiple past menus (e.g. the same place used at two different
Sofras with slightly different name capitalization) picks the single closest + most recent menu, not a
merge — simplest correct behavior, and avoids duplicate dish names from two extractions of the same menu.

### 3. Reuse writes a normal, already-confirmed menu row

```sql
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

The write path *does* run `can_access_event_restaurant_menus` — reading a match is global/anonymous, but
actually writing a menu into an event still requires normal access to that event. Dishes are inserted
straight to `review_status = 'confirmed'`, `reviewed_by = p_user_id` (the *reusing* host, for this event's
own record — not the original reviewer, who is never exposed). `ai_confidence` is set to `1` since there's
no AI proposal in this path; `ai_suggested_*` mirrors the final `role`/`tags`/`contains_allergens` (same
convention `save_restaurant_menu_extraction` uses when a dish needs no correction).

### 4. `source_type` gains `'reused'`

```sql
alter table public.restaurant_menus drop constraint if exists restaurant_menus_source_type_check;
alter table public.restaurant_menus
  add constraint restaurant_menus_source_type_check
  check (source_type in ('text', 'image', 'pdf', 'reused'));
```

`out/page.tsx`'s existing label logic:

```tsx
menu.source_type === 'text' ? 'PASTED MENU' : menu.source_type === 'pdf' ? 'UPLOADED PDF' : 'UPLOADED MENU'
```

gets one more branch: `menu.source_type === 'reused' ? 'REUSED MENU' : ...`.

### 5. Frontend: suggestion while typing the restaurant name

In `RestaurantMenusPage`, new state:

```ts
const [similarMenu, setSimilarMenu] = useState<{ restaurant_name: string; dishes: SimilarDish[] } | null>(null)
const [similarDismissed, setSimilarDismissed] = useState(false)
const [reusing, setReusing] = useState(false)
```

A debounced effect on `restaurantName` (same 450ms / 3-character-minimum / `AbortController`-equivalent
shape as `HostLocationAutocomplete`, using a `let cancelled = false` flag since this is a direct
`supabase.rpc` call rather than `fetch`) calls `search_similar_restaurant_menu` and sets `similarMenu`.
Changing the input text clears `similarDismissed` back to `false` so a genuinely different name can
surface its own match.

Rendered directly under the `RESTAURANT NAME` label, only inside the upload form and only when there's a
match that hasn't been dismissed:

```tsx
{similarMenu && !similarDismissed && (
  <div className="sv2-restaurant-reuse-suggestion" role="status">
    <p>
      A previously reviewed menu for <strong>{similarMenu.restaurant_name}</strong> already exists
      ({similarMenu.dishes.length} dish{similarMenu.dishes.length === 1 ? '' : 'es'}).
    </p>
    <div>
      <button type="button" disabled={reusing} onClick={() => void reuseSimilarMenu()}>
        {reusing ? 'ADDING…' : 'USE THIS MENU'}
      </button>
      <button type="button" onClick={() => setSimilarDismissed(true)}>UPLOAD A NEW MENU INSTEAD</button>
    </div>
  </div>
)}
```

`reuseSimilarMenu()` calls `reuse_restaurant_menu` with `similarMenu.restaurant_name` and
`similarMenu.dishes`, then on success: clears `restaurantName`/`similarMenu`/`similarDismissed`, sets the
existing `notice` state (e.g. *"3 dishes reused from a previously reviewed 'Tanoreen' menu."*), and calls
the existing `loadMenus(userId)` — after which the existing `menus.length > 0` condition already hides the
whole upload form, same as a fresh extraction does today. No changes needed to that hide/show logic.

If the RPC search fails (network error, `pg_trgm` not yet migrated, etc.) it's caught and swallowed —
`similarMenu` just stays `null` and the host sees the normal upload form, unaffected. This is a convenience
feature; it must never block or error out the primary paste/upload path.

## Error handling

- Search RPC throws → caught, logged to console, `similarMenu` stays `null`. No visible error — falls
  straight back to the existing upload form.
- Reuse RPC returns `null`/errors (bad access, malformed dishes) → existing `sv2-restaurant-message error`
  banner (`setError('Could not reuse this menu. Try again.')`), suggestion stays visible so the host can
  retry or fall back to `UPLOAD A NEW MENU INSTEAD`.
- Reuse RPC succeeds with zero dishes (shouldn't happen given the search already filters to menus with
  ≥1 confirmed dish, but defensively) → same 1–80 length check as `save_restaurant_menu_extraction`
  already enforces, so this can't silently create an empty menu.

## Testing

- SQL/RPC-level (new focused test file, following the existing pattern for RPC coverage in this repo):
  - `search_similar_restaurant_menu` returns `null` for no match, for a name under 3 characters, and for a
    match whose only dishes are `unconfirmed`/`excluded`.
  - returns a match for an exact normalized name and for a close-typo variant (e.g. `"Tanoreen"` vs
    `"Tanoreem"`), and picks the most recent when two similarly-named menus both qualify.
  - never includes `created_by`/`event_id`/`reviewed_by` in its output shape.
  - `reuse_restaurant_menu` rejects a caller without access to the target event; on success, the new
    dishes are `review_status = 'confirmed'`, `source_type = 'reused'`.
- `__tests__/restaurant-menu.test.ts` (existing `lib/restaurant-menu.ts` suite): any shared TS helper this
  design introduces (if normalization logic ends up duplicated client-side for the label branch, etc.)
  gets its own unit tests there.
- New `__tests__/restaurant-menu-reuse.test.tsx` for `out/page.tsx`:
  - typing a name that resolves to a match shows the suggestion; typing something with no match does not;
  - dismissing hides it and reveals the normal form; editing the name again after dismiss can show a new
    suggestion;
  - clicking **USE THIS MENU** calls the reuse RPC with the right payload, then shows the reused dishes
    without ever calling `/api/restaurant-menus/extract`;
  - a failed search RPC silently falls back to the plain upload form (no error surfaced).

## Acceptance criteria

- Typing a restaurant name that closely matches one with at least one previously confirmed dish
  (anywhere in Sofra) surfaces a reuse suggestion within ~450ms, without needing to paste text or pick a
  file first.
- Accepting the suggestion adds those dishes to the current event already confirmed, doing so without any
  AI extraction call.
- The suggestion never reveals which other host or event the matched menu came from.
- Declining, or a search that finds nothing, changes nothing about the existing paste/upload/extract flow.
- A menu's `source_type` correctly reads `'reused'` and renders as "REUSED MENU" in the existing per-menu
  header.
