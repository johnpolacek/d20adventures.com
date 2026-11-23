"use client"

import * as React from "react"
import { useState } from "react"
import { toast } from "@d20/ui/toast"
import { banUser } from "@/app/_actions/ban-user"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@d20/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@d20/ui/avatar"
import { Button } from "@d20/ui/button"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Swap } from "@d20/ui/presence"

interface User {
  id: string
  email: string | undefined
  username: string | null
  firstName: string | null
  lastName: string | null
  imageUrl: string
  createdAt: string
  isAdmin: boolean
  banned: boolean
  publicMetadata?: {
    banReason?: string
  }
}

interface AdminUserListProps {
  initialUsers: User[]
}

export function AdminUserList({ initialUsers }: AdminUserListProps) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [showBanDialog, setShowBanDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [banReason, setBanReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleBanClick = (user: User) => {
    setSelectedUser(user)
    setShowBanDialog(true)
  }

  const handleBanConfirm = async () => {
    if (!selectedUser) return

    setIsLoading(true)
    try {
      const result = await banUser(selectedUser.id, banReason)

      if (result.success) {
        // Update the local users state
        setUsers(
          users.map((user) => {
            if (user.id === selectedUser.id) {
              return {
                ...user,
                banned: !user.banned,
                publicMetadata: {
                  ...user.publicMetadata,
                  banReason: !user.banned ? banReason : undefined,
                },
              }
            }
            return user
          })
        )

        toast.success(selectedUser.banned ? "User unbanned successfully" : "User banned successfully")
        setShowBanDialog(false)
        setBanReason("")
      } else {
        toast.error(`Failed to manage user ban status: ${result.error}`)
      }
    } catch {
      toast.error("An error occurred while managing user ban status")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    return new Date(date).toLocaleDateString()
  }

  return (
    <>
      <section className="up-panel">
        <div className="up-table">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Email</th>
              <th>Username</th>
              <th>Joined</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <React.Fragment key={user.id}>
                <tr className={index < 40 ? "enter-fade" : undefined} style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
                  <td>
                    <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user.imageUrl} alt={user.username || ""} />
                      <AvatarFallback>
                        {user.firstName?.[0]}
                        {user.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span>{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.username}</td>
                  <td className="whitespace-nowrap">{formatDate(user.createdAt)}</td>
                  <td>
                    <Swap id={user.isAdmin ? "admin" : user.banned ? "banned" : "user"} motion="pop" asChild>
                      {user.isAdmin ? <span className="up-pill is-accent">Admin</span> : user.banned ? <span className="up-pill is-bad">Banned</span> : <span className="up-pill">Player</span>}
                    </Swap>
                  </td>
                  <td align="right">
                    {!user.isAdmin && (
                      <Button variant="plain" className={user.banned ? "up-btn is-xs" : "up-btn is-xs is-bad"} onClick={() => handleBanClick(user)} disabled={isLoading}>
                        <Swap id={user.banned ? "unban" : "ban"} as="span">
                          {user.banned ? "Unban User" : "Ban User"}
                        </Swap>
                      </Button>
                    )}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedUser?.banned ? "Unban User" : "Ban User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.banned ? (
                <>
                  Are you sure you want to unban {selectedUser?.firstName} {selectedUser?.lastName}?
                </>
              ) : (
                <>
                  Are you sure you want to ban {selectedUser?.firstName} {selectedUser?.lastName}? This action can be undone later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!selectedUser?.banned && (
            <div className="py-4">
              <Label htmlFor="reason">Reason for Ban (Optional)</Label>
              <Input id="reason" value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Why they are banned" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowBanDialog(false)
                setBanReason("")
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant={selectedUser?.banned ? "primary" : "destructive"} onClick={handleBanConfirm} disabled={isLoading}>
              {selectedUser?.banned ? "Unban User" : "Ban User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
