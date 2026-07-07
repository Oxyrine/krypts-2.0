# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce dashboard and content-list page load times from 3-5s to <500ms by adding SWR client-side caching and consolidating redundant backend queries.

**Architecture:** Install SWR on the frontend to cache API responses so re-navigation is instant. Fix the dashboard to fire its two API calls in parallel. On the backend, consolidate 5 sequential DB queries in the analytics endpoint into one concurrent `asyncio.gather` call, and add pagination to admin endpoints that currently return unbounded result sets.

**Tech Stack:** SWR (frontend caching), Next.js 16 App Router, FastAPI + SQLAlchemy async, Python `asyncio.gather`

**Note:** The CORS bug (`allow_origins=["*"]` + `allow_credentials=True`) in `backend/app/main.py` was already fixed. Do not re-fix it.

---

## File Map

| File | Change |
|------|--------|
| `package.json` | add `swr` dependency |
| `src/app/dashboard/page.tsx` | replace `useEffect` pattern with `useSWR` + `Promise.all` |
| `src/app/dashboard/content/page.tsx` | replace `useEffect` pattern with `useSWR` |
| `src/app/dashboard/tokens/page.tsx` | replace `useEffect` pattern with `useSWR` |
| `src/app/dashboard/admin/page.tsx` | replace `useEffect` + `loadUsers` with `useSWR` |
| `src/app/dashboard/admin/alerts/page.tsx` | replace `useEffect` + sequential mark-all with `useSWR` + `Promise.all` |
| `backend/app/routers/analytics.py` | replace 5 sequential `await db.execute` with `asyncio.gather` |
| `backend/app/models/protected_file.py` | add `index=True` to `created_at` column |
| `backend/app/routers/admin.py` | add `skip`/`limit` pagination to `list_users` and `security_alerts` |

---

## Task 1: Install SWR

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

From the repo root (`c:\Documents\Hackathon\drm-platform`):

```bash
npm install swr
```

Expected output: `added 1 package` (swr has no dependencies of its own).

- [ ] **Step 2: Verify**

```bash
grep '"swr"' package.json
```

Expected: `"swr": "^2.x.x"` (some 2.x version).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add swr for client-side data caching"
```

---

## Task 2: Migrate dashboard/page.tsx

**Files:**
- Modify: `src/app/dashboard/page.tsx`

Currently makes two independent API calls in a `useEffect` without `Promise.all`, and holds data in local state that is discarded on navigation.

- [ ] **Step 1: Replace the file**

Replace the entire `src/app/dashboard/page.tsx` with the following:

```tsx
"use client"

import { lazy, Suspense } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, ShieldCheck, Film, Users, AlertTriangle } from "lucide-react"
import { api, UsageAnalytics, SecurityEventItem } from "@/lib/api"

const LazyChart = lazy(() => import("recharts").then(m => {
  const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } = m
  return { default: ({ data }: { data: any[] }) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
          itemStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Area type="monotone" dataKey="sessions" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSessions)" />
        <Area type="monotone" dataKey="blocked" stroke="#ef4444" fillOpacity={1} fill="url(#colorBlocked)" />
      </AreaChart>
    </ResponsiveContainer>
  )}
}))

const fallbackChartData = [
  { name: "Mon", sessions: 0, blocked: 0 },
  { name: "Tue", sessions: 0, blocked: 0 },
  { name: "Wed", sessions: 0, blocked: 0 },
  { name: "Thu", sessions: 0, blocked: 0 },
  { name: "Fri", sessions: 0, blocked: 0 },
  { name: "Sat", sessions: 0, blocked: 0 },
  { name: "Sun", sessions: 0, blocked: 0 },
]

async function fetchDashboard(): Promise<{ analytics: UsageAnalytics; events: SecurityEventItem[] }> {
  const [analytics, events] = await Promise.all([
    api.analytics.usage(),
    api.analytics.securityEvents(5),
  ])
  return { analytics, events: events as SecurityEventItem[] }
}

