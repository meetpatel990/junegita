import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Krishna-Arjun Voice Assistant | Bhagavad Gita Wisdom',
  description: 'Experience spiritual wisdom through voice conversation with Krishna. Ask questions and receive guidance from Bhagavad Gita teachings.',
  keywords: ['Krishna', 'Arjun', 'Bhagavad Gita', 'Voice Assistant', 'Spiritual Wisdom'],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <meta name="theme-color" content="#0a0e27" />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
