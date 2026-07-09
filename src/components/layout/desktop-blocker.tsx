"use client"

import { ShieldAlert, Download, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DesktopBlocker() {
  const handleDownload = () => {
    window.location.href = "https://github.com/Oxyrine/krypts-2.0/releases/download/v0.1.0/Krypts.DRM.Setup.0.1.0.exe"
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#070709] text-cream font-mori p-6 selection:bg-shockingly-green/30">
      {/* Background Decorative Grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      
      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-shockingly-green/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-md w-full bg-off-black border border-surface-25 p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center gap-6">
        {/* Glow-ring Shield icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-shockingly-green/10 border border-shockingly-green/20 text-shockingly-green shadow-[0_0_20px_rgba(34,197,94,0.15)] animate-pulse">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">Security Block Active</h2>
          <p className="text-sm text-shockingly-green font-mono uppercase tracking-wider">OS-Level Enforcement Required</p>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed">
          Standard web browsers are not secure enough to view this file. To prevent screen-capture, OBS recording, or snips, this content can only be opened inside the **Krypts Secure Desktop App**.
        </p>

        <div className="w-full h-px bg-surface-25 my-2" />

        <div className="flex flex-col gap-3 w-full">
          {/* Download Button */}
          <Button
            onClick={handleDownload}
            className="w-full bg-shockingly-green hover:bg-shockingly-green/90 text-just-black font-semibold h-11 rounded-xl shadow-lg transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download Krypts for Windows
          </Button>

          {/* Launch instruction */}
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
            <Terminal className="h-3 w-3" />
            <span>Already installed? Run npm run desktop</span>
          </div>
        </div>
      </div>
    </div>
  )
}
