import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  metadataBase: new URL("https://afiqueerescortsecosystem.com"),
  title: {
    default: "AfriQueer Escorts Ecosystem",
    template: "%s | AfriQueer Escorts Ecosystem",
  },
  description: "AfriQueer Escorts Ecosystem is a growing ecosystem of love, peace, happiness, opportunities, pleasure and confidence, connecting customers with escort profiles, services, community experiences, memberships, rewards and opportunities in one ecosystem.",
  keywords: [
    "AfriQueer Escorts Ecosystem", "AfriQueer", "escort profiles", "escort services",
    "Uganda escorts", "Kampala escorts", "LGBTQ+ community", "memberships",
    "rewards", "opportunities", "pleasure", "confidence",
  ],
  icons: {
    icon: "/aqe_logo.png",
    shortcut: "/aqe_logo.png",
    apple: "/aqe_logo.png",
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "AfriQueer Escorts Ecosystem",
    description: "A growing ecosystem of love, peace, happiness, opportunities, pleasure and confidence.",
    url: "https://afiqueerescortsecosystem.com/",
    siteName: "AfriQueer Escorts Ecosystem",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AfriQueer Escorts Ecosystem",
    description: "A growing ecosystem of love, peace, happiness, opportunities, pleasure and confidence.",
  },
};

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
