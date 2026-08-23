"use client"

import { useEffect, useState, useTransition } from "react"
import { KeyRound, Mail, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  const [dialog, setDialog] = useState<"create" | "edit" | "roles" | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [selected, setSelected] = useState<UserRecord | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ConfirmationAction; user: UserRecord } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(() => {
      void listUsers({ offset, search, isActive: active, deleted })
        .then(({ users: records, total: recordTotal }) => {
          setUsers(records)
          setTotal(recordTotal)
        })
        .catch((error: unknown) => setNotice(message(error)))
    })
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  // refresh deliberately depends on the query state, not its unstable function identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, search, active, deleted])

  useEffect(() => {
    if (!permissions.canAssignRoles || !permissions.canReadRoles) return
    void listRoles().then(setRoles).catch((error: unknown) => setNotice(message(error)))
  }, [permissions.canAssignRoles, permissions.canReadRoles])

  const mutate = (action: () => Promise<unknown>, success: string) => {
    startTransition(() => {
      void action().then(() => {
        setNotice(success)
        setConfirmation(null)
        refresh()
      }).catch((error: unknown) => setNotice(message(error)))
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
      setNotice("Select at least one role.")
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
      setNotice("Each row needs email, username, first name, and last name.")
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

  const updateFilters = (next: Partial<{ active: ActiveFilter; deleted: DeletedFilter }>) => {
    if (next.active) setActive(next.active)
    if (next.deleted) setDeleted(next.deleted)
    setOffset(0)
  }

  return <div className="flex flex-col gap-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-medium text-indigo-700">ACCESS DIRECTORY</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">User management</h1><p className="mt-1 text-sm text-muted-foreground">Manage access, roles, invitations, and active sessions.</p></div>
      {permissions.canInvite && <div className="flex gap-2"><Button variant="outline" onClick={() => setBulkDialogOpen(true)}>Bulk invite</Button><Button onClick={() => { setSelected(null); setDialog("create") }}><Plus data-icon="inline-start" />Invite user</Button></div>}
    </div>
    {notice && <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900" role="status"><span>{notice}</span><Button variant="ghost" size="xs" onClick={() => setNotice(null)}>Dismiss</Button></div>}
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search users" className="pl-8" placeholder="Search name, email, username" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} /></div>
        <div className="flex flex-wrap gap-2"><select aria-label="Account status" className="h-8 rounded-lg border bg-background px-2 text-sm" value={active} onChange={(event) => updateFilters({ active: event.target.value as ActiveFilter })}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select aria-label="Deleted records" className="h-8 rounded-lg border bg-background px-2 text-sm" value={deleted} onChange={(event) => updateFilters({ deleted: event.target.value as DeletedFilter })}><option value="active">Active records</option><option value="deleted">Deleted records</option><option value="all">All records</option></select></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">
        {users.map((user) => <tr key={user.user_id} className={cn("hover:bg-muted/30", user.is_deleted && "bg-muted/30 text-muted-foreground")}><td className="px-4 py-3"><div className="font-medium">{fullName(user)}</div><div className="text-xs text-muted-foreground">{user.email} · {user.username}</div></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{user.roles.length ? user.roles.map((role) => <span className="rounded bg-muted px-1.5 py-0.5 text-xs" key={role}>{role}</span>) : "No roles"}</div></td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{invitationStatus(user)}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}</td><td className="px-4 py-3"><div className="flex justify-end gap-1">
          {!user.is_deleted && permissions.canUpdate && <Button aria-label={`Edit ${fullName(user)}`} variant="ghost" size="icon-xs" onClick={() => { setSelected(user); setDialog("edit") }}><Pencil /></Button>}
          {!user.is_deleted && permissions.canAssignRoles && permissions.canReadRoles && <Button aria-label={`Assign roles to ${fullName(user)}`} variant="ghost" size="icon-xs" onClick={() => { setSelected(user); setDialog("roles") }}><ShieldCheck /></Button>}
          {!user.is_deleted && user.invited_at && !user.onboarding_completed_at && permissions.canInvite && <Button aria-label={`Resend setup email to ${fullName(user)}`} variant="ghost" size="icon-xs" onClick={() => setConfirmation({ action: "resend", user })}><Mail /></Button>}
          {!user.is_deleted && permissions.canRevokeSessions && <Button aria-label={`Revoke ${fullName(user)} sessions`} variant="ghost" size="icon-xs" onClick={() => setConfirmation({ action: "revoke", user })}><KeyRound /></Button>}
          {!user.is_deleted && permissions.canDelete && <Button aria-label={`Delete ${fullName(user)}`} variant="ghost" size="icon-xs" className="text-destructive" onClick={() => setConfirmation({ action: "delete", user })}><Trash2 /></Button>}
          {user.is_deleted && permissions.canRestore && <Button variant="outline" size="xs" onClick={() => setConfirmation({ action: "restore", user })}><RotateCcw data-icon="inline-start" />Restore</Button>}
        </div></td></tr>)}
        {!isPending && users.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No users match these filters.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground"><span>{total} users</span><div className="flex gap-2"><Button variant="outline" size="xs" disabled={offset === 0 || isPending} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</Button><Button variant="outline" size="xs" disabled={users.length < 20 || isPending} onClick={() => setOffset((value) => value + 20)}>Next</Button></div></div>
    </section>
    <UserDialog mode={dialog === "create" ? "create" : dialog === "edit" ? "edit" : null} user={selected} canChangeStatus={permissions.canChangeStatus} onClose={() => setDialog(null)} onSave={saveUser} />
    <BulkInviteDialog open={bulkDialogOpen} onClose={() => setBulkDialogOpen(false)} onSave={saveBatch} />
    <RoleDialog user={dialog === "roles" ? selected : null} roles={roles} onClose={() => setDialog(null)} onSave={saveRoles} />
    <ConfirmationDialog confirmation={confirmation} pending={isPending} onClose={() => setConfirmation(null)} onConfirm={runConfirmation} />
  </div>
}

function BulkInviteDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (data: FormData) => void }) {
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent><DialogHeader><DialogTitle>Bulk invite users</DialogTitle><DialogDescription>Paste one CSV row per user: email, username, first name, last name, middle name, contact.</DialogDescription></DialogHeader><form action={onSave} className="grid gap-3"><textarea name="csv" required rows={8} className="w-full rounded-lg border bg-background p-2 font-mono text-xs" placeholder="jane@example.com, janedoe, Jane, Doe" /><DialogFooter><DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose><Button type="submit">Create and invite users</Button></DialogFooter></form></DialogContent></Dialog>
}

function UserDialog({ mode, user, canChangeStatus, onClose, onSave }: { mode: "create" | "edit" | null; user: UserRecord | null; canChangeStatus: boolean; onClose: () => void; onSave: (data: FormData) => void }) {
  const creating = mode === "create"
  return <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{creating ? "Invite user" : "Edit user"}</DialogTitle><DialogDescription>{creating ? "A setup email will be sent after the account is created." : "Email addresses are managed by Supabase and cannot be changed here."}</DialogDescription></DialogHeader><form action={onSave} className="grid gap-3"><label className="grid gap-1 text-sm">Email<Input name="email" type="email" required disabled={!creating} defaultValue={user?.email ?? ""} /></label><label className="grid gap-1 text-sm">Username<Input name="username" required defaultValue={user?.username ?? ""} /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">First name<Input name="first_name" required defaultValue={user?.first_name ?? ""} /></label><label className="grid gap-1 text-sm">Last name<Input name="last_name" required defaultValue={user?.last_name ?? ""} /></label></div><label className="grid gap-1 text-sm">Middle name<Input name="middle_name" defaultValue={user?.middle_name ?? ""} /></label><label className="grid gap-1 text-sm">Contact<Input name="contact" defaultValue={user?.contact ?? ""} /></label>{canChangeStatus && <label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={user?.is_active ?? true} />Active account</label>}<DialogFooter><DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose><Button type="submit"><UserRoundPlus data-icon="inline-start" />{creating ? "Create and invite" : "Save changes"}</Button></DialogFooter></form></DialogContent></Dialog>
}

function RoleDialog({ user, roles, onClose, onSave }: { user: UserRecord | null; roles: UserRole[]; onClose: () => void; onSave: (data: FormData) => void }) {
  return <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Assign roles</DialogTitle><DialogDescription>Replace roles for {user && fullName(user)}.</DialogDescription></DialogHeader><form action={onSave} className="grid gap-2">{roles.filter((role) => role.is_active).map((role) => <label className="flex gap-2 rounded border p-2 text-sm" key={role.id}><input name={`role-${role.id}`} type="checkbox" defaultChecked={user?.roles.includes(role.name)} /> <span><span className="font-medium">{role.name}</span><span className="block text-xs text-muted-foreground">{role.description}</span></span></label>)}<DialogFooter><DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose><Button type="submit">Save roles</Button></DialogFooter></form></DialogContent></Dialog>
}

function ConfirmationDialog({ confirmation, pending, onClose, onConfirm }: { confirmation: { action: ConfirmationAction; user: UserRecord } | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const labels: Record<ConfirmationAction, string> = { delete: "Delete user", restore: "Restore user", resend: "Resend setup email", revoke: "Revoke sessions" }
  return <Dialog open={confirmation !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{confirmation && labels[confirmation.action]}</DialogTitle><DialogDescription>{confirmation && `${labels[confirmation.action]} for ${fullName(confirmation.user)}?`}</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button variant={confirmation?.action === "delete" ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>{confirmation && labels[confirmation.action]}</Button></DialogFooter></DialogContent></Dialog>
}
