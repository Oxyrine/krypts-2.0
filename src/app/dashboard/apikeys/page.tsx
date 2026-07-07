"use client"

import { useEffect, useState } from "react"
import { Copy, KeyRound, Plus, Trash2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { api, ApiKeyResponse } from "@/lib/api"

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [environment, setEnvironment] = useState("live")
  const [creating, setCreating] = useState(false)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    api.apiKeys.list()
      .then(setKeys)
      .catch(() => toast.error("Failed to load API keys"))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!label.trim()) { toast.error("Label is required."); return }
    setCreating(true)
    try {
      const key = await api.apiKeys.create(label, environment)
      setKeys(prev => [key, ...prev])
      setNewRawKey(key.raw_key || null)
      setLabel("")
    } catch (err: any) {
      toast.error(err.message || "Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return
    setRevokingId(keyId)
    try {
      await api.apiKeys.revoke(keyId)
      setKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: false } : k))
      toast.success("API key revoked.")
    } catch (err: any) {
      toast.error(err.message || "Revoke failed")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">Manage programmatic access to the Krypts DRM API.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setNewRawKey(null) }}>
          <DialogTrigger className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" /> New API Key
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>Give this key a label to identify its use.</DialogDescription>
            </DialogHeader>

            {newRawKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Key created — copy it now. It won&apos;t be shown again.
                </div>
                <div className="flex gap-2">
                  <Input value={newRawKey} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline" size="icon"
                    onClick={() => { navigator.clipboard.writeText(newRawKey!); toast.success("Copied!") }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setDialogOpen(false); setNewRawKey(null) }}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g. Production Backend"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Environment</Label>
                  <Select value={environment} onValueChange={(v) => v && setEnvironment(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Key Prefix</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading keys...</TableCell>
              </TableRow>
            ) : keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No API keys yet. Create your first key above.
                </TableCell>
              </TableRow>
            ) : (
              keys.map(key => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.label}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{key.key_prefix}...</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.environment === "live" ? "default" : "secondary"}>
                      {key.environment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.is_active ? "outline" : "destructive"} className={key.is_active ? "text-green-600 border-green-500/30" : ""}>
                      {key.is_active ? "Active" : "Revoked"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(key.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {key.is_active && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokingId === key.id}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {revokingId === key.id ? "Revoking..." : "Revoke"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
