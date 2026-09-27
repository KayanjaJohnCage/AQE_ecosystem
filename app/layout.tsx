import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'AfriQueer Escorts Ecosystem',
  description: 'AfriQueer Escorts Ecosystem is a growing ecosystem of love, peace, happiness, opportunities, pleasure and confidence, connecting customers with escort profiles, services, community experiences, memberships, rewards, secure payments and opportunities in one ecosystem.'
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
