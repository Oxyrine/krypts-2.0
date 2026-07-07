"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { UploadCloud, File as FileIcon, X, CheckCircle2, AlertCircle, Copy } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import { API_BASE } from "@/lib/api"

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "encrypting" | "success" | "error">("idle")
  const [fileId, setFileId] = useState<string | null>(null)

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setUploadStatus("idle")
      setFileId(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadStatus("uploading")
    setProgress(20)

    const formData = new FormData()
    formData.append("file", file)

    try {
      setProgress(50)
      setUploadStatus("encrypting")

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }))
        throw new Error(err.detail || "Upload failed")
      }

      const data = await res.json()
      setProgress(100)
      setUploadStatus("success")
      setFileId(data.id)
      toast.success("File encrypted and stored successfully!")
    } catch (err: any) {
      setUploadStatus("error")
      toast.error(err.message || "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setUploadStatus("idle")
    setProgress(0)
    setFileId(null)
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload Content</h1>
        <p className="text-muted-foreground">
          Upload videos, PDFs, or images. Files are automatically AES-256 encrypted before storage.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardContent className="pt-6">
              {!file ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-xl px-12 py-16 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                    <UploadCloud className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Click or drag file to upload</h3>
                  <p className="text-sm text-muted-foreground mt-2 mb-6">
                    Videos, PDFs, and images are automatically protected with AES-256 encryption.
                  </p>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setFile(e.target.files[0])
                        setUploadStatus("idle")
                        setFileId(null)
                      }
                    }}
                    accept="video/*,application/pdf,image/*"
                  />
                  <div className="flex justify-center gap-2">
                    <Badge variant="outline">MP4</Badge>
                    <Badge variant="outline">PDF</Badge>
                    <Badge variant="outline">PNG</Badge>
                    <Badge variant="outline">JPG</Badge>
                  </div>
                </div>
              ) : (
                <div className="border rounded-xl p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm truncate max-w-xs">{file.name}</h4>
                        <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                    {uploadStatus === "idle" && (
                      <Button variant="ghost" size="icon" onClick={handleReset}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {uploadStatus !== "idle" && (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {uploadStatus === "uploading" && "Uploading to secure vault..."}
                          {uploadStatus === "encrypting" && "Applying AES-256 encryption..."}
                          {uploadStatus === "success" && (
                            <span className="text-green-500 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" /> Upload complete
                            </span>
                          )}
                          {uploadStatus === "error" && (
                            <span className="text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-4 w-4" /> Upload failed
                            </span>
                          )}
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  {uploadStatus === "idle" && (
                    <div className="flex justify-end gap-3 mt-4">
                      <Button variant="outline" onClick={handleReset}>Cancel</Button>
                      <Button onClick={handleUpload} disabled={isUploading}>Start Upload</Button>
                    </div>
                  )}

                  {uploadStatus === "success" && fileId && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 space-y-3"
                    >
                      <div className="bg-muted p-4 rounded-lg flex items-center justify-between">
                        <div className="text-sm font-mono truncate mr-2">File ID: {fileId}</div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(fileId)
                            toast.success("File ID copied!")
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <Button variant="outline" className="w-full" onClick={handleReset}>
                        Upload Another File
                      </Button>
                    </motion.div>
                  )}

                  {uploadStatus === "error" && (
                    <Button variant="outline" className="mt-4 w-full" onClick={() => setUploadStatus("idle")}>
                      Try Again
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* File Configuration */}
        <div className="md:col-span-1">
          <Card className={!file ? "opacity-50 pointer-events-none" : ""}>
            <CardHeader>
              <CardTitle className="text-sm">Protection Settings</CardTitle>
              <CardDescription>DRM configuration for this file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="policy">DRM Policy</Label>
                <Select defaultValue="strict">
                  <SelectTrigger id="policy">
                    <SelectValue placeholder="Select Policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict (No Download, Web Only)</SelectItem>
                    <SelectItem value="moderate">Moderate (Watermarked Download)</SelectItem>
                    <SelectItem value="permissive">Permissive (Tracked Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="watermark">Dynamic Watermark</Label>
                <Select defaultValue="enabled">
                  <SelectTrigger id="watermark">
                    <SelectValue placeholder="Select Rule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enabled (User ID Overlay)</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 mt-2 border-t text-xs text-muted-foreground leading-relaxed">
                These settings can be overridden per-token when issuing access via the API.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
