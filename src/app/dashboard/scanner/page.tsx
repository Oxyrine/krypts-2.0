"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Upload, ScanSearch, RefreshCw } from "lucide-react"

// Coverage below this is treated as "no signal" rather than a false detection.
const NO_SIGNAL_THRESHOLD_PCT = 0.05

export default function ScannerPage() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [hasScanned, setHasScanned] = useState(false)
  const [detectedPct, setDetectedPct] = useState<number | null>(null)
  const [blurRadius, setBlurRadius] = useState([1])
  const [sensitivity, setSensitivity] = useState([55])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setImageSrc(url)
      setHasScanned(false)
      setDetectedPct(null)
    }
  }

  const handleScan = () => {
    if (!imageSrc || !canvasRef.current) return
    setIsScanning(true)

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Always scan from a fresh load of the original upload -- never from a
    // previous scan's output -- so adjusting sliders and rescanning doesn't
    // compound earlier amplification.
    const img = new Image()
    img.src = imageSrc
    img.onload = () => {
      const { width, height } = img
      canvas.width = width
      canvas.height = height

      // --- Step 1: noise-reduction pass (Gaussian blur via canvas filter) ---
      // Smooths moiré and camera noise from monitor photos before detection.
      const workCanvas = document.createElement("canvas")
      workCanvas.width = width
      workCanvas.height = height
      const workCtx = workCanvas.getContext('2d')!
      workCtx.filter = blurRadius[0] > 0 ? `blur(${blurRadius[0]}px)` : "none"
      workCtx.drawImage(img, 0, 0)
      workCtx.filter = "none"
      const workData = workCtx.getImageData(0, 0, width, height).data

      // --- Step 2: background estimate (heavier blur) ---
      // Approximates "what this pixel would be without the watermark."
      const bgCanvas = document.createElement("canvas")
      bgCanvas.width = width
      bgCanvas.height = height
      const bgCtx = bgCanvas.getContext('2d')!
      bgCtx.filter = "blur(6px)"
      bgCtx.drawImage(img, 0, 0)
      bgCtx.filter = "none"
      const bgData = bgCtx.getImageData(0, 0, width, height).data

      // --- Step 3: levels/contrast boost -- literally "increase the opacity" ---
      // The watermark is a genuine low-opacity (5%) alpha-blended text
      // overlay, not a subtle bit-shift -- so recovering it is the same
      // operation as Photoshop's Levels/Auto-Contrast: subtract the local
      // background estimate (the heavy blur) from the actual pixel (the
      // lightly-denoised original) to isolate what the watermark added, then
      // multiply that difference by GAIN and re-add it around mid-gray. This
      // literally reconstructs "what this would look like at higher
      // opacity" per pixel, per channel -- so it renders as natural,
      // readable text rather than a synthetic heatmap.
      //
      // GAIN is controlled by Sensitivity. Real photos/compressed images
      // carry more ambient high-pass noise than a clean screenshot, so a
      // noisy source will need Sensitivity turned DOWN to stay legible --
      // more gain amplifies noise right along with the signal.
      const GAIN = 4 + (sensitivity[0] / 100) * 36
      const pixelCount = width * height
      const outData = ctx.createImageData(width, height)
      let flaggedPixels = 0

      for (let p = 0; p < pixelCount; p++) {
        const i = p * 4
        const dr = workData[i] - bgData[i]
        const dg = workData[i + 1] - bgData[i + 1]
        const db = workData[i + 2] - bgData[i + 2]
        outData.data[i] = Math.max(0, Math.min(255, Math.round(128 + dr * GAIN)))
        outData.data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + dg * GAIN)))
        outData.data[i + 2] = Math.max(0, Math.min(255, Math.round(128 + db * GAIN)))
        outData.data[i + 3] = 255
        if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 6) flaggedPixels++
      }

      ctx.putImageData(outData, 0, 0)
      setDetectedPct(Math.round((flaggedPixels / pixelCount) * 1000) / 10)
      setIsScanning(false)
      setHasScanned(true)
    }
  }

  const handleReset = () => {
    setImageSrc(null)
    setHasScanned(false)
    setDetectedPct(null)
  }

  const hasSignal = (detectedPct ?? 0) >= NO_SIGNAL_THRESHOLD_PCT

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Forensic Scanner</h1>
        <p className="text-muted-foreground mt-2">
          Upload a leaked screenshot or monitor photo to reveal the invisible forensic watermark and identify the leaker.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Upload Suspect Image</CardTitle>
            <CardDescription>Upload a screenshot or photo that appears to have no watermark.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-md p-12 bg-zinc-900/50">
            {!imageSrc ? (
              <label className="flex flex-col items-center cursor-pointer">
                <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                <span className="font-semibold text-sm">Click to upload image</span>
                <span className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            ) : (
              <div className="relative w-full aspect-video flex items-center justify-center bg-black rounded-md overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageSrc} alt="Uploaded" className="max-w-full max-h-full object-contain" />
              </div>
            )}
          </CardContent>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Noise Reduction (for photos of screens): {blurRadius[0]}px
              </Label>
              <Slider
                value={blurRadius}
                onValueChange={(val) => setBlurRadius(Array.isArray(val) ? [...val] : [val])}
                min={0}
                max={3}
                step={0.5}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Sensitivity: {sensitivity[0]}%
              </Label>
              <Slider
                value={sensitivity}
                onValueChange={(val) => setSensitivity(Array.isArray(val) ? [...val] : [val])}
                min={10}
                max={95}
                step={5}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between bg-muted/50 py-4">
            <Button variant="outline" onClick={handleReset} disabled={!imageSrc}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reset
            </Button>
            <Button onClick={handleScan} disabled={!imageSrc || isScanning}>
              {isScanning ? "Scanning..." : hasScanned ? "Rescan" : "Scan for Watermark"}
              <ScanSearch className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Analysis Results</CardTitle>
            <CardDescription>
              A levels/contrast boost reconstructs what the near-invisible watermark would look like at higher opacity — like Photoshop&apos;s Levels tool. Clean screenshots reveal the repeating email pattern clearly; noisy phone photos may need Sensitivity turned down to stay legible.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-6 bg-zinc-950 rounded-md min-h-[400px]">
            {hasScanned ? (
              <div className="w-full h-full">
                <canvas
                  ref={canvasRef}
                  className={`w-full h-auto object-contain rounded-md border shadow-[0_0_15px_rgba(16,185,129,0.2)] ${
                    hasSignal ? "border-emerald-900/50" : "border-zinc-700"
                  }`}
                />
                {hasSignal ? (
                  <div className="mt-4 p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-md text-emerald-200 text-sm font-mono">
                    <p className="font-bold text-emerald-500 mb-2">⚠ FORENSIC WATERMARK REVEALED</p>
                    <p>Signal coverage: {detectedPct}%</p>
                    <p>Look for the repeating diagonal text above — it carries the leaker&apos;s email.</p>
                  </div>
                ) : (
                  <div className="mt-4 p-4 bg-zinc-900/50 border border-zinc-700 rounded-md text-zinc-400 text-sm font-mono">
                    <p className="font-bold text-zinc-300 mb-2">No watermark signal detected</p>
                    <p>Signal coverage: {detectedPct}%</p>
                    <p>Try raising sensitivity or adjusting noise reduction, then rescan.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <canvas ref={canvasRef} className="hidden" />
                <ScanSearch className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Awaiting scan...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
