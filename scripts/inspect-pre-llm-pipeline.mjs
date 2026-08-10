import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
for(const line of readFileSync(resolve(root,'.env.local'),'utf8').split('\n')){const value=line.trim();if(!value||value.startsWith('#'))continue;const i=value.indexOf('=');if(i>0)process.env[value.slice(0,i)]=value.slice(i+1)}
register('./ts-loader.mjs',import.meta.url)
const [{createClient},{inspectPreLlmPipeline},{inferSlot},{withoutDishRoles},{normalizeProteinPreferences}]=await Promise.all([import('@supabase/supabase-js'),import('../lib/recommendation/debug.ts'),import('../lib/menu.ts'),import('../lib/dish-presets.ts'),import('../lib/protein-preferences.ts')])
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const monday=(()=>{const d=new Date(),delta=d.getDay()===0?-6:1-d.getDay();d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10)})()
const {data:host}=await db.from('users').select('id').eq('phone','+10000000001').maybeSingle();if(!host)throw new Error('Demo host not found')
const {data:event}=await db.from('events').select('id').eq('host_id',host.id).maybeSingle();if(!event)throw new Error('Demo event not found')
const [{data:rsvps},{data:rawSignatures},{data:rawPantry},{data:menu}]=await Promise.all([db.from('rsvps').select('user_id').eq('event_id',event.id).in('status',['going','maybe']),db.from('signatures').select('id,name,tags,contains_allergens,slot').eq('chef_id',host.id),db.from('pantry_items').select('id,name,tags,contains_allergens').eq('chef_id',host.id).eq('week_of',monday),db.from('menus').select('id').eq('event_id',event.id).maybeSingle()])
const ids=(rsvps??[]).map(x=>x.user_id),[{data:profiles},{data:rows}]=await Promise.all([db.from('taste_profiles').select('*').in('user_id',ids),menu?db.from('menu_courses').select('source,locked').eq('menu_id',menu.id):Promise.resolve({data:[]})])
const guests=(rsvps??[]).map(row=>{const p=(profiles??[]).find(x=>x.user_id===row.user_id);return{name:'redacted',dietary:p?.dietary??[],avoid:p?.avoid??[],proteinAnchor:p?.protein_anchor??null,proteinPreferences:normalizeProteinPreferences(p?.protein_preferences,p?.protein_anchor),flavorPreference:p?.flavor_preference??[],adventurousness:p?.adventurousness??50}})
const signatures=(rawSignatures??[]).map(s=>({...s,slot:s.slot??inferSlot(s.name,s.tags)})),pantry=(rawPantry??[]).map(p=>({...p,tags:withoutDishRoles(p.tags)})),locked=(rows??[]).filter(x=>x.locked&&x.source).map(x=>signatures.find(s=>s.id===x.source)).filter(Boolean)
console.log(JSON.stringify({eventId:event.id,...inspectPreLlmPipeline(guests,signatures,pantry,locked)},null,2))
