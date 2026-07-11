import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

// Constant-time string comparison (length-safe): hash-length equalisation is
// overkill for a demo passcode, but comparing equal-length buffers via
// timingSafeEqual removes the trivial char-by-char timing signal of `!==`.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }))
  const demoPassword = process.env.DEMO_PASSWORD

  // If DEMO_PASSWORD is not set, reject — this route should never be called
  if (!demoPassword) {
    return NextResponse.json({ error: 'No password configured' }, { status: 400 })
  }

  if (typeof password !== 'string' || !safeEqual(password, demoPassword)) {
    return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('wandr-auth', demoPassword, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}

// Allow logout: DELETE clears the cookie
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('wandr-auth')
  return response
}
