import Link from 'next/link'

// Graceful page for unknown/removed share ids.
export default function SharedTripNotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
      <p className="text-[11px] font-bold tracking-[0.35em] uppercase text-[#444] mb-8">HODO</p>
      <h1 className="text-2xl font-bold text-[#f0f0f0]">This trip link doesn&apos;t exist</h1>
      <p className="text-[13px] text-[#666] mt-3 max-w-sm leading-relaxed">
        It may have been mistyped, or the link was created on a deployment that no longer stores it.
      </p>
      <Link
        href="/"
        className="mt-8 px-6 py-3 bg-white text-black text-[13px] font-semibold rounded-xl hover:bg-[#e8e8e8] transition-colors"
      >
        Plan your own trip →
      </Link>
    </div>
  )
}
