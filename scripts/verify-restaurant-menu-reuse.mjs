// Verifies the 20260831000002_add_restaurant_menu_reuse.sql migration against
// the real database: search_similar_restaurant_menu only ever returns
// restaurant name + confirmed/auto_confirmed dish fields (no created_by,
// event_id, reviewed_by, or timestamps), ignores unconfirmed-only menus,
// respects the 3-character minimum, prefers the most recent match on a tie,
// and matches a close typo; reuse_restaurant_menu rejects a caller without
// access to the target event and, on success, inserts an already-confirmed
// 'reused' menu. Cleans up every row it creates.
//
// Requires the migration to already be applied to the target database.
// Usage: node scripts/verify-restaurant-menu-reuse.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let failures = 0
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failures++
}

const hostId = crypto.randomUUID()
const outsiderId = crypto.randomUUID()
const eventSourceId = crypto.randomUUID() // where the reusable menus live
const eventDestId = crypto.randomUUID() // where dishes get reused into
const userIds = [hostId, outsiderId]
const eventIds = [eventSourceId, eventDestId]
const menuIds = []

async function insertMenu({ restaurantName, createdAt, dishes }) {
  const menuId = crypto.randomUUID()
  const { error: menuError } = await supabase.from('restaurant_menus').insert({
    id: menuId,
    event_id: eventSourceId,
    created_by: hostId,
    restaurant_name: restaurantName,
    source_type: 'text',
    status: 'review',
    created_at: createdAt,
  })
  if (menuError) throw menuError
  menuIds.push(menuId)

  const rows = dishes.map((dish, index) => ({
    restaurant_menu_id: menuId,
    source_order: index,
    source_text: dish.name,
    name: dish.name,
    ai_suggested_role: dish.role,
    role: dish.role,
    tags: dish.tags ?? [],
    contains_allergens: dish.contains_allergens ?? [],
    review_status: dish.review_status,
  }))
  const { error: dishError } = await supabase.from('restaurant_menu_dishes').insert(rows)
  if (dishError) throw dishError
  return menuId
}

