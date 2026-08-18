import type { DishRole } from './config'

export type ExistingMenuRow={id:string;role?:string|null;slot?:string|null;dish_name:string;dish_origin:string|null;source:string|null;component_ids?:string[]|null;scoring_metadata?:Record<string,unknown>|null;locked:boolean;sort_order:number}
export type DesiredMenuDish={role:DishRole;dish_name:string;dish_origin:string;source:string|null;component_ids?:string[]|null;scoring_metadata?:Record<string,unknown>|null}
export type MenuRowInsert=DesiredMenuDish&{sort_order:number;locked:false}
export type MenuReplacementPlan={preserve:ExistingMenuRow[];removeIds:string[];insert:MenuRowInsert[];effectiveTarget:number}

export function broadRole(value:string|null|undefined):DishRole{
  switch(value){case'start':case'starter':return'starter';case'sea':case'land':case'main':return'main';case'green':case'side':return'side';case'finish':case'dessert':return'dessert';default:return'flex'}
}
export const roleLabel=(value:string|null|undefined)=>broadRole(value).toUpperCase()
const order:Record<DishRole,number>={starter:0,main:1,side:2,dessert:3,flex:4}

export function deterministicDishOrder<T extends {role?:string|null;slot?:string|null}>(rows:T[]):T[]{return rows.map((row,index)=>({row,index})).sort((a,b)=>order[broadRole(a.row.role??a.row.slot)]-order[broadRole(b.row.role??b.row.slot)]||a.index-b.index).map(x=>x.row)}

export function planMenuReplacement(existing:ExistingMenuRow[],desired:DesiredMenuDish[],normalTarget:number):MenuReplacementPlan{
  const preserve=deterministicDishOrder(existing.filter(row=>row.locked)),effectiveTarget=Math.max(normalTarget,preserve.length)
  const remaining=Math.max(0,effectiveTarget-preserve.length),lockedKeys=new Set(preserve.map(row=>`${row.source??''}|${row.dish_name.toLowerCase()}`))
  const candidates=deterministicDishOrder(desired).filter(row=>!lockedKeys.has(`${row.source??''}|${row.dish_name.toLowerCase()}`)).slice(0,remaining)
  const insert=candidates.map((row,index)=>({...row,role:broadRole(row.role),sort_order:preserve.length+index,locked:false as const}))
  return{preserve:preserve.map((row,index)=>({...row,sort_order:index})),removeIds:existing.filter(row=>!row.locked).map(row=>row.id),insert,effectiveTarget}
}
