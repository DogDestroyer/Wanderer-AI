import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { StoreHydration } from '@/components/StoreHydration'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Hodo — AI Travel Planner',
  description:
    'Chat with an AI agent to plan your perfect trip — day-by-day itinerary, live budget tracker, interactive map, and drag-and-drop editing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full font-sans antialiased">
        <StoreHydration />
        {children}
      </body>
    </html>
  )
}
