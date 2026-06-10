import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Route group — the (app) segment doesn't appear in the URL.
// This layout runs on the server before rendering any page and performs
// the password gate check without needing middleware at all.
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const password = process.env.DEMO_PASSWORD

  if (password) {
    const cookieStore = await cookies()
    const auth = cookieStore.get('wandr-auth')
    if (!auth?.value || auth.value !== password) {
      redirect('/login')
    }
  }

  return <>{children}</>
}
