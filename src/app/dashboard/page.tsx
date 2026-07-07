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
  return { analytics, events }
}

export default function DashboardOverview() {
  const { data, isLoading, error } = useSWR('dashboard', fetchDashboard)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">Failed to load dashboard data. Please refresh.</p>
      </div>
    )
  }

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
