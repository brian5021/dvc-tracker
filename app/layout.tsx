import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { PointProvider } from "@/context/point-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Disney Vacation Club Point Tracker",
  description: "Track and manage your DVC points",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PointProvider>{children}</PointProvider>
      </body>
    </html>
  )
}
