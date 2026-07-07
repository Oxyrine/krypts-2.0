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
  const { data: files = [], isLoading, mutate } = useSWR<FileListResponse[]>(
    'files/list',
    api.files.list,
    { onError: () => toast.error("Failed to load files.") }
  )
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
