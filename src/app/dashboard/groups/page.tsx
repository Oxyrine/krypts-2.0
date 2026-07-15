"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api, GroupResponse, GroupFileResponse } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Users, Plus, UserPlus, FileText, Eye, Trash2 } from "lucide-react"

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDesc, setNewGroupDesc] = useState("")

  const [inviteEmail, setInviteEmail] = useState("")
  const [activeInviteGroupId, setActiveInviteGroupId] = useState<string | null>(null)
  
  const [activeMembersGroupId, setActiveMembersGroupId] = useState<string | null>(null)
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [membersError, setMembersError] = useState("")

  const [activeFilesGroupId, setActiveFilesGroupId] = useState<string | null>(null)
  const [groupFiles, setGroupFiles] = useState<GroupFileResponse[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [filesError, setFilesError] = useState("")

  const [currentEmail, setCurrentEmail] = useState("")
  const [hiddenShareIds, setHiddenShareIds] = useState<string[]>([])
  
  const [selectedShareIds, setSelectedShareIds] = useState<string[]>([])
  const [showHiddenFiles, setShowHiddenFiles] = useState(false)

  useEffect(() => {
    fetchGroups()
    fetchUser()
    const storedHidden = localStorage.getItem("hiddenGroupFiles")
    if (storedHidden) {
      try {
        setHiddenShareIds(JSON.parse(storedHidden))
      } catch (e) {}
    }
  }, [])

  const fetchUser = async () => {
    try {
      const user = await api.auth.me()
      setCurrentEmail(user.email)
    } catch (e) {}
  }

  const fetchGroups = async () => {
    try {
      const data = await api.groups.list()
      setGroups(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const [createError, setCreateError] = useState("")

  const handleCreateGroup = async () => {
    if (!newGroupName) return
    setCreateError("")
    try {
      await api.groups.create(newGroupName, newGroupDesc)
      setIsCreateOpen(false)
      setNewGroupName("")
      setNewGroupDesc("")
      fetchGroups()
    } catch (err: any) {
      console.error(err)
      setCreateError(err.message || String(err))
    }
  }

  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")

  const handleInvite = async (groupId: string) => {
    if (!inviteEmail) return
    setInviteError("")
    setInviteSuccess("")
    try {
      await api.groups.inviteMember(groupId, inviteEmail)
      setInviteEmail("")
      setInviteSuccess("User invited successfully! They must accept the invite in their inbox.")
      setTimeout(() => setInviteSuccess(""), 5000)
    } catch (err: any) {
      setInviteError(err.message || "Failed to invite user")
    }
  }

  const handleViewMembers = async (groupId: string) => {
    setActiveMembersGroupId(groupId)
    setLoadingMembers(true)
    setMembersError("")
    try {
      const members = await api.groups.getMembers(groupId)
      setGroupMembers(members)
    } catch (err: any) {
      console.error(err)
      setMembersError(err.message || "Failed to fetch members")
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleViewFiles = async (groupId: string) => {
    setActiveFilesGroupId(groupId)
    setLoadingFiles(true)
    setFilesError("")
    setGroupFiles([])
    try {
      const files = await api.groups.getFiles(groupId)
      setGroupFiles(files)
    } catch (err: any) {
      console.error(err)
      setFilesError(err.message || "Failed to fetch files")
    } finally {
      setLoadingFiles(false)
    }
  }

  const handleDeleteFile = async (groupId: string, shareId: string) => {
    try {
      await api.groups.deleteFile(groupId, shareId)
      // Refresh files
      handleViewFiles(groupId)
    } catch (err: any) {
      console.error("Failed to delete file share", err)
      setFilesError(err.message || "Failed to delete file")
    }
  }

  const handleHideFile = (shareId: string) => {
    const updated = [...hiddenShareIds, shareId]
    setHiddenShareIds(updated)
    localStorage.setItem("hiddenGroupFiles", JSON.stringify(updated))
  }

  const handleUnhideFile = (shareId: string) => {
    const updated = hiddenShareIds.filter(id => id !== shareId)
    setHiddenShareIds(updated)
    localStorage.setItem("hiddenGroupFiles", JSON.stringify(updated))
  }

  const toggleFileSelection = (shareId: string) => {
    setSelectedShareIds(prev => 
      prev.includes(shareId) 
        ? prev.filter(id => id !== shareId)
        : [...prev, shareId]
    )
  }

  const handleBulkDelete = async (groupId: string) => {
    if (selectedShareIds.length === 0) return
    try {
      await Promise.all(
        selectedShareIds.map(shareId => api.groups.deleteFile(groupId, shareId))
      )
      setSelectedShareIds([])
      handleViewFiles(groupId)
    } catch (err: any) {
      console.error("Failed to delete some files", err)
      setFilesError(err.message || "Failed to delete files")
    }
  }

  const handleViewFile = async (file: GroupFileResponse) => {
    const ct = file.content_type?.toLowerCase() || ""
    let viewerPath = "/view/pdf"
    if (ct === "video" || ct.startsWith("video/")) viewerPath = "/view/video"
    else if (ct === "image" || ct.startsWith("image/")) viewerPath = "/view/image"
    else if (ct === "pdf" || ct.includes("pdf")) viewerPath = "/view/pdf"

    try {
      // Request a short-lived token on demand (not stored in list response)
      const tokenResp = await api.tokens.generate({
        file_id: file.file_id,
        expires_in: "1h",
        permissions: { view: true, stream: true, download: false },
      })
      const url = `${viewerPath}?file_id=${file.file_id}&token=${tokenResp.token}`
      window.open(url, "_blank")
    } catch (err: any) {
      toast.error(err.message || "Could not open file — access denied or file not owned by you.")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
          <p className="text-muted-foreground mt-2">
            Create groups to securely broadcast content to multiple users at once.
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Group</DialogTitle>
              <DialogDescription>
                Groups allow you to share DRM-protected content with many users instantly.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Math 101 Students"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description (Optional)</Label>
                <Input
                  id="desc"
                  placeholder="What is this group for?"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                />
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreateGroup}>Create Group</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <CardTitle>No Groups Yet</CardTitle>
          <CardDescription className="mt-2 mb-4">
            Create a group to start building your secure community.
          </CardDescription>
          <Button variant="outline" onClick={() => setIsCreateOpen(true)}>Create your first Group</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.group_id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {group.name}
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription>
                  {group.description || "No description provided."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground">
                  <strong>{group.member_count}</strong> members
                </p>
              </CardContent>
              <CardFooter className="bg-muted/50 pt-4 flex flex-col gap-2 w-full">
                <div className="flex gap-2 w-full">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => handleViewMembers(group.group_id)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Members
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => handleViewFiles(group.group_id)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Files
                  </Button>
                </div>
                
                <Dialog open={activeInviteGroupId === group.group_id} onOpenChange={(open) => setActiveInviteGroupId(open ? group.group_id : null)}>
                  <DialogTrigger render={<Button variant="secondary" className="w-full" />}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Member
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite to {group.name}</DialogTitle>
                      <DialogDescription>
                        Invite a user to this group by their email address. They will receive an invite in their inbox.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                      <Label>User Email</Label>
                      <Input 
                        placeholder="user@example.com" 
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                      {inviteError && <p className="text-sm text-destructive mt-2">{inviteError}</p>}
                      {inviteSuccess && <p className="text-sm text-green-600 mt-2">{inviteSuccess}</p>}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => handleInvite(group.group_id)}>Send Invite</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* View Members Dialog */}
      <Dialog open={activeMembersGroupId !== null} onOpenChange={(open) => !open && setActiveMembersGroupId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Group Members</DialogTitle>
            <DialogDescription>
              Users who have access to content shared with this group.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {loadingMembers ? (
              <div className="flex justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : membersError ? (
              <p className="text-sm text-destructive text-center">{membersError}</p>
            ) : groupMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">No members found.</p>
            ) : (
              groupMembers.map(member => (
                <div key={member.user_id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{member.full_name || member.email}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="text-xs capitalize text-muted-foreground border px-2 py-1 rounded">
                    {member.role}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveMembersGroupId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Files Dialog */}
      <Dialog open={activeFilesGroupId !== null} onOpenChange={(open) => !open && setActiveFilesGroupId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shared Files</DialogTitle>
            <DialogDescription>
              Files shared securely with this group. Click a file to view it.
            </DialogDescription>
          </DialogHeader>

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="show-hidden"
                checked={showHiddenFiles}
                onCheckedChange={setShowHiddenFiles}
              />
              <Label htmlFor="show-hidden">Show Hidden Files</Label>
            </div>
            {selectedShareIds.length > 0 && (
              <Button size="sm" variant="destructive" onClick={() => handleBulkDelete(activeFilesGroupId!)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedShareIds.length})
              </Button>
            )}
          </div>

          <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto">
            {loadingFiles ? (
              <div className="flex justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : filesError ? (
              <div className="text-center py-4">
                <p className="text-sm text-destructive">{filesError}</p>
              </div>
            ) : groupFiles.filter(f => showHiddenFiles || !hiddenShareIds.includes(f.share_id)).length === 0 ? (
              <div className="text-center py-6">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No files to show.</p>
                <p className="text-xs text-muted-foreground mt-1">Share files from your Content Manager.</p>
              </div>
            ) : (
              groupFiles
                .filter(f => showHiddenFiles || !hiddenShareIds.includes(f.share_id))
                .map(file => {
                  const isHidden = hiddenShareIds.includes(file.share_id)
                  const isMine = file.shared_by_email === currentEmail
                  const isSelected = selectedShareIds.includes(file.share_id)
                  
                  return (
                    <div 
                      key={file.share_id} 
                      className={`flex items-center justify-between border rounded-lg p-3 transition-colors ${
                        isHidden ? 'bg-muted/30 opacity-75' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isMine && (
                          <input 
                            type="checkbox" 
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mr-1"
                            checked={isSelected}
                            onChange={() => toggleFileSelection(file.share_id)}
                          />
                        )}
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {file.filename}
                            {isHidden && <span className="ml-2 text-xs border px-1 rounded bg-muted">Hidden</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Shared by {file.shared_by_email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {isMine ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteFile(activeFilesGroupId!, file.share_id)}
                          >
                            Delete
                          </Button>
                        ) : isHidden ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnhideFile(file.share_id)}
                          >
                            Unhide
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleHideFile(file.share_id)}
                          >
                            Hide
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewFile(file)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveFilesGroupId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
