"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { Pencil, Plus, Search, ShieldCheck, UsersRound } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/api"
import { createRole, listPermissions, listRoles, updateRole, type Permission, type Role, type RoleInput, type RoleUpdateInput } from "@/lib/rbac"
import { cn } from "@/lib/utils"

interface AdminRoleManagementProps {
  canManage: boolean
  canManageUsers: boolean
}

interface PendingUpdate {
  role: Role
  input: RoleUpdateInput
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Unable to complete that action."
}

function permissionGroups(permissions: Permission[]) {
  return Object.entries(
    Object.groupBy(permissions, (permission) => permission.code.split(".")[0] ?? "other"),
  ).sort(([left], [right]) => left.localeCompare(right))
}

function isProtectedAdmin(role: Role) {
  return role.is_system && role.name === "admin"
}

export function AdminRoleManagement({ canManage, canManageUsers }: AdminRoleManagementProps) {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(() => {
      void Promise.all([listRoles(), listPermissions()])
        .then(([nextRoles, nextPermissions]) => {
          setRoles(nextRoles)
          setPermissions(nextPermissions)
        })
        .catch((error: unknown) => setNotice(errorMessage(error)))
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const saveNewRole = (input: RoleInput) => {
    startTransition(() => {
      void createRole(input)
        .then(() => {
          setEditingRole(undefined)
          setNotice("Role created.")
          refresh()
        })
        .catch((error: unknown) => setNotice(errorMessage(error)))
    })
  }

  const saveUpdate = (role: Role, input: RoleUpdateInput) => {
    startTransition(() => {
      void updateRole(role.id, input)
        .then(() => {
          setEditingRole(undefined)
          setPendingUpdate(null)
          setNotice("Role updated.")
          refresh()
        })
        .catch((error: unknown) => setNotice(errorMessage(error)))
    })
  }

  const requestUpdate = (role: Role, input: RoleUpdateInput) => {
    if (input.is_active === false || input.permission_ids !== undefined) {
      setPendingUpdate({ role, input })
      return
    }
    saveUpdate(role, input)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-indigo-700">ACCESS CONTROL</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Roles & permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure role-based access without exposing individual bearer tokens.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageUsers && (
            <Link className={buttonVariants({ variant: "outline" })} href="/admin/users">
              <UsersRound data-icon="inline-start" />Manage user assignments
            </Link>
          )}
          {canManage && (
            <Button onClick={() => setEditingRole(null)}>
              <Plus data-icon="inline-start" />Create role
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900" role="status">
          <span>{notice}</span>
          <Button variant="ghost" size="xs" onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 p-3">
          <div>
            <h2 className="text-sm font-semibold">Configured roles</h2>
            <p className="text-xs text-muted-foreground">{roles.length} roles in the access catalog</p>
          </div>
          {isPending && <span className="text-xs text-muted-foreground">Refreshing...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
              <tr><th className="px-4 py-3">Role</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {roles.map((role) => (
                <tr key={role.id} className={cn("hover:bg-muted/30", !role.is_active && "bg-muted/20 text-muted-foreground")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2"><span className="font-medium">{role.name}</span>{role.is_system && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">System</span>}</div>
                    <p className="mt-0.5 max-w-lg text-xs text-muted-foreground">{role.description ?? "No description provided."}</p>
                  </td>
                  <td className="px-4 py-3"><span className="font-medium">{role.permissions.length}</span> <span className="text-xs text-muted-foreground">permissions</span></td>
                  <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{role.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3 text-right">{canManage && <Button aria-label={`Edit ${role.name} role`} variant="ghost" size="icon-xs" onClick={() => setEditingRole(role)}><Pencil /></Button>}</td>
                </tr>
              ))}
              {!isPending && roles.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No roles are available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 text-indigo-700" /><div><h2 className="text-sm font-semibold">Permission catalog</h2><p className="mt-1 text-sm text-muted-foreground">Permissions are declared by the system and can be assigned to configurable roles. System Admin permissions are protected.</p></div></div>
      </section>

      {editingRole !== undefined && <RoleDialog key={editingRole?.id ?? "new"} role={editingRole} permissions={permissions} pending={isPending} onClose={() => setEditingRole(undefined)} onCreate={saveNewRole} onUpdate={requestUpdate} />}
      <UpdateConfirmation pendingUpdate={pendingUpdate} pending={isPending} onClose={() => setPendingUpdate(null)} onConfirm={() => pendingUpdate && saveUpdate(pendingUpdate.role, pendingUpdate.input)} />
    </div>
  )
}

function RoleDialog({ role, permissions, pending, onClose, onCreate, onUpdate }: { role: Role | null; permissions: Permission[]; pending: boolean; onClose: () => void; onCreate: (input: RoleInput) => void; onUpdate: (role: Role, input: RoleUpdateInput) => void }) {
  const [search, setSearch] = useState("")
  const selectedIds = new Set(role?.permissions.map((permission) => permission.id) ?? [])
  const protectedAdmin = role !== null && isProtectedAdmin(role)
  const filteredPermissions = permissions.filter((permission) => `${permission.code} ${permission.description}`.toLowerCase().includes(search.toLowerCase()))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const permissionIds = permissions.filter((permission) => formData.get(`permission-${permission.id}`) === "on").map((permission) => permission.id)
    const description = String(formData.get("description") ?? "").trim() || null
    if (role === null) {
      onCreate({ name: String(formData.get("name") ?? "").trim(), description, permission_ids: permissionIds })
      return
    }
    const input: RoleUpdateInput = {}
    if (description !== role.description) input.description = description
    if (!role.is_system) {
      const isActive = formData.get("is_active") === "on"
      if (isActive !== role.is_active) input.is_active = isActive
    }
    if (!protectedAdmin && (permissionIds.length !== selectedIds.size || permissionIds.some((id) => !selectedIds.has(id)))) input.permission_ids = permissionIds
    if (Object.keys(input).length === 0) {
      onClose()
      return
    }
    onUpdate(role, input)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{role ? `Edit ${role.name}` : "Create role"}</DialogTitle><DialogDescription>{protectedAdmin ? "The system Admin permission set is protected. You may review it but cannot replace it." : "Choose the permissions this role grants. Changes apply to users with this role on their next request."}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {role === null ? <label className="grid gap-1 text-sm">Role name<Input name="name" required pattern="^[a-z][a-z0-9_-]*$" maxLength={100} placeholder="reporting-manager" /><span className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens, and underscores only.</span></label> : <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span className="font-medium">{role.name}</span>{role.is_system && <span className="ml-2 text-xs text-muted-foreground">System role</span>}</div>}
          <label className="grid gap-1 text-sm">Description<Input name="description" maxLength={255} defaultValue={role?.description ?? ""} placeholder="Describe this role's responsibilities" /></label>
          {role !== null && !role.is_system && <label className="flex items-center gap-2 text-sm"><input name="is_active" type="checkbox" defaultChecked={role.is_active} />Active role</label>}
          <div className="grid gap-2"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><label className="text-sm font-medium">Permissions</label><div className="relative sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search permissions" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions" /></div></div><div className="max-h-80 overflow-y-auto rounded-lg border p-2">{permissionGroups(filteredPermissions).map(([group, entries]) => <div className="mb-3 last:mb-0" key={group}><p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p><div className="grid gap-1">{entries?.map((permission) => <label className={cn("flex gap-2 rounded-md border p-2 text-sm", protectedAdmin && "bg-muted/30 text-muted-foreground")} key={permission.id}><input name={`permission-${permission.id}`} type="checkbox" defaultChecked={selectedIds.has(permission.id)} disabled={protectedAdmin} /><span><span className="font-medium">{permission.code}</span><span className="block text-xs text-muted-foreground">{permission.description}</span></span></label>)}</div></div>)}{filteredPermissions.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">No permissions match your search.</p>}</div></div>
          <DialogFooter><DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose><Button disabled={pending} type="submit">{role ? "Save role" : "Create role"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UpdateConfirmation({ pendingUpdate, pending, onClose, onConfirm }: { pendingUpdate: PendingUpdate | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const deactivating = pendingUpdate?.input.is_active === false
  return <Dialog open={pendingUpdate !== null} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{deactivating ? "Deactivate role" : "Replace role permissions"}</DialogTitle><DialogDescription>{deactivating ? `Deactivate ${pendingUpdate?.role.name}? Users assigned only this role will lose its access immediately.` : `Replace permissions for ${pendingUpdate?.role.name}? This changes access for every assigned user.`}</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button disabled={pending} onClick={onConfirm}>{deactivating ? "Deactivate role" : "Replace permissions"}</Button></DialogFooter></DialogContent></Dialog>
}