export default function DashboardOverview() {
  const { data, isLoading } = useSWR('dashboard', fetchDashboard)

  const analytics = data?.analytics ?? null
  const securityEvents = data?.events ?? []

  const stats = [
    {
      label: "Protected Files",
      value: isLoading ? "—" : analytics?.total_files ?? 0,
      icon: ShieldCheck,
      color: "text-primary",
      sub: "AES-256 encrypted",
    },
    {
      label: "Access Tokens",
      value: isLoading ? "—" : analytics?.total_tokens_issued ?? 0,
      icon: Users,
      color: "text-emerald-500",
      sub: "Signed JWTs issued",
    },
    {
      label: "Blocked Attempts",
      value: isLoading ? "—" : analytics?.blocked_attempts ?? 0,
      icon: Activity,
      color: "text-destructive",
      sub: "Failed auth attempts",
    },
    {
      label: "Bandwidth Saved",
      value: isLoading ? "—" : `${analytics?.bandwidth_saved_mb?.toFixed(1) ?? 0} MB`,
      icon: Film,
      color: "text-blue-500",
      sub: "Total content size",
    },
  ]

  const recentActivity = analytics?.recent_events?.slice(0, 5) ?? []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Usage Analytics</CardTitle>
            <CardDescription>Authenticated sessions vs blocked piracy attempts.</CardDescription>
          </CardHeader>
          <CardContent className="pl-0 pb-4 pr-4 border-t pt-4">
            <div className="h-[300px] w-full mt-4">
              <Suspense fallback={<div className="h-full w-full animate-pulse rounded bg-muted" />}>
                <LazyChart data={fallbackChartData} />
              </Suspense>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Real-time feed of DRM events and alerts.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 && securityEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <AlertTriangle className="h-6 w-6" />
                <p>No activity yet. Upload a file to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...securityEvents.slice(0, 3).map(e => ({
                  time: new Date(e.timestamp).toLocaleString(),
                  action: e.description,
                  type: e.alert_type.includes("ban") ? "error" : e.alert_type.includes("rapid") ? "error" : "info",
                })), ...recentActivity.slice(0, 2).map(e => ({
                  time: new Date(e.timestamp).toLocaleString(),
                  action: `${e.event_type} from ${e.ip_address || "unknown"}`,
                  type: e.event_type === "failure" ? "error" : "success",
                }))].map((activity, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className={`mt-0.5 h-2 w-2 rounded-full ring-4 ring-background ${
                      activity.type === 'error' ? 'bg-destructive ring-destructive/20' :
                      activity.type === 'success' ? 'bg-green-500 ring-green-500/20' : 'bg-blue-500 ring-blue-500/20'
                    }`}></div>
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Start the dev server (`npm run dev`), log in, and navigate to `/dashboard`.
- First visit: data loads (spinner briefly visible).
- Navigate away to `/dashboard/content`, then back to `/dashboard`.
- Expected: stats appear **instantly** (no spinner) — SWR serves from cache.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "perf: migrate dashboard overview to useSWR with parallel API calls"
```

---

## Task 3: Migrate content/page.tsx

**Files:**
- Modify: `src/app/dashboard/content/page.tsx`

Uses `useEffect` to fetch file list on every mount. With SWR key `'files/list'`, the same cache is shared with the tokens page (Task 4), so both pages benefit from a single fetch.

- [ ] **Step 1: Replace the file**

Replace the entire `src/app/dashboard/content/page.tsx` with:

```tsx
"use client"

import { useState } from "react"
import useSWR from "swr"
import { FileVideo, FileText, Image as ImageIcon, Search, MoreHorizontal, ShieldCheck, Trash2, Key } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { api, FileListResponse } from "@/lib/api"

const TypeIcon = ({ type }: { type: string }) => {
  if (type === "VIDEO") return <FileVideo className="h-4 w-4 text-blue-500" />
  if (type === "PDF") return <FileText className="h-4 w-4 text-red-500" />
  if (type === "IMAGE") return <ImageIcon className="h-4 w-4 text-green-500" />
  return <ShieldCheck className="h-4 w-4 text-muted-foreground" />
}

export default function ContentPage() {
  const { data: files = [], isLoading, mutate } = useSWR<FileListResponse[]>('files/list', api.files.list)
  const [search, setSearch] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return
    setDeletingId(fileId)
    try {
      await api.files.delete(fileId)
      mutate(files.filter(f => f.id !== fileId), { revalidate: false })
      toast.success("File deleted.")
    } catch (err: any) {
      toast.error(err.message || "Delete failed.")
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = files.filter(f =>
    f.original_filename.toLowerCase().includes(search.toLowerCase())
  )

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link href="/dashboard/upload" className={buttonVariants()}>Upload New</Link>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Loading files...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search ? "No files match your search." : "No files yet. Upload your first file."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TypeIcon type={file.file_type} />
                      <div>
                        <div className="font-medium text-sm truncate max-w-[200px]">{file.original_filename}</div>
                        <div className="text-xs text-muted-foreground font-mono">{file.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{file.file_type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatSize(file.file_size)}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {file.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(file.upload_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon" }) + " h-8 w-8"}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => window.location.href = `/dashboard/tokens?file_id=${file.id}`}>
                          <Key className="mr-2 h-4 w-4" />
                          Generate Token
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(file.id, file.original_filename)}
                          disabled={deletingId === file.id}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingId === file.id ? "Deleting..." : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} file{filtered.length !== 1 ? "s" : ""} • All encrypted with AES-256
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/dashboard/content`. Files load on first visit.
Navigate away (e.g. to `/dashboard`) and back to `/dashboard/content`.
Expected: file list appears instantly, no loading spinner.
Delete a file — verify it disappears immediately and count updates.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/content/page.tsx
git commit -m "perf: migrate content page to useSWR with optimistic delete"
```

---

## Task 4: Migrate tokens/page.tsx

**Files:**
- Modify: `src/app/dashboard/tokens/page.tsx`

Uses `api.files.list()` to populate the file dropdown. By using SWR key `'files/list'` — the same key as the content page — both pages share one cache entry. If the user visited `/dashboard/content` first, the token page's dropdown is instant.

- [ ] **Step 1: Replace the file**

Replace the entire `src/app/dashboard/tokens/page.tsx` with:

```tsx
"use client"

import { useState } from "react"
import useSWR from "swr"
import { useSearchParams } from "next/navigation"
import { Key, Copy, Clock, Shield } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { api, FileListResponse, GenerateTokenResponse } from "@/lib/api"

export default function TokensPage() {
  const searchParams = useSearchParams()
  const preselectedFileId = searchParams.get("file_id") || ""

  const { data: files = [] } = useSWR<FileListResponse[]>('files/list', api.files.list)
  const [selectedFileId, setSelectedFileId] = useState(preselectedFileId)
  const [expiresIn, setExpiresIn] = useState("2h")
  const [ipRestriction, setIpRestriction] = useState("")
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
        permissions: { view: true, download: false },
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
                <SelectValue />
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
              Share this token securely. It expires at {new Date(result.expires_at).toLocaleString()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Access Token</Label>
              <div className="flex gap-2">
                <Input value={result.token} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline" size="icon"
                  onClick={() => { navigator.clipboard.writeText(result.token); toast.success("Token copied!") }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {viewerBase && typeof window !== "undefined" && (
              <div className="space-y-2">
                <Label>Viewer URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${window.location.origin}${viewerBase}${result.token}`}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline" size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${viewerBase}${result.token}`)
                      toast.success("URL copied!")
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Token ID: {result.id}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Visit `/dashboard/content` first (populates cache), then navigate to `/dashboard/tokens`.
Expected: file dropdown is populated instantly with no delay.
Generate a token — verify it works as before.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/tokens/page.tsx
git commit -m "perf: migrate tokens page to useSWR, shares files/list cache with content page"
```

---

## Task 5: Migrate admin/page.tsx

**Files:**
- Modify: `src/app/dashboard/admin/page.tsx`

Currently uses a `loadUsers` helper called in `useEffect` and after every user action. Replace with `useSWR` — after actions, call `mutate()` to revalidate instead of re-fetching manually.

- [ ] **Step 1: Replace the file**

Replace the entire `src/app/dashboard/admin/page.tsx` with:

```tsx
"use client"

import useSWR from "swr"
import Link from "next/link"
import { useState } from "react"
import { ShieldAlert, ShieldCheck, ShieldX, ShieldOff, RefreshCw, Bell } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, AdminUserResponse } from "@/lib/api"

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-600 border-green-500/20",
    suspended: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    banned: "bg-red-500/10 text-red-600 border-red-500/20",
  }
  return (
    <Badge variant="outline" className={map[status] || ""}>
      {status}
    </Badge>
  )
}

export default function AdminPage() {
  const { data: users = [], isLoading, mutate } = useSWR<AdminUserResponse[]>('admin/users', api.admin.users)
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const handleAction = async (
    userId: string,
    action: "ban" | "suspend" | "reactivate",
    userEmail: string
  ) => {
    const labels = { ban: "ban", suspend: "suspend", reactivate: "reactivate" }
    if (!confirm(`${labels[action].charAt(0).toUpperCase() + labels[action].slice(1)} user ${userEmail}?`)) return

    setActionUserId(userId)
    try {
      if (action === "ban") await api.admin.banUser(userId)
      else if (action === "suspend") await api.admin.suspendUser(userId)
      else await api.admin.reactivateUser(userId)
      toast.success(`User ${action}ned.`)
      mutate()
    } catch (err: any) {
      toast.error(err.message || "Action failed")
    } finally {
      setActionUserId(null)
    }
  }

  const suspended = users.filter(u => u.account_status === "suspended").length
  const banned = users.filter(u => u.account_status === "banned").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground">Monitor users, manage accounts, and review security incidents.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          <Link href="/dashboard/admin/alerts" className={buttonVariants({ size: "sm" })}>
            <Bell className="mr-2 h-4 w-4" />Security Alerts
          </Link>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Users", value: users.length, icon: ShieldCheck, color: "text-primary" },
          { label: "Active Users", value: users.filter(u => u.account_status === "active").length, icon: ShieldCheck, color: "text-green-500" },
          { label: "Suspended", value: suspended, icon: ShieldOff, color: "text-yellow-500" },
          { label: "Banned", value: banned, icon: ShieldX, color: "text-destructive" },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "—" : s.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>All registered users. Rapid-session detection is active.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>Rapid Sessions</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading users...</TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No users found.</TableCell>
                </TableRow>
              ) : (
                users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{user.email}</div>
                      {user.full_name && <div className="text-xs text-muted-foreground">{user.full_name}</div>}
                    </TableCell>
                    <TableCell><StatusBadge status={user.account_status} /></TableCell>
                    <TableCell>
                      {user.warning_count > 0
                        ? <Badge variant="destructive" className="text-xs">{user.warning_count}</Badge>
                        : <span className="text-muted-foreground text-sm">0</span>
                      }
                    </TableCell>
                    <TableCell>
                      {user.rapid_session_count > 0
                        ? <Badge variant="secondary" className="text-xs">{user.rapid_session_count}</Badge>
                        : <span className="text-muted-foreground text-sm">0</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_login_time ? new Date(user.last_login_time).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={actionUserId === user.id}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <ShieldAlert className="h-4 w-4 mr-1" />
                          Actions
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Manage User</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {user.account_status !== "active" && (
                            <DropdownMenuItem onClick={() => handleAction(user.id, "reactivate", user.email)}>
                              <ShieldCheck className="mr-2 h-4 w-4 text-green-500" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          {user.account_status === "active" && (
                            <DropdownMenuItem onClick={() => handleAction(user.id, "suspend", user.email)}>
                              <ShieldOff className="mr-2 h-4 w-4 text-yellow-500" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                          {user.account_status !== "banned" && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleAction(user.id, "ban", user.email)}
                            >
                              <ShieldX className="mr-2 h-4 w-4" />
                              Ban Permanently
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => window.location.href = `/dashboard/admin/alerts?user_id=${user.id}`}>
                            View Activity
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/dashboard/admin`. Users load on first visit.
Navigate away and back — list appears instantly.
Suspend or ban a user — verify the table updates after the action.
Click Refresh — verify it reloads from the server.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/admin/page.tsx
git commit -m "perf: migrate admin users page to useSWR"
```

---

## Task 6: Migrate admin/alerts/page.tsx + fix mark-all-read

**Files:**
- Modify: `src/app/dashboard/admin/alerts/page.tsx`

Two fixes in one: (1) SWR caching for the alerts list, (2) replace the sequential `for...await` loop in `handleMarkAllRead` with `Promise.all`.

- [ ] **Step 1: Replace the file**

Replace the entire `src/app/dashboard/admin/alerts/page.tsx` with:

```tsx
"use client"

import useSWR from "swr"
import { useState } from "react"
import Link from "next/link"
import { Bell, CheckCircle2, AlertTriangle, ShieldX, RefreshCw, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { api, SecurityAlertResponse } from "@/lib/api"

const AlertTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, { label: string; class: string }> = {
    rapid_session: { label: "Rapid Session", class: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
    failed_logins: { label: "Failed Logins", class: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    suspended: { label: "Suspended", class: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    banned: { label: "Banned", class: "bg-red-500/10 text-red-600 border-red-500/20" },
    manual: { label: "Manual", class: "bg-muted text-muted-foreground" },
  }
  const style = map[type] || { label: type, class: "bg-muted" }
  return <Badge variant="outline" className={`text-xs ${style.class}`}>{style.label}</Badge>
}

export default function AlertsPage() {
  const { data: alerts = [], isLoading, mutate } = useSWR<SecurityAlertResponse[]>(
    'admin/alerts',
    api.admin.securityAlerts
  )
  const [markingId, setMarkingId] = useState<string | null>(null)

  const handleMarkRead = async (alertId: string) => {
    setMarkingId(alertId)
    try {
      await api.admin.markAlertRead(alertId)
      mutate(
        alerts.map(a => a.alert_id === alertId ? { ...a, status: "read" } : a),
        { revalidate: false }
      )
    } catch (err: any) {
      toast.error(err.message || "Failed to update alert")
    } finally {
      setMarkingId(null)
    }
  }

  const handleMarkAllRead = async () => {
    const unread = alerts.filter(a => a.status === "unread")
    await Promise.all(unread.map(a => api.admin.markAlertRead(a.alert_id).catch(() => {})))
    mutate(alerts.map(a => ({ ...a, status: "read" })), { revalidate: false })
    toast.success(`Marked ${unread.length} alerts as read.`)
  }

  const unreadCount = alerts.filter(a => a.status === "unread").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin" className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Security Alerts
              {unreadCount > 0 && (
                <Badge className="bg-destructive text-destructive-foreground">{unreadCount}</Badge>
              )}
            </h1>
            <p className="text-muted-foreground">Monitor suspicious behavior and security incidents.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          {unreadCount > 0 && (
            <Button size="sm" onClick={handleMarkAllRead}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Mark All Read
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Alerts", value: alerts.length, icon: Bell, color: "text-primary" },
          { label: "Unread", value: unreadCount, icon: AlertTriangle, color: "text-yellow-500" },
          { label: "Bans", value: alerts.filter(a => a.alert_type === "banned").length, icon: ShieldX, color: "text-destructive" },
          { label: "Rapid Sessions", value: alerts.filter(a => a.alert_type === "rapid_session").length, icon: AlertTriangle, color: "text-orange-500" },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "—" : s.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Alerts</CardTitle>
          <CardDescription>Security events triggered by automated behavior detection.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading alerts...</TableCell>
                </TableRow>
              ) : alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No security alerts. Your platform is clean!
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map(alert => (
                  <TableRow key={alert.alert_id} className={alert.status === "unread" ? "bg-muted/30" : ""}>
                    <TableCell><AlertTypeBadge type={alert.alert_type} /></TableCell>
                    <TableCell className="text-sm max-w-[280px]">
                      <span className="line-clamp-2">{alert.description}</span>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {alert.user_id.slice(0, 8)}...
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {alert.ip_address || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={alert.status === "unread" ? "destructive" : "secondary"} className="text-xs">
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {alert.status === "unread" && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleMarkRead(alert.alert_id)}
                          disabled={markingId === alert.alert_id}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Mark Read
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/dashboard/admin/alerts`. Alerts load on first visit.
Navigate away and back — alerts appear instantly.
If unread alerts exist, click "Mark All Read" — verify all rows update immediately and the unread badge disappears. Check the Network tab: all PATCH requests fire simultaneously (parallel, not one-by-one).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/admin/alerts/page.tsx
git commit -m "perf: migrate alerts page to useSWR, fix mark-all-read to use Promise.all"
```

---

## Task 7: Consolidate analytics queries with asyncio.gather

**Files:**
- Modify: `backend/app/routers/analytics.py`

The `/analytics/usage` endpoint runs 5 sequential `await db.execute()` calls. Replace with `asyncio.gather` so all 5 DB queries run concurrently. The `asyncio` module is part of the Python standard library — no install needed.

- [ ] **Step 1: Replace analytics.py**

Replace the entire `backend/app/routers/analytics.py` with:

```python
"""
Analytics routes: usage statistics and security event history.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.activity_log import EventType, UserActivityLog
from app.models.protected_file import ProtectedFile
from app.models.security_alert import SecurityAlert
from app.schemas import SecurityEventItem, UsageAnalytics

router = APIRouter()


@router.get("/usage", response_model=UsageAnalytics)
async def usage_analytics(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.user_id

    files_q = db.execute(
        select(func.count(ProtectedFile.file_id)).where(ProtectedFile.owner_id == uid)
    )
    bw_q = db.execute(
        select(func.sum(ProtectedFile.size_bytes)).where(ProtectedFile.owner_id == uid)
    )
    events_q = db.execute(
        select(func.count(UserActivityLog.log_id)).where(
            UserActivityLog.user_id == uid,
            UserActivityLog.event_type == EventType.login,
        )
    )
    failed_q = db.execute(
        select(func.count(UserActivityLog.log_id)).where(
            UserActivityLog.user_id == uid,
            UserActivityLog.event_type == EventType.failure,
        )
    )
    recent_q = db.execute(
        select(UserActivityLog)
        .where(UserActivityLog.user_id == uid)
        .order_by(UserActivityLog.timestamp.desc())
        .limit(10)
    )

    files_r, bw_r, events_r, failed_r, recent_r = await asyncio.gather(
        files_q, bw_q, events_q, failed_q, recent_q
    )

    total_files = files_r.scalar() or 0
    total_bytes = bw_r.scalar() or 0
    bandwidth_saved_mb = round(total_bytes / (1024 * 1024), 2)
    total_access_events = events_r.scalar() or 0
    blocked_attempts = failed_r.scalar() or 0
    recent_logs = recent_r.scalars().all()

    recent_events = [
        {
            "id": str(log.log_id),
            "event_type": log.event_type.value,
            "timestamp": log.timestamp.isoformat(),
            "ip_address": log.ip_address,
        }
        for log in recent_logs
    ]

    return UsageAnalytics(
        total_files=total_files,
        total_tokens_issued=total_access_events,
        total_access_events=total_access_events,
        blocked_attempts=blocked_attempts,
        bandwidth_saved_mb=bandwidth_saved_mb,
        recent_events=recent_events,
    )


@router.get("/security-events", response_model=list[SecurityEventItem])
async def security_events(
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SecurityAlert)
        .where(SecurityAlert.user_id == current_user.user_id)
        .order_by(SecurityAlert.timestamp.desc())
        .limit(limit)
    )
    alerts = result.scalars().all()

    return [
        SecurityEventItem(
            alert_id=str(a.alert_id),
            alert_type=a.alert_type.value,
            description=a.description,
            timestamp=a.timestamp,
            status=a.status.value,
            ip_address=a.ip_address,
        )
        for a in alerts
    ]
```

- [ ] **Step 2: Restart the backend and verify**

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Hit the endpoint directly:

```bash
curl -H "Authorization: Bearer <your_token>" http://localhost:8000/analytics/usage
```

Expected: JSON response with `total_files`, `blocked_attempts`, etc. No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/analytics.py
git commit -m "perf: parallelize analytics DB queries with asyncio.gather"
```

---

## Task 8: Add index to ProtectedFile.created_at

**Files:**
- Modify: `backend/app/models/protected_file.py`

`UserActivityLog.user_id` and `SecurityAlert.user_id` already have `index=True`. Only `ProtectedFile.created_at` is missing its index — it is used in `ORDER BY` queries when listing files.

- [ ] **Step 1: Add index=True to created_at**

In `backend/app/models/protected_file.py`, change line 37-39 from:

```python
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

To:

```python
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
```

- [ ] **Step 2: Verify index is created on restart**

Restart the backend. SQLAlchemy's `init_db()` runs `create_all` on startup which adds the index to the SQLite dev DB automatically.

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected: server starts without errors.

For SQLite dev, the index is applied automatically. For PostgreSQL production, run:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_protected_files_created_at
ON protected_files (created_at);
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/protected_file.py
git commit -m "perf: add index to ProtectedFile.created_at for ORDER BY queries"
```

---

## Task 9: Add pagination to admin endpoints

**Files:**
- Modify: `backend/app/routers/admin.py`

`list_users` returns all users with no limit. `security_alerts` has a hardcoded `LIMIT 200`. Both get `skip`/`limit` query parameters. The frontend already calls these without params — the default `limit=50` applies automatically.

- [ ] **Step 1: Update list_users**

In `backend/app/routers/admin.py`, replace the `list_users` function (lines 36-44):

```python
@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 50,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return [AdminUserResponse.from_user(u) for u in users]
```

- [ ] **Step 2: Update security_alerts**

In the same file, replace the `security_alerts` function (lines 148-168):

```python
@router.get("/security-alerts", response_model=list[SecurityAlertResponse])
async def security_alerts(
    skip: int = 0,
    limit: int = 50,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    result = await db.execute(
        select(SecurityAlert)
        .order_by(SecurityAlert.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )
    alerts = result.scalars().all()
    return [
        SecurityAlertResponse(
            alert_id=str(a.alert_id),
            user_id=str(a.user_id),
            alert_type=a.alert_type.value,
            description=a.description,
            timestamp=a.timestamp,
            status=a.status.value,
            ip_address=a.ip_address,
        )
        for a in alerts
    ]
```

- [ ] **Step 3: Verify**

Restart backend and hit the endpoints:

```bash
curl -H "Authorization: Bearer <your_token>" "http://localhost:8000/admin/users"
# Returns up to 50 users

curl -H "Authorization: Bearer <your_token>" "http://localhost:8000/admin/users?skip=50&limit=50"
# Returns users 51-100

curl -H "Authorization: Bearer <your_token>" "http://localhost:8000/admin/security-alerts"
# Returns up to 50 alerts
```

Expected: valid JSON arrays, no errors. Admin panel in the browser still shows users and alerts correctly.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/admin.py
git commit -m "perf: add skip/limit pagination to admin users and security alerts endpoints"
```

---

## Final Verification

- [ ] Run `npm run build` from the repo root — verify no TypeScript errors.
- [ ] Start backend + frontend, log in, and time the dashboard load: should be under 1s.
- [ ] Navigate away and back to `/dashboard` — should be instant (< 100ms).
- [ ] Repeat for `/dashboard/content`, `/dashboard/tokens`, `/dashboard/admin`, `/dashboard/admin/alerts`.
- [ ] Verify file delete still works correctly on `/dashboard/content`.
- [ ] Verify user actions (ban/suspend/reactivate) still work on `/dashboard/admin`.
