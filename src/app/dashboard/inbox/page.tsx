"use client"

import { useEffect, useState } from "react"
import { api, InboxItem, GroupInviteResponse } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Inbox, PlayCircle, Clock, Users, Check, X } from "lucide-react"

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [invites, setInvites] = useState<GroupInviteResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState("")
  const router = useRouter()

  useEffect(() => {
    fetchInbox()
  }, [])

  const fetchInbox = async () => {
    try {
      const [filesData, invitesData] = await Promise.all([
        api.inbox.list(),
        api.invites.list()
      ])
      setItems(filesData)
      setInvites(invitesData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async (inviteId: string) => {
    setActionError("")
    try {
      await api.invites.accept(inviteId)
      fetchInbox()
    } catch (err: any) {
      console.error(err)
      setActionError(err.message || "Failed to accept invite")
    }
  }

  const handleRejectInvite = async (inviteId: string) => {
    setActionError("")
    try {
      await api.invites.reject(inviteId)
      fetchInbox()
    } catch (err: any) {
      console.error(err)
      setActionError(err.message || "Failed to reject invite")
    }
  }

  const handleWatch = (item: InboxItem) => {
    // Navigate directly to the secure viewer using the backend-generated token
    router.push(`/view/video?file_id=${item.file_id}&token=${item.access_token}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground mt-2">
          Secure content and group invitations shared directly with you.
        </p>
      </div>

      {actionError && (
        <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {invites.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                Pending Group Invites
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {invites.map((invite) => (
                  <Card key={invite.invite_id} className="overflow-hidden border bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="bg-muted/50 pb-4">
                      <CardTitle className="line-clamp-1 text-base">{invite.group_name}</CardTitle>
                      <CardDescription className="text-xs">
                        Invited by {invite.invited_by_name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 flex gap-2">
                      <Button variant="default" className="flex-1" onClick={() => handleAcceptInvite(invite.invite_id)}>
                        <Check className="mr-2 h-4 w-4" />
                        Accept
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => handleRejectInvite(invite.invite_id)}>
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Shared Files
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <Card key={item.share_id} className="overflow-hidden border bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="bg-muted/50 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="line-clamp-1 text-base">{item.filename}</CardTitle>
                          <CardDescription className="flex items-center text-xs">
                            Shared by {item.shared_by_name}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="flex items-center text-xs text-muted-foreground mb-4">
                        <Clock className="mr-1 h-3 w-3" />
                        {new Date(item.shared_at).toLocaleDateString()}
                      </div>
                      <Button onClick={() => handleWatch(item)} className="w-full">
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Watch Securely
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {invites.length === 0 && items.length === 0 && (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle>Your inbox is empty</CardTitle>
              <CardDescription className="mt-2">
                When someone shares a secure file or invites you to a group, it will appear here.
              </CardDescription>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
