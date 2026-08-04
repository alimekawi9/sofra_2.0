import { NextResponse } from 'next/server'
import { generateMenuWithAI } from '@/lib/menu-ai'
import type { PantryItem, Signature } from '@/lib/menu'
import type { TableIntel } from '@/lib/intel'

export const runtime = 'nodejs'
// Must be >= lib/gemini.ts's TIMEOUT_MS, or a Vercel deploy would kill this
// function before our own timeout/abort logic ever fires.
export const maxDuration = 60

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
