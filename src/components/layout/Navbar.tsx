"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ModeToggle } from "@/components/mode-toggle"
import { Shield } from "lucide-react"

export function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === "/"

  // On home page: use hash-only for smooth scroll.
  // On other pages: navigate back to home then scroll.
  const a = (hash: string) => (isHome ? hash : `/${hash}`)

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center gap-4 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-bold tracking-tight">Krypts</span>
        </Link>
        <div className="flex-1" />
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium pr-4">
          <Link href={a("#features")} className="transition-colors hover:text-foreground/80 text-foreground/60">Features</Link>
          <Link href={a("#use-cases")} className="transition-colors hover:text-foreground/80 text-foreground/60">Use Cases</Link>
          <Link href={a("#pricing")} className="transition-colors hover:text-foreground/80 text-foreground/60">Pricing</Link>
          <Link href="/docs" className="transition-colors hover:text-foreground/80 text-foreground/60">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Link href="/dashboard" className="hidden md:flex">
            <div className="px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors">
              Dashboard
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
