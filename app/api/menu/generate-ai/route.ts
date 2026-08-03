import { NextResponse } from 'next/server'
import { generateMenuWithAI } from '@/lib/menu'
import type { PantryItem, Signature } from '@/lib/menu'
import type { TableIntel } from '@/lib/intel'

export const runtime = 'nodejs'

type Body = {
  intel: TableIntel
  signatures: Signature[]
  pantry: PantryItem[]
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.intel || !Array.isArray(body?.signatures) || !Array.isArray(body?.pantry)) {
    return NextResponse.json({ error: 'Missing intel, signatures, or pantry' }, { status: 400 })
  }

  const result = await generateMenuWithAI(body.intel, body.signatures, body.pantry)
  return NextResponse.json(result)
}
