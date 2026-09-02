"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, ChevronDown, KeyRound, Loader2, Mail, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserRoundPlus, User, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { assignUserRoles, createUser, createUsers, deleteUser, listRoles, listUsers, resendInvitation, restoreUser, revokeUserSessions, updateUser, type UserInput, type UserRecord, type UserRole } from "@/lib/users"
import { cn } from "@/lib/utils"

export interface AdminUserPermissions {
  canInvite: boolean
  canUpdate: boolean
  canChangeStatus: boolean
  canAssignRoles: boolean
  canReadRoles: boolean
  canRevokeSessions: boolean
  canDelete: boolean
  canRestore: boolean
}

interface AdminUserManagementProps {
  permissions: AdminUserPermissions
}

type ActiveFilter = "all" | "active" | "inactive"
type DeletedFilter = "active" | "deleted" | "all"
type ConfirmationAction = "delete" | "restore" | "resend" | "revoke"

function fullName(user: UserRecord) {
  return [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(" ")
}

function getInitials(user: UserRecord) {
  const first = user.first_name?.[0] || ""
  const last = user.last_name?.[0] || ""
  if (first && last) return (first + last).toUpperCase()
  if (first) return first.toUpperCase()
  return user.username.slice(0, 2).toUpperCase()
}

export function invitationStatus(user: UserRecord) {
  if (user.is_deleted) return "Deleted"
  if (!user.is_active) return "Disabled"
  if (user.invited_at && !user.onboarding_completed_at) return "Setup pending"
  return "Active"
}

function message(error: unknown) {
  return error instanceof ApiError ? error.message : "Unable to complete that action."
}

export function AdminUserManagement({ permissions }: AdminUserManagementProps) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<UserRole[]>([])
  const [search, setSearch] = useState("")
  const [active, setActive] = useState<ActiveFilter>("all")
  const [deleted, setDeleted] = useState<DeletedFilter>("active")
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  
  const [activeFilterOpen, setActiveFilterOpen] = useState(false)
  const [deletedFilterOpen, setDeletedFilterOpen] = useState(false)

  const [dialog, setDialog] = useState<"create" | "edit" | "roles" | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [selected, setSelected] = useState<UserRecord | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ConfirmationAction; user: UserRecord } | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const [isPending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(() => {
      void listUsers({ offset, search, isActive: active, deleted })
        .then(({ users: records, total: recordTotal }) => {
          setUsers(records)
          setTotal(recordTotal)
        })
        .catch((error: unknown) => toast.error(message(error)))
        .finally(() => setInitialLoad(false))
    })
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, search, active, deleted])

  useEffect(() => {
    if (!permissions.canAssignRoles || !permissions.canReadRoles) return
    void listRoles().then(setRoles).catch((error: unknown) => toast.error(message(error)))
  }, [permissions.canAssignRoles, permissions.canReadRoles])

  const mutate = (action: () => Promise<unknown>, success: string) => {
    startTransition(() => {
      void action().then(() => {
        toast.success(success)
        setConfirmation(null)
        refresh()
      }).catch((error: unknown) => toast.error(message(error)))
    })
  }

  const saveUser = (formData: FormData) => {
    const includesStatus = formData.has("is_active")
    const input = {
      email: String(formData.get("email") ?? "").trim(),
      username: String(formData.get("username") ?? "").trim(),
      first_name: String(formData.get("first_name") ?? "").trim(),
      last_name: String(formData.get("last_name") ?? "").trim(),
      middle_name: String(formData.get("middle_name") ?? "").trim() || null,
      contact: String(formData.get("contact") ?? "").trim() || null,
      is_active: includesStatus ? formData.get("is_active") === "on" : true,
    }
    if (selected) {
      const { email: _email, is_active, ...profile } = input
      const updates = includesStatus ? { ...profile, is_active } : profile
      mutate(() => updateUser(selected.user_id, updates), "User updated.")
    } else {
      mutate(() => createUser(input), "User created and invitation requested.")
    }
    setDialog(null)
  }

  const saveRoles = (formData: FormData) => {
    if (!selected) return
    const roleIds = roles.filter((role) => formData.get(`role-${role.id}`) === "on").map((role) => role.id)
    if (roleIds.length === 0) {
      toast.error("Select at least one role.")
      return
    }
    mutate(() => assignUserRoles(selected.user_id, roleIds), "Roles updated.")
    setDialog(null)
  }

  const saveBatch = (formData: FormData) => {
    const rows = String(formData.get("csv") ?? "").trim().split("\n").filter(Boolean)
    const usersToCreate: UserInput[] = rows.map((row) => {
      const [email = "", username = "", firstName = "", lastName = "", middleName = "", contact = ""] = row.split(",").map((value) => value.trim())
      return { email, username, first_name: firstName, last_name: lastName, middle_name: middleName || null, contact: contact || null, is_active: true }
    })
    if (!usersToCreate.length || usersToCreate.some((user) => !user.email || !user.username || !user.first_name || !user.last_name)) {
      toast.error("Each row needs email, username, first name, and last name.")
      return
    }
    mutate(() => createUsers(usersToCreate), `${usersToCreate.length} users created and invitations requested.`)
    setBulkDialogOpen(false)
  }

  const runConfirmation = () => {
    if (!confirmation) return
    const { action, user } = confirmation
    if (action === "delete") mutate(() => deleteUser(user.user_id), "User deleted.")
    if (action === "restore") mutate(() => restoreUser(user.user_id), "User restored.")
    if (action === "resend") mutate(() => resendInvitation(user.user_id), "Setup email requested.")
    if (action === "revoke") mutate(() => revokeUserSessions(user.user_id), "User sessions revoked.")
  }

  return (
    <div className="space-y-8 p-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            User Management
          </h2>
          <p className="text-[14px] text-zinc-500 max-w-xl">
            Manage access, roles, invitations, and active sessions for all system users.
          </p>
        </div>
        {permissions.canInvite && (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(true)}
              className="h-9 gap-2 border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-all rounded-lg"
            >
              <Users className="size-4 text-zinc-400" />
              Bulk invite
            </Button>
            <Button
              onClick={() => { setSelected(null); setDialog("create") }}
              className="h-9 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all active:scale-[0.98] rounded-lg"
            >
              <Plus className="size-4" />
              Invite user
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center flex-wrap">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            aria-label="Search users"
            className="pl-8 sm:max-w-xs h-9 bg-transparent border-zinc-200/60 focus-visible:ring-zinc-200 shadow-none transition-all text-[13px]"
            placeholder="Search name, email, username"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setOffset(0) }}
          />
        </div>

        {/* Active Filter */}
        <Popover open={activeFilterOpen} onOpenChange={setActiveFilterOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-lg border border-zinc-200/60 bg-transparent px-3 text-[13px] font-medium text-zinc-600 shadow-none focus:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-[130px]"
              >
                <span>
                  {active === "all" ? "All statuses" : active === "active" ? "Active" : "Inactive"}
                </span>
                <ChevronDown className="size-4 text-zinc-400 shrink-0 opacity-60" />
              </Button>
            }
          />
          <PopoverContent align="start" style={{ width: "var(--anchor-width)" }} className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 min-w-[140px]">
            {[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setActive(option.value as ActiveFilter); setOffset(0); setActiveFilterOpen(false) }}
                className={cn(
                  "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                  active === option.value ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <span>{option.label}</span>
                {active === option.value && <Check className="size-3.5 text-zinc-900" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Deleted Filter */}
        <Popover open={deletedFilterOpen} onOpenChange={setDeletedFilterOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                type="button"
                className="h-9 rounded-lg border border-zinc-200/60 bg-transparent px-3 text-[13px] font-medium text-zinc-600 shadow-none focus:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-[140px]"
              >
                <span>
                  {deleted === "active" ? "Active records" : deleted === "deleted" ? "Deleted records" : "All records"}
                </span>
                <ChevronDown className="size-4 text-zinc-400 shrink-0 opacity-60" />
              </Button>
            }
          />
          <PopoverContent align="start" style={{ width: "var(--anchor-width)" }} className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 min-w-[150px]">
            {[
              { value: "active", label: "Active records" },
              { value: "deleted", label: "Deleted records" },
              { value: "all", label: "All records" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setDeleted(option.value as DeletedFilter); setOffset(0); setDeletedFilterOpen(false) }}
                className={cn(
                  "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                  deleted === option.value ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <span>{option.label}</span>
                {deleted === option.value && <Check className="size-3.5 text-zinc-900" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <p className="text-[13px] font-medium text-zinc-500 border-l border-zinc-200/60 pl-4 sm:ml-auto">
          {total} user{total === 1 ? "" : "s"}
        </p>
      </div>

      <div className="-mx-2 overflow-x-auto">
        <table className="w-full text-left text-[13px] table-fixed min-w-[860px]">
          <thead>
            <tr className="border-y border-zinc-200/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <th className="px-2 py-4 w-[35%]">User</th>
              <th className="px-2 py-4 w-[20%]">Roles</th>
              <th className="px-2 py-4 w-[15%]">Status</th>
              <th className="px-2 py-4 w-[20%]">Last login</th>
              <th className="px-2 py-4 w-[10%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100/80">
            {isPending || initialLoad ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="size-9 rounded-xl border border-zinc-200/60 bg-transparent flex items-center justify-center shrink-0">
                        <User className="size-4 text-zinc-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Skeleton className={cn("h-4", ["w-48", "w-32", "w-56", "w-40", "w-64"][i % 5])} />
                        <Skeleton className={cn("h-3", ["w-32", "w-48", "w-40", "w-56", "w-36"][i % 5])} />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Skeleton className="h-[22px] w-16 rounded-md" />
                      {i % 2 === 0 && <Skeleton className="h-[22px] w-20 rounded-md" />}
                    </div>
                  </td>
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-zinc-200" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </td>
                  <td className="px-2 py-4">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-2 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 text-zinc-200">
                      <div className="inline-flex h-9 w-9 items-center justify-center">
                        <Pencil className="size-4.5 opacity-30" />
                      </div>
                      <div className="inline-flex h-9 w-9 items-center justify-center">
                        <ShieldCheck className="size-4.5 opacity-30" />
                      </div>
                      <div className="inline-flex h-9 w-9 items-center justify-center">
                        <Trash2 className="size-4.5 opacity-30" />
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-12 text-center">
                  <div className="mx-auto flex max-w-[280px] flex-col items-center justify-center space-y-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-zinc-50 border border-zinc-100">
                      <User className="size-5 text-zinc-400" />
                    </div>
                    <p className="text-[14px] font-medium text-zinc-900">No users found</p>
                    <p className="text-[13px] text-zinc-500">
                      Adjust your filters or invite a new user to get started.
                    </p>
                  </div>
                </td>
              </tr>
            ) : users.map((user) => {
              const status = invitationStatus(user)
              return (
                <tr key={user.user_id} className={cn("group hover:bg-zinc-50/50 transition-colors", user.is_deleted && "bg-zinc-50/70 opacity-80")}>
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="size-9 rounded-xl border border-zinc-200/60 bg-zinc-50 flex items-center justify-center shrink-0 shadow-none text-zinc-500 font-semibold text-xs transition-colors group-hover:border-zinc-300">
                        {getInitials(user)}
                      </div>
                      <div>
                        <div className="font-semibold text-[14px] text-zinc-900">{fullName(user)}</div>
                        <div className="text-xs text-zinc-500">{user.email} · {user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-[13px] text-zinc-600">
                    {user.roles.length ? (
                      user.roles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(", ")
                    ) : (
                      <span className="text-zinc-400">No roles</span>
                    )}
                  </td>
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "size-1.5 rounded-full",
                        status === "Active" ? "bg-emerald-500" :
                        status === "Setup pending" ? "bg-amber-500" :
                        "bg-zinc-400"
                      )} />
                      <span className="text-zinc-700 font-medium">{status}</span>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-[13px] text-zinc-500 font-medium">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}
                  </td>
                  <td className="px-2 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 text-zinc-400">
                      {!user.is_deleted && permissions.canUpdate && (
                        <Button variant="ghost" size="icon" aria-label={`Edit ${fullName(user)}`} onClick={() => { setSelected(user); setDialog("edit") }}>
                          <Pencil />
                        </Button>
                      )}
                      {!user.is_deleted && permissions.canAssignRoles && permissions.canReadRoles && (
                        <Button variant="ghost" size="icon" aria-label={`Assign roles to ${fullName(user)}`} onClick={() => { setSelected(user); setDialog("roles") }}>
                          <ShieldCheck />
                        </Button>
                      )}
                      {!user.is_deleted && user.invited_at && !user.onboarding_completed_at && permissions.canInvite && (
                        <Button variant="ghost" size="icon" aria-label={`Resend setup email to ${fullName(user)}`} onClick={() => setConfirmation({ action: "resend", user })}>
                          <Mail />
                        </Button>
                      )}
                      {!user.is_deleted && permissions.canRevokeSessions && (
                        <Button variant="ghost" size="icon" aria-label={`Revoke ${fullName(user)} sessions`} onClick={() => setConfirmation({ action: "revoke", user })}>
                          <KeyRound />
                        </Button>
                      )}
                      {!user.is_deleted && permissions.canDelete && (
                        <Button variant="ghost" size="icon" className="hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${fullName(user)}`} onClick={() => setConfirmation({ action: "delete", user })}>
                          <Trash2 />
                        </Button>
                      )}
                      {user.is_deleted && permissions.canRestore && (
                        <Button variant="ghost" size="sm" className="text-zinc-500 font-medium" onClick={() => setConfirmation({ action: "restore", user })}>
                          <RotateCcw data-icon="inline-start" />
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200/40">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || isPending}
            onClick={() => setOffset((value) => Math.max(0, value - 20))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={users.length < 20 || isPending}
            onClick={() => setOffset((value) => value + 20)}
          >
            Next
          </Button>
        </div>
      )}

      <UserDialog mode={dialog === "create" ? "create" : dialog === "edit" ? "edit" : null} user={selected} canChangeStatus={permissions.canChangeStatus} onClose={() => setDialog(null)} onSave={saveUser} />
      <BulkInviteDialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} onSave={saveBatch} />
      <RoleDialog user={dialog === "roles" ? selected : null} roles={roles} onClose={() => setDialog(null)} onSave={saveRoles} />
      <ConfirmationDialog confirmation={confirmation} pending={isPending} onClose={() => setConfirmation(null)} onConfirm={runConfirmation} />
    </div>
  )
}

function BulkInviteDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (data: FormData) => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Bulk invite users</DialogTitle>
          <DialogDescription>Paste one CSV row per user: email, username, first name, last name, middle name, contact.</DialogDescription>
        </DialogHeader>
        <form action={onSave} className="mt-4">
          <textarea name="csv" required rows={8} className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/30 p-3.5 font-mono text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900 hover:border-zinc-300 transition-all resize-none shadow-sm" placeholder="jane@example.com, janedoe, Jane, Doe" />
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" className="shadow-none active:scale-[0.98] transition-transform">Cancel</Button>} />
            <Button type="submit" className="active:scale-[0.98] transition-transform">Create and invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UserDialog({ mode, user, canChangeStatus, onClose, onSave }: { mode: "create" | "edit" | null; user: UserRecord | null; canChangeStatus: boolean; onClose: () => void; onSave: (data: FormData) => void }) {
  const creating = mode === "create"
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{creating ? "Invite user" : "Edit user"}</DialogTitle>
          <DialogDescription>{creating ? "A setup email will be sent after the account is created." : "Email addresses are managed by Supabase and cannot be changed here."}</DialogDescription>
        </DialogHeader>
        <form action={onSave} className="mt-4">
          <div className="border-y border-zinc-200/80 divide-y divide-zinc-200/80 -mx-6">
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="email" className="w-1/3 text-[13px] font-medium text-zinc-600">Email</label>
              <Input id="email" name="email" type="email" required disabled={!creating} defaultValue={user?.email ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900 disabled:bg-transparent disabled:opacity-100 disabled:text-zinc-500" />
            </div>
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="username" className="w-1/3 text-[13px] font-medium text-zinc-600">Username</label>
              <Input id="username" name="username" required defaultValue={user?.username ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900" />
            </div>
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="first_name" className="w-1/3 text-[13px] font-medium text-zinc-600">First name</label>
              <Input id="first_name" name="first_name" required defaultValue={user?.first_name ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900" />
            </div>
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="last_name" className="w-1/3 text-[13px] font-medium text-zinc-600">Last name</label>
              <Input id="last_name" name="last_name" required defaultValue={user?.last_name ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900" />
            </div>
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="middle_name" className="w-1/3 text-[13px] font-medium text-zinc-600">Middle name</label>
              <Input id="middle_name" name="middle_name" defaultValue={user?.middle_name ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900 placeholder:text-zinc-400" placeholder="Optional" />
            </div>
            <div className="flex items-center px-6 py-2 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="contact" className="w-1/3 text-[13px] font-medium text-zinc-600">Contact</label>
              <Input id="contact" name="contact" defaultValue={user?.contact ?? ""} className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-8 text-[13px] font-medium text-zinc-900 placeholder:text-zinc-400" placeholder="Optional" />
            </div>
            {canChangeStatus && (
              <div className="px-6 py-4 bg-zinc-50/30 group/status">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-zinc-900 group-hover/status:text-zinc-950 transition-colors">Active account</span>
                    <span className="text-xs text-zinc-500 leading-snug">Allow this user to sign in and access the system. Disabling will immediately revoke their sessions.</span>
                  </div>
                  <Switch name="is_active" defaultChecked={user?.is_active ?? true} className="mt-0.5 shadow-sm" />
                </label>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" className="shadow-none active:scale-[0.98] transition-transform">Cancel</Button>} />
            <Button type="submit" className="active:scale-[0.98] transition-transform">
              {creating && <UserRoundPlus data-icon="inline-start" />}
              {creating ? "Create and invite" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoleDialog({ user, roles, onClose, onSave }: { user: UserRecord | null; roles: UserRole[]; onClose: () => void; onSave: (data: FormData) => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign roles</DialogTitle>
          <DialogDescription>Replace roles for {user && fullName(user)}.</DialogDescription>
        </DialogHeader>
        <form action={onSave} className="mt-4">
          <div className="border-y border-zinc-200/80 divide-y divide-zinc-200/80 -mx-6">
            {roles.filter((role) => role.is_active).map((role) => (
              <label className="flex gap-3.5 px-6 py-4 text-sm cursor-pointer hover:bg-zinc-50/80 transition-all items-start group relative" key={role.id}>
                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                  <input name={`role-${role.id}`} type="checkbox" defaultChecked={user?.roles.includes(role.name)} className="peer appearance-none size-4 rounded-md border border-zinc-300 bg-white checked:bg-zinc-900 checked:border-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-1 transition-all cursor-pointer" />
                  <Check className="absolute size-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-zinc-900 text-[13px] group-hover:text-zinc-950 transition-colors">{role.name}</span>
                  <span className="text-[13px] text-zinc-500 leading-snug">{role.description}</span>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" className="shadow-none active:scale-[0.98] transition-transform">Cancel</Button>} />
            <Button type="submit" className="active:scale-[0.98] transition-transform">Save roles</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmationDialog({ confirmation, pending, onClose, onConfirm }: { confirmation: { action: ConfirmationAction; user: UserRecord } | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const labels: Record<ConfirmationAction, string> = { delete: "Delete user", restore: "Restore user", resend: "Resend setup email", revoke: "Revoke sessions" }
  
  if (!confirmation) return null
  
  const isDestructive = confirmation.action === "delete" || confirmation.action === "revoke"
  const Icon = confirmation.action === "delete" ? Trash2 : confirmation.action === "revoke" ? KeyRound : confirmation.action === "restore" ? RotateCcw : Mail
  
  return (
    <Dialog open={true} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6" showCloseButton={true}>
        <div className="flex flex-col items-center gap-4 text-center pb-2">
          <div className={cn(
            "flex size-12 items-center justify-center rounded-full ring-[6px] mb-1",
            isDestructive ? "bg-red-100 ring-red-50 text-red-600" : "bg-zinc-100 ring-zinc-50 text-zinc-600"
          )}>
            <Icon className="size-5" />
          </div>
          <DialogHeader className="flex flex-col items-center">
            <DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight">{labels[confirmation.action]}</DialogTitle>
            <DialogDescription className="text-[15px] text-slate-500 mt-2 leading-relaxed max-w-[95%] text-center">
              {confirmation.action === "delete" && `Are you sure you want to delete the user ${fullName(confirmation.user)}? They will lose all access.`}
              {confirmation.action === "restore" && `Are you sure you want to restore the user ${fullName(confirmation.user)}? They will regain access.`}
              {confirmation.action === "resend" && `Are you sure you want to resend the setup email to ${fullName(confirmation.user)}?`}
              {confirmation.action === "revoke" && `Are you sure you want to revoke all active sessions for ${fullName(confirmation.user)}? They will be signed out everywhere.`}
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 sm:space-x-0 w-full mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
          >
            Cancel
          </Button>
          <Button
            variant={isDestructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
            className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out flex items-center justify-center"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {labels[confirmation.action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

