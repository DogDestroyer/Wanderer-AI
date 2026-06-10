// Stub — full agent implementation in Milestone 3
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Agent not yet implemented' },
    { status: 501 }
  )
}
