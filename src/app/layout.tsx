import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/providers"
import { Sidebar } from "@/components/sidebar"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Jacob Command Center",
  description: "AI Assistant Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="gradient-bg min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-16 lg:ml-64">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
