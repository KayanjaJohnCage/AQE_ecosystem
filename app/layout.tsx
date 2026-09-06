import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'AQE Ecosystem',
  description: 'AQE — Next.js production foundation'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
