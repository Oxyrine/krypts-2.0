"use client"

import { ShieldAlert, Download, ExternalLink } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function DesktopBlockerInner() {
  const searchParams = useSearchParams()

  // Build the krypts:// deep link from current URL params
  // e.g.  /view/image?file_id=xxx&token=yyy  →  krypts://view/image?file_id=xxx&token=yyy
  const buildDeepLink = () => {
    if (typeof window === "undefined") return null
    const pathname = window.location.pathname // e.g. /view/image
    const search = window.location.search     // e.g. ?file_id=xxx&token=yyy
    // Strip leading slash and use as krypts:// path
    return `krypts:/${pathname}${search}`
  }

  const handleOpenInApp = () => {
    const deepLink = buildDeepLink()
    if (deepLink) window.location.href = deepLink
  }

  const handleDownload = () => {
    window.location.href =
      "https://github.com/Oxyrine/krypts-2.0/releases/download/v0.1.0/Krypts.DRM.Setup.0.1.0.exe"
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#070709] font-sans p-6">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      {/* Green glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center gap-6">

        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
          <ShieldAlert className="h-8 w-8" />
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Desktop App Required</h2>
          <p className="text-xs text-green-400 font-mono uppercase tracking-widest">OS-Level Protection Enforced</p>
        </div>

        {/* Body */}
        <p className="text-zinc-400 text-sm leading-relaxed">
          This file is protected by Krypts DRM. Standard browsers cannot block
          screen-capture tools or OBS recording. You must open this link in the{" "}
          <span className="text-white font-semibold">Krypts Secure Desktop App</span> to view it.
        </p>

        <div className="w-full h-px bg-zinc-800" />

        {/* Buttons */}
        <div className="flex flex-col gap-3 w-full">
          {/* Primary: Open in App */}
          <button
            onClick={handleOpenInApp}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-semibold h-11 rounded-xl shadow-lg transition-all duration-200 active:scale-95"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Krypts App
          </button>

          {/* Secondary: Download */}
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium h-10 rounded-xl border border-zinc-700 transition-all duration-200 active:scale-95"
          >
            <Download className="h-4 w-4" />
            Download Krypts for Windows
          </button>
        </div>

        <p className="text-zinc-600 text-xs">
          Already installed? Click &quot;Open in Krypts App&quot; above.
        </p>
      </div>
    </div>
  )
}

export function DesktopBlocker() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#070709] text-zinc-400">
        Checking security context...
      </div>
    }>
      <DesktopBlockerInner />
    </Suspense>
  )
}
