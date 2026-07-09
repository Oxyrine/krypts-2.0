"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Shield, AlertTriangle, Download } from "lucide-react"
import { API_BASE, api } from "@/lib/api"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "krypts_watermark_settings"

function getWatermarkSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Image viewer always forces dark (black) text — white text is invisible on light images
      return { ...parsed, colorScheme: "dark" }
    }
  } catch { /* ignore */ }
  return { enabled: true, text: "Confidential - {user_id}", opacity: [15], density: [3], colorScheme: "dark" }
}

function FloatingWatermark({ email }: { email: string }) {
  const [positions, setPositions] = useState<{ top: number; left: number }[]>([])
  const [settings, setSettings] = useState(getWatermarkSettings)

  useEffect(() => { setSettings(getWatermarkSettings()) }, [])

  const count = Math.max(2, settings.density[0] * 2)
  const opacityValue = settings.opacity[0] / 100

  const generatePositions = useCallback(() => {
    return Array.from({ length: count }, () => ({
      top: 5 + Math.random() * 80,
      left: 5 + Math.random() * 75,
    }))
  }, [count])

  useEffect(() => {
    setPositions(generatePositions())
    const interval = setInterval(() => setPositions(generatePositions()), 3000)
    return () => clearInterval(interval)
  }, [generatePositions])

  if (!settings.enabled) return null

  const displayText = settings.text
    .replace("{user_id}", email.split("@")[0])
    .replace("{email}", email)
    .replace("{ip_address}", "")
    .replace("{timestamp}", new Date().toISOString().split("T")[0])

  const textColor = settings.colorScheme === "dark" ? "0,0,0" : "255,255,255"

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {positions.map((pos, i) => (
        <span
          key={i}
          className="absolute font-mono font-bold text-sm whitespace-nowrap select-none"
          style={{
            top: `${pos.top}%`,
            left: `${pos.left}%`,
            transform: `rotate(-${20 + i * 5}deg)`,
            transition: "top 2s ease-in-out, left 2s ease-in-out",
            color: `rgba(${textColor}, ${opacityValue})`,
          }}
        >
          {displayText} • Krypts DRM
        </span>
      ))}
    </div>
  )
}

function ImageViewerInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const fileId = searchParams.get("file_id") || ""
  const [userEmail, setUserEmail] = useState("")
  const [canDownload, setCanDownload] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    setUserEmail(localStorage.getItem("krypts_user_email") || "")
    api.auth.me().then((u) => setUserEmail(u.email)).catch(() => {})
  }, [])

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && !!(window as any).kryptsDesktop)
  }, [])

  useEffect(() => {
    if (!token || !fileId) return
    api.tokens.validate(token, fileId)
      .then((resp: any) => {
        if (resp.valid) {
          setCanDownload(!!resp.permissions?.download)
        }
      })
      .catch(() => {})
  }, [token, fileId])

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "s" || e.key === "c")) e.preventDefault()
    }
    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = `${API_BASE}/download/${fileId}?token=${token}`
    link.download = ""
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Enforce Desktop App only
  if (!isDesktop) {
    const { DesktopBlocker } = require("@/components/layout/desktop-blocker")
    return <DesktopBlocker />
  }

  if (!token || !fileId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="flex flex-col items-center gap-3 text-center p-8 text-white">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-zinc-400 text-sm">A valid content token and file ID are required.</p>
        </div>
      </div>
    )
  }

  const imageUrl = `${API_BASE}/image/${fileId}?token=${token}`

  return (
    <div
      className="drm-protected flex flex-col min-h-screen bg-zinc-950 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 bg-zinc-900 border-b border-zinc-800 text-white">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm text-zinc-300">Protected by Krypts DRM • Watermarked image</span>
        </div>
        {canDownload && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
            Download Original
          </Button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="relative max-w-4xl w-full">
          {userEmail && <FloatingWatermark email={userEmail} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Protected content"
            className="w-full rounded-xl shadow-2xl"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
          <p className="text-center text-xs text-zinc-500 mt-3">
            This image is watermarked and tracked. Unauthorized redistribution is prohibited.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SecureImageViewer() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">Loading viewer...</div>}>
      <ImageViewerInner />
    </Suspense>
  )
}
