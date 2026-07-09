"use client"

import { useState } from "react"
import useSWR from "swr"
import { useSearchParams } from "next/navigation"
import { Key, Copy, Clock, Shield, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { api, FileListResponse, GenerateTokenResponse } from "@/lib/api"

export default function TokensPage() {
  const searchParams = useSearchParams()
  const preselectedFileId = searchParams.get("file_id") || ""

  const { data: files = [] } = useSWR<FileListResponse[]>(
    'files/list',
    api.files.list,
    { onError: () => toast.error("Failed to load files.") }
  )
  const [selectedFileId, setSelectedFileId] = useState(preselectedFileId)
  const [expiresIn, setExpiresIn] = useState("2h")
  const [ipRestriction, setIpRestriction] = useState("")
  const [allowDownload, setAllowDownload] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateTokenResponse | null>(null)

  const handleGenerate = async () => {
    if (!selectedFileId) {
      toast.error("Please select a file.")
      return
    }
    setGenerating(true)
    setResult(null)
    try {
      const resp = await api.tokens.generate({
        file_id: selectedFileId,
        expires_in: expiresIn,
        ip_restriction: ipRestriction || undefined,
        permissions: { view: true, download: allowDownload },
      })
      setResult(resp)
      toast.success("Token generated successfully!")
    } catch (err: any) {
      toast.error(err.message || "Token generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const selectedFile = files.find(f => f.id === selectedFileId)
  const viewerBase = selectedFile
    ? `/${selectedFile.file_type === "PDF" ? "view/pdf" : selectedFile.file_type === "VIDEO" ? "view/video" : "view/image"}?file_id=${selectedFileId}&token=`
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Token Generator</h1>
        <p className="text-muted-foreground">Generate signed access tokens for secure content delivery.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Access Token</CardTitle>
          <CardDescription>Tokens are signed JWTs that grant time-limited access to a specific file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select File</Label>
            <Select value={selectedFileId} onValueChange={(v) => v && setSelectedFileId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a protected file..." />
              </SelectTrigger>
              <SelectContent>
                {files.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{f.file_type}</Badge>
                      {f.original_filename}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Expiration</Label>
            <Select value={expiresIn} onValueChange={(v) => v && setExpiresIn(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select expiry duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30m">30 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="2h">2 hours</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>IP Restriction (optional)</Label>
            <Input
              placeholder="e.g. 192.168.1.100"
              value={ipRestriction}
              onChange={(e) => setIpRestriction(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank to allow any IP address.</p>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-155 pt-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Allow Download</Label>
              <p className="text-xs text-muted-foreground">Enable to let recipients download the decrypted file.</p>
            </div>
            <Switch
              checked={allowDownload}
              onCheckedChange={setAllowDownload}
            />
          </div>

          <Button onClick={handleGenerate} disabled={generating || !selectedFileId} className="w-full">
            <Key className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate Token"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-base text-green-600 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Token Generated
            </CardTitle>
            <CardDescription>
              Share this with your recipient. Expires at {new Date(result.expires_at).toLocaleString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* ── App Link (primary) ─────────────────────────────────── */}
            {viewerBase && typeof window !== "undefined" && (() => {
              const viewPath = viewerBase.replace(/^\//, "") // strip leading slash → "view/image?..."
              const appLink = `krypts://${viewPath}${result.token}`
              const webLink = `${window.location.origin}${viewerBase}${result.token}`

              const copyText = (text: string, label: string) => {
                navigator.clipboard.writeText(text)
                toast.success(`${label} copied!`)
              }

              const sendEmail = () => {
                const subject = encodeURIComponent("Krypts Secure File — Action Required")
                const body = encodeURIComponent(
                  `Hi,\n\nYou have been granted secure access to a protected file via Krypts DRM.\n\n` +
                  `To view it, you need the Krypts Desktop App (required for screenshot protection).\n\n` +
                  `STEP 1 — Download Krypts Desktop App:\n` +
                  `https://github.com/Oxyrine/krypts-2.0/releases/download/v0.1.0/Krypts.DRM.Setup.0.1.0.exe\n\n` +
                  `STEP 2 — Click this link to open the file directly in the app:\n` +
                  `${appLink}\n\n` +
                  `(Already installed? Just click the link above — Windows will open it automatically.)\n\n` +
                  `This link expires at: ${new Date(result.expires_at).toLocaleString()}\n\n` +
                  `— Sent via Krypts DRM`
                )
                window.open(`mailto:?subject=${subject}&body=${body}`)
              }

              return (
                <>
                  {/* App Link */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">App Link <span className="text-green-500 text-xs font-normal ml-1">★ Recommended</span></Label>
                      <span className="text-xs text-muted-foreground">Opens directly in Krypts Desktop App</span>
                    </div>
                    <div className="flex gap-2">
                      <Input value={appLink} readOnly className="font-mono text-xs bg-green-500/5 border-green-500/30" />
                      <Button variant="outline" size="icon" onClick={() => copyText(appLink, "App link")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste this link in email or chat. If the recipient has Krypts installed, clicking it launches the secure viewer directly — no browser step.
                    </p>
                  </div>

                  {/* Web Link fallback */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Web Link <span className="text-xs text-muted-foreground ml-1">(fallback)</span></Label>
                      <span className="text-xs text-muted-foreground">Shows download prompt in browser</span>
                    </div>
                    <div className="flex gap-2">
                      <Input value={webLink} readOnly className="font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyText(webLink, "Web link")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Email share */}
                  <div className="pt-2 border-t border-zinc-800">
                    <Button
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 gap-2"
                      variant="outline"
                      onClick={sendEmail}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Share via Email (opens your mail client)
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Opens a pre-written email with the app link + install instructions ready to send.
                    </p>
                  </div>
                </>
              )
            })()}

            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-zinc-800 pt-3">
              <Clock className="h-3 w-3" />
              Token ID: {result.id}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

