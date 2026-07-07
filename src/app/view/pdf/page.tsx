"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Shield, AlertTriangle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { API_BASE, api } from "@/lib/api"

const STORAGE_KEY = "krypts_watermark_settings"

function getWatermarkSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
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

function PdfViewerInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const fileId = searchParams.get("file_id") || ""

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages] = useState(10)  // We try pages until they fail
  const [zoom, setZoom] = useState(100)
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())
  const [validToken, setValidToken] = useState(!!token && !!fileId)
  const [userEmail, setUserEmail] = useState("")
  const [canDownload, setCanDownload] = useState(false)

  useEffect(() => {
    api.auth.me().then((u) => setUserEmail(u.email)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token || !fileId) {
      setValidToken(false)
      return
    }
    api.tokens.validate(token, fileId)
      .then((resp: any) => {
        if (resp.valid) {
          setValidToken(true)
          setCanDownload(!!resp.permissions?.download)
        } else {
          setValidToken(false)
        }
      })
      .catch(() => setValidToken(false))
  }, [token, fileId])

  useEffect(() => {
    // Anti-piracy measures
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && (e.key === "p" || e.key === "s" || e.key === "c")) || e.key === "PrintScreen") {
        e.preventDefault()
      }
    }
    const beforePrint = () => { document.body.style.display = "none" }
    const afterPrint = () => { document.body.style.display = "block" }

    document.addEventListener("contextmenu", handleContextMenu)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("beforeprint", beforePrint)
    window.addEventListener("afterprint", afterPrint)
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("beforeprint", beforePrint)
      window.removeEventListener("afterprint", afterPrint)
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

  if (!validToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center p-8">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-sm">
            A valid content token and file ID are required to view this document.
          </p>
        </div>
      </div>
    )
  }

  const pageUrl = `${API_BASE}/pdf/${fileId}/page/${currentPage}?token=${token}`

  return (
    <div
      className="drm-protected flex flex-col min-h-screen bg-zinc-900 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Header toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 bg-zinc-800 border-b border-zinc-700 text-white">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-zinc-300">Protected by Krypts DRM</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700" onClick={() => setZoom(z => Math.max(50, z - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-zinc-300 w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700" onClick={() => setZoom(z => Math.min(200, z + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-zinc-300">Page {currentPage}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-700" onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {canDownload && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white flex items-center gap-2"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* PDF page display */}
      <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
        <div className="relative" style={{ width: `${zoom}%`, maxWidth: 900 }}>
          {userEmail && <FloatingWatermark email={userEmail} />}
          <object
            data={pageUrl}
            type="application/pdf"
            className="w-full min-h-[800px] rounded shadow-xl"
            onError={() => setFailedPages(prev => new Set([...prev, currentPage]))}
          >
            {/* Fallback: render as image */}
            <img
              src={pageUrl}
              alt={`Page ${currentPage}`}
              className="w-full rounded shadow-xl"
              draggable={false}
              onError={() => setFailedPages(prev => new Set([...prev, currentPage]))}
            />
          </object>
          {failedPages.has(currentPage) && (
            <div className="mt-4 text-center text-zinc-400 text-sm">
              Could not load page {currentPage}. The document may have fewer pages.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SecurePdfViewer() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">Loading viewer...</div>}>
      <PdfViewerInner />
    </Suspense>
  )
}
