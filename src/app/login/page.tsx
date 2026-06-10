import { Suspense } from 'react'
import { Plane } from 'lucide-react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-3 shadow-lg shadow-indigo-900">
            <Plane size={22} className="text-white -rotate-45" />
          </div>
          <h1 className="text-xl font-bold text-white">Wandr</h1>
          <p className="text-sm text-slate-400 mt-1">AI Travel Planner</p>
        </div>

        {/* Suspense wraps the form because it reads useSearchParams */}
        <Suspense
          fallback={
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-slate-600 mt-6">
          This demo is password protected to prevent API abuse.
        </p>
      </div>
    </div>
  )
}
