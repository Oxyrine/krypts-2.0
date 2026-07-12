"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Shield, AlertTriangle, Download } from "lucide-react"
import { API_BASE, api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useTelemetry } from "@/lib/useTelemetry"

const STORAGE_KEY = "krypts_watermark_settings"

function InvisibleWatermark({ email }: { email: string }) {
  const displayText = email + " | " + Date.now().toString(36) + " | ";
  // Create a very long string to completely fill the screen
  const gridText = Array(3000).fill(displayText).join("");

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden break-all"
      style={{
        opacity: 0.02,
        mixBlendMode: 'difference',
        color: '#ffffff',
        fontSize: '12px',
        lineHeight: '12px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        userSelect: 'none'
      }}
    >
      {gridText}
    </div>
  )
}

function VideoViewerInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const fileId = searchParams.get("file_id") || ""
  const [userEmail, setUserEmail] = useState<string>("")
  const [canDownload, setCanDownload] = useState(false)
  const [isHoneypot, setIsHoneypot] = useState(false)

  const { reportScrubbing } = useTelemetry(fileId)

  useEffect(() => {
    setUserEmail(localStorage.getItem("krypts_user_email") || "")
    api.auth.me().then((u) => setUserEmail(u.email)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token || !fileId) return
    api.tokens.validate(token, fileId)
      .then((resp: any) => {
        if (resp.valid) {
          setCanDownload(!!resp.permissions?.download)
          if (resp.is_honeypot) {
            setIsHoneypot(true)
            api.analytics.submitTelemetry("ip_mismatch", { fileId }).catch(() => {})
          }
        }
      })
      .catch(() => {})
  }, [token, fileId])

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "s" || e.key === "u")) e.preventDefault()
      if (e.key === "PrintScreen") {
        e.preventDefault()
        document.body.style.display = "none"
        setTimeout(() => { document.body.style.display = "" }, 100)
      }
    }
    const handleVisibility = () => {
      const video = document.querySelector("video")
      if (document.visibilityState === "hidden" && video && !video.paused) {
        video.pause()
      }
    }
    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("visibilitychange", handleVisibility)
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

  const videoUrl = isHoneypot ? "/decoy.mp4" : `${API_BASE}/stream/video/${fileId}?token=${token}`

  if (isHoneypot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <div className="flex flex-col items-center gap-3 text-center p-8 text-white">
          <AlertTriangle className="h-10 w-10 text-yellow-500" />
          <h2 className="text-xl font-semibold">Important Notice</h2>
          <p className="text-zinc-400 text-sm">This video has been redacted due to security policy restrictions.</p>
        </div>
      </div>
    )
  }

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
          <span className="text-sm text-zinc-300">Protected by Krypts DRM • Streaming encrypted content</span>
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

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-4xl bg-black rounded-xl overflow-hidden">
          {userEmail && <InvisibleWatermark email={userEmail} />}
          <video
            src={videoUrl}
            controls
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            className="w-full rounded-xl shadow-2xl"
            onContextMenu={(e) => e.preventDefault()}
            onSeeked={() => reportScrubbing()}
          >
            Your browser does not support secure video playback.
          </video>
          <p className="text-center text-xs text-zinc-500 mt-3">
            This content is watermarked and tracked. Unauthorized redistribution is prohibited.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SecureVideoViewer() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">Loading viewer...</div>}>
      <VideoViewerInner />
    </Suspense>
  )
}