try {
  const { error: usersError } = await supabase.from('users').insert([
    { id: hostId, name: 'Reuse Verify Host' },
    { id: outsiderId, name: 'Reuse Verify Outsider' },
  ])
  if (usersError) throw usersError

  const { error: eventsError } = await supabase.from('events').insert([
    { id: eventSourceId, host_id: hostId, title: 'Reuse Verify Source Sofra', event_date: new Date(Date.now() + 86400000).toISOString(), is_published: false },
    { id: eventDestId, host_id: hostId, title: 'Reuse Verify Destination Sofra', event_date: new Date(Date.now() + 172800000).toISOString(), is_published: false },
  ])
  if (eventsError) throw eventsError

  const now = Date.now()
  await insertMenu({
    restaurantName: 'Tanoreen',
    createdAt: new Date(now - 2 * 86400000).toISOString(),
    dishes: [{ name: 'Old Special', role: 'main', review_status: 'confirmed' }],
  })
  await insertMenu({
    restaurantName: 'Tanoreen',
    createdAt: new Date(now - 3600000).toISOString(),
    dishes: [
      { name: 'New Special', role: 'main', tags: ['lamb'], review_status: 'confirmed' },
      { name: 'Raw Kibbeh', role: 'starter', review_status: 'unconfirmed' },
    ],
  })
  await insertMenu({
    restaurantName: 'Only Unconfirmed Place',
    createdAt: new Date(now - 3600000).toISOString(),
    dishes: [{ name: 'Mystery Dish', role: 'flex', review_status: 'unconfirmed' }],
  })
  await insertMenu({
    restaurantName: 'Completely Unrelated Bistro',
    createdAt: new Date(now - 3600000).toISOString(),
    dishes: [{ name: 'Filler Dish', role: 'flex', review_status: 'confirmed' }],
  })

  // 1. Below the 3-character minimum never searches, even with real matches available.
  const short = await supabase.rpc('search_similar_restaurant_menu', { p_user_id: hostId, p_restaurant_name: 'Ta' })
  check('a name under 3 characters returns no match', short.data === null, JSON.stringify(short))

  // 2. A menu whose only dishes are unconfirmed is never eligible, even on an exact name match.
  const onlyUnconfirmed = await supabase.rpc('search_similar_restaurant_menu', { p_user_id: hostId, p_restaurant_name: 'Only Unconfirmed Place' })
  check('a menu with only unconfirmed dishes returns no match', onlyUnconfirmed.data === null, JSON.stringify(onlyUnconfirmed))

  // 3. A name with no real similarity to anything returns no match (no false positive).
  const noMatch = await supabase.rpc('search_similar_restaurant_menu', { p_user_id: hostId, p_restaurant_name: 'Zzyxw Nonexistent Diner' })
  check('an unrelated name returns no match', noMatch.data === null, JSON.stringify(noMatch))

  // 4. A close typo still matches, and recency breaks the tie between two same-named menus.
  const typo = await supabase.rpc('search_similar_restaurant_menu', { p_user_id: hostId, p_restaurant_name: 'Tanoreem' })
  const typoMatch = typo.data
  check('a close typo finds a match', Boolean(typoMatch), typo.error?.message)
  check('the match is the correct restaurant', typoMatch?.restaurant_name === 'Tanoreen', JSON.stringify(typoMatch))
  check(
    'recency breaks the tie: the more recent same-named menu wins',
    Array.isArray(typoMatch?.dishes) && typoMatch.dishes.some((d) => d.name === 'New Special') && !typoMatch.dishes.some((d) => d.name === 'Old Special'),
    JSON.stringify(typoMatch?.dishes)
  )
  check(
    'only confirmed/auto_confirmed dishes are included (the unconfirmed sibling dish is excluded)',
    Array.isArray(typoMatch?.dishes) && !typoMatch.dishes.some((d) => d.name === 'Raw Kibbeh'),
    JSON.stringify(typoMatch?.dishes)
  )

  // 5. The result never leaks anything beyond restaurant name + safe dish fields.
  const topLevelKeys = typoMatch ? Object.keys(typoMatch).sort() : []
  check('top-level result exposes only restaurant_name and dishes', JSON.stringify(topLevelKeys) === JSON.stringify(['dishes', 'restaurant_name']), topLevelKeys.join(','))
  const dishKeys = typoMatch?.dishes?.[0] ? Object.keys(typoMatch.dishes[0]).sort() : []
  check(
    'each dish exposes only name/role/tags/contains_allergens — no id, created_by, event_id, or reviewed_by',
    JSON.stringify(dishKeys) === JSON.stringify(['contains_allergens', 'name', 'role', 'tags']),
    dishKeys.join(',')
  )

  // 6. reuse_restaurant_menu rejects a caller without access to the destination event.
  const { count: beforeCount } = await supabase.from('restaurant_menus').select('id', { count: 'exact', head: true }).eq('event_id', eventDestId)
  const unauthorizedReuse = await supabase.rpc('reuse_restaurant_menu', {
    p_event_id: eventDestId,
    p_user_id: outsiderId,
    p_restaurant_name: 'Tanoreen',
    p_dishes: [{ name: 'New Special', role: 'main', tags: ['lamb'], contains_allergens: [] }],
  })
  check('an outsider with no access to the destination event is rejected', unauthorizedReuse.data === null, JSON.stringify(unauthorizedReuse))
  const { count: afterCount } = await supabase.from('restaurant_menus').select('id', { count: 'exact', head: true }).eq('event_id', eventDestId)
  check('the rejected call created no menu row', beforeCount === afterCount, `before=${beforeCount} after=${afterCount}`)

  // 7. The actual host can reuse the match; the copy lands already confirmed.
  const authorizedReuse = await supabase.rpc('reuse_restaurant_menu', {
    p_event_id: eventDestId,
    p_user_id: hostId,
    p_restaurant_name: typoMatch.restaurant_name,
    p_dishes: typoMatch.dishes,
  })
  const reusedMenuId = authorizedReuse.data
  check('the host can reuse the matched menu', Boolean(reusedMenuId), authorizedReuse.error?.message)
  if (reusedMenuId) menuIds.push(reusedMenuId)

  const { data: reusedMenu, error: reusedMenuError } = await supabase.from('restaurant_menus').select('source_type,status,event_id').eq('id', reusedMenuId).single()
  check('the reused menu row has source_type=reused and status=confirmed', !reusedMenuError && reusedMenu?.source_type === 'reused' && reusedMenu?.status === 'confirmed', JSON.stringify(reusedMenu))

  const { data: reusedDishes, error: reusedDishesError } = await supabase.from('restaurant_menu_dishes').select('name,review_status,reviewed_by').eq('restaurant_menu_id', reusedMenuId)
  check(
    'every reused dish is already confirmed and attributed to the reusing host',
    !reusedDishesError && (reusedDishes ?? []).length > 0 && reusedDishes.every((d) => d.review_status === 'confirmed' && d.reviewed_by === hostId),
    JSON.stringify(reusedDishes)
  )
} finally {
  // Cleanup — remove every row this script created, regardless of outcome.
  // restaurant_menu_dishes cascades from restaurant_menus, so deleting the
  // menus is enough to also remove their dishes.
  if (menuIds.length) await supabase.from('restaurant_menus').delete().in('id', menuIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('users').delete().in('id', userIds)
  console.log(`cleaned up ${menuIds.length} menu(s), ${eventIds.length} event(s), ${userIds.length} user(s)`)
}

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`)
process.exit(failures === 0 ? 0 : 1)
