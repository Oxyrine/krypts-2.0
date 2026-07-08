"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Shield } from "lucide-react"

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"

  const a = (hash: string) => (isHome ? hash : `/${hash}`)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-surface-25/50 bg-just-black/90 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center gap-4 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-shockingly-green" />
          <span className="font-bold tracking-tight text-surface-cream">Krypts</span>
        </Link>
        <div className="flex-1" />
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium pr-4">
          <Link href={a("#features")} className="text-surface-50 hover:text-surface-cream transition-colors">Features</Link>
          <Link href={a("#use-cases")} className="text-surface-50 hover:text-surface-cream transition-colors">Use Cases</Link>
          <Link href={a("#pricing")} className="text-surface-50 hover:text-surface-cream transition-colors">Pricing</Link>
          <Link href="/docs" className="text-surface-50 hover:text-surface-cream transition-colors">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <div className="px-4 py-2 text-sm font-semibold text-just-black bg-surface-cream hover:bg-shockingly-green rounded-md transition-colors">
              Dashboard
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
