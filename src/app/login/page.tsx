import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">

        {/* HODO wordmark */}
        <div className="flex flex-col items-center mb-10">
          <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-[#444] mb-6">
            HODO
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back.</h1>
          <p className="text-[13px] text-[#555] mt-1.5">Enter your password to continue.</p>
        </div>

        {/* Card */}
        <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-6 shadow-2xl shadow-black/60">
          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border border-[#333] border-t-white rounded-full animate-spin" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-[11px] text-[#333] mt-5">
          Password protected to prevent API abuse.
        </p>
      </div>
    </div>
  )
}
