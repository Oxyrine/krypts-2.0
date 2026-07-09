"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Upload, FileStack, Key, ShieldPlus,
  Activity, Settings, Shield, Bell, LogOut, ChevronDown, ShieldAlert
} from "lucide-react"

import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AuthGuard } from "@/components/auth-guard"
import { useAuth } from "@/lib/auth-context"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  const navItems = [
    { title: "Overview",           href: "/dashboard",            icon: LayoutDashboard },
    { title: "Upload Content",     href: "/dashboard/upload",     icon: Upload },
    { title: "Content Manager",    href: "/dashboard/content",    icon: FileStack },
    { title: "Token Generator",    href: "/dashboard/tokens",     icon: Key },
    { title: "Watermark Settings", href: "/dashboard/watermarks", icon: ShieldPlus },
    { title: "Analytics",          href: "/dashboard/analytics",  icon: Activity },
    { title: "API Keys",           href: "/dashboard/apikeys",    icon: Settings },
  ]

  // Only show Admin Panel if user is the admin
  if (user?.email === "admin@example.com") {
    navItems.push({ title: "Admin Panel", href: "/dashboard/admin", icon: ShieldAlert })
  }

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const userInitial = user?.full_name
    ? user.full_name[0].toUpperCase()
    : user?.email
    ? user.email[0].toUpperCase()
    : "U"

  return (
    <AuthGuard>
      {/* Force dark + GSAP tokens across the entire dashboard */}
      <div className="dark flex min-h-screen w-full bg-just-black font-mori">

        {/* ── Sidebar ── */}
        <aside className="fixed hidden w-64 flex-col border-r border-surface-25/50 bg-off-black lg:flex h-full">

          {/* Logo */}
          <div className="flex h-[60px] items-center border-b border-surface-25/50 px-6">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              <Shield className="h-5 w-5 text-shockingly-green" />
              <span className="text-surface-cream tracking-tight">Krypts DRM</span>
            </Link>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-auto py-5">
            <nav className="grid items-start px-3 text-sm font-medium gap-0.5">
              <div className="mb-3 px-3 text-[11px] font-bold text-surface-50 uppercase tracking-widest">
                Main Menu
              </div>
              {navItems.map((item, index) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href || pathname.startsWith(item.href + "/")
                const Icon = item.icon
                return (
                  <Link
                    key={index}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all text-sm border-l-2 pl-[10px] ${
                      isActive
                        ? "bg-shockingly-green/15 text-shockingly-green border-shockingly-green"
                        : "text-surface-50 hover:bg-surface-cream/5 hover:text-surface-cream border-transparent"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.title}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Sidebar footer — DRM status */}
          <div className="p-4 border-t border-surface-25/50">
            <div className="rounded-xl border border-shockingly-green/20 bg-shockingly-green/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-shockingly-green animate-pulse" />
                <p className="text-[13px] font-semibold text-shockingly-green">Protection Active</p>
              </div>
              <p className="text-[12px] text-surface-50 leading-relaxed">
                AES-256 encryption enabled for all content.
              </p>
              <Link
                href="/docs"
                className="mt-3 inline-flex text-[12px] font-medium text-surface-cream border border-surface-25 rounded-full px-3 py-1 hover:border-surface-cream transition-colors"
              >
                View Docs
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Main content area ── */}
        <div className="flex flex-1 flex-col lg:pl-64 h-screen overflow-hidden">

          {/* Top header */}
          <header className="flex h-[60px] items-center gap-4 border-b border-surface-25/50 bg-off-black px-4 lg:px-6 shrink-0 justify-between">
            <div className="flex-1">
              <h1 className="text-[17px] font-semibold text-surface-cream tracking-tight">
                {navItems.find(i => i.href === pathname)?.title || "Dashboard"}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Notifications */}
              <Link
                href="/dashboard/admin"
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-surface-25 text-surface-50 hover:border-surface-cream hover:text-surface-cream transition-colors"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5 rounded-full bg-orangey" />
              </Link>

              {/* Theme toggle */}
              <ModeToggle />

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-lg border border-surface-25 hover:border-surface-cream transition-colors outline-none">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-shockingly-green/20 text-shockingly-green text-xs font-bold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-[13px] text-surface-cream max-w-[120px] truncate">
                    {user?.full_name || user?.email || "Account"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-surface-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">{user?.full_name || "My Account"}</span>
                      <span className="text-xs font-normal text-muted-foreground truncate">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.location.href = "/dashboard"}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto p-4 lg:p-6 bg-just-black">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
