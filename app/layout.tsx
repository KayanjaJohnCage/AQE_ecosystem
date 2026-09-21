import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'AQE Ecosystem',
  description: 'AQE — Next.js production foundation'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
