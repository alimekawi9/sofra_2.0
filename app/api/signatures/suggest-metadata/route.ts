import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Automatic metadata suggestions are disabled.' }, { status: 410 })
}
