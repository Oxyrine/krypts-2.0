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
  const { data: users = [], isLoading, mutate } = useSWR<AdminUserResponse[]>(
    'admin/users',
    api.admin.users,
    { onError: () => toast.error("Failed to load users.") }
  )
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
      const actionLabels = { ban: "banned", suspend: "suspended", reactivate: "reactivated" }
      toast.success(`User ${actionLabels[action]}.`)
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
