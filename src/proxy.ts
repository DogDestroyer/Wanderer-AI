import { NextRequest, NextResponse } from 'next/server'

// ─── Demo password gate ──────────────────────────────────────────────────────
// Set DEMO_PASSWORD in .env.local (dev) or Vercel environment variables (prod).
// Visitors who haven't entered the passcode are redirected to /login.
// If DEMO_PASSWORD is not set, the app is open — ideal for local development.

export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD

  if (!password) return NextResponse.next()

  const { pathname } = request.nextUrl

  // Always allow: landing page, login page, auth API
  if (pathname === '/' || pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Validate session cookie
  const authCookie = request.cookies.get('wandr-auth')
  if (authCookie?.value === password) {
    return NextResponse.next()
  }

  // Send unauthenticated visitors to the login page
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
