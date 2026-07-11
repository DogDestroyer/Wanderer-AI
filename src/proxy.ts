import { NextRequest, NextResponse } from 'next/server'

// ─── Demo password gate ──────────────────────────────────────────────────────
// Set DEMO_PASSWORD in .env.local (dev) or Vercel environment variables (prod).
// Visitors who haven't entered the passcode are redirected to /login.
// If DEMO_PASSWORD is not set, the app is open — ideal for local development.

export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD

  if (!password) return NextResponse.next()

  const { pathname } = request.nextUrl

  // Always allow: landing page, login page, the auth endpoint, and PUBLIC
  // shared-trip pages (/t/{id} — recipients don't have the passcode; the ids
  // are unguessable and the pages are read-only).
  if (pathname === '/' || pathname === '/login' || pathname === '/api/auth' || pathname.startsWith('/t/')) {
    return NextResponse.next()
  }

  // Validate session cookie
  const authCookie = request.cookies.get('wandr-auth')
  if (authCookie?.value === password) {
    return NextResponse.next()
  }

  // API routes: reject with 401 JSON, NEVER a redirect. (A redirect here once
  // made fetch() silently receive login-page HTML instead of JSON/SSE, which
  // surfaced as the app "reloading and clearing the chat".) This is what makes
  // DEMO_PASSWORD actually protect Anthropic/provider credits, not just the UI.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized — log in at /login first.' },
      { status: 401 },
    )
  }

  // Pages: send unauthenticated visitors to the login page
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
