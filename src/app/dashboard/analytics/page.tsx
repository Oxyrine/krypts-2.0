"use client"

import useSWR from "swr"
import { toast } from "sonner"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts"
import { api, UsageAnalytics } from "@/lib/api"

const fallbackAuthData = [
  { name: "Mon", sessions: 0, blocked: 0 },
  { name: "Tue", sessions: 0, blocked: 0 },
  { name: "Wed", sessions: 0, blocked: 0 },
  { name: "Thu", sessions: 0, blocked: 0 },
  { name: "Fri", sessions: 0, blocked: 0 },
  { name: "Sat", sessions: 0, blocked: 0 },
  { name: "Sun", sessions: 0, blocked: 0 },
]

const fallbackContentData = [
  { name: "Video", value: 0, color: "#ec4899" },
  { name: "PDF", value: 0, color: "#3b82f6" },
  { name: "Image", value: 0, color: "#10b981" },
]

export default function AnalyticsPage() {
  const { data: analytics, isLoading, error, mutate } = useSWR<UsageAnalytics>(
    'analytics/usage',
    api.analytics.usage,
    { onError: () => toast.error("Failed to load analytics data.") }
  )

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">Failed to load analytics data. Please refresh.</p>
        <Button variant="outline" size="sm" onClick={() => mutate()} className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    )
  }

  const authData = analytics?.auth_data && analytics.auth_data.length > 0
    ? analytics.auth_data
    : fallbackAuthData

  const contentData = analytics?.content_data && analytics.content_data.length > 0
    ? analytics.content_data
    : fallbackContentData

  const geoData = analytics?.geo_data && analytics.geo_data.length > 0
    ? analytics.geo_data
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics & Reports</h1>
          <p className="text-muted-foreground">In-depth insights into your secured content access.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Select defaultValue="7d">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

        {/* Authentication Security */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Authentication Events</CardTitle>
            <CardDescription>
              Successful token validations vs failed/blocked access attempts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={authData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="sessions" name="Successful Access" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="blocked" name="Blocked Attempts" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Content Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Access by Format</CardTitle>
            <CardDescription>
              Which content types are most consumed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={contentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {contentData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 w-full justify-center">
              {contentData.map((item: any) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Access IPs */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Access IPs</CardTitle>
            <CardDescription>
              Which IP addresses are generating the most DRM traffic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {geoData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No IP logs available yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={geoData}
                    margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#333" />
                    <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="value" name="Access Count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
