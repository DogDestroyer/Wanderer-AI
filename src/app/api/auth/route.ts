import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const demoPassword = process.env.DEMO_PASSWORD

  // If DEMO_PASSWORD is not set, reject — this route should never be called
  if (!demoPassword) {
    return NextResponse.json({ error: 'No password configured' }, { status: 400 })
  }

  if (password !== demoPassword) {
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
