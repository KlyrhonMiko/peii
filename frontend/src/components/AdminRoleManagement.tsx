"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { Check, Pencil, Plus, Search, ShieldCheck, UsersRound } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
  const [isPending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(() => {
      void Promise.all([listRoles(), listPermissions()])
        .then(([nextRoles, nextPermissions]) => {
          setRoles(nextRoles)
          setPermissions(nextPermissions)
        })
        .catch((error: unknown) => toast.error(errorMessage(error)))
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
          toast.success("Role created.")
          refresh()
        })
        .catch((error: unknown) => toast.error(errorMessage(error)))
    })
  }

  const saveUpdate = (role: Role, input: RoleUpdateInput) => {
    startTransition(() => {
      void updateRole(role.id, input)
        .then(() => {
          setEditingRole(undefined)
          setPendingUpdate(null)
          toast.success("Role updated.")
          refresh()
        })
        .catch((error: unknown) => toast.error(errorMessage(error)))
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
    <div className="space-y-8 p-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Roles & permissions
          </h2>
          <p className="text-[14px] text-zinc-500 max-w-xl">
            Configure role-based access without exposing individual bearer tokens.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {canManageUsers && (
            <Link className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2 border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-all rounded-lg")} href="/admin/users">
              <UsersRound className="size-4 text-zinc-400" />
              Manage users
            </Link>
          )}
          {canManage && (
            <Button onClick={() => setEditingRole(null)} className="h-9 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all active:scale-[0.98] rounded-lg">
              <Plus className="size-4" />
              Create role
            </Button>
          )}
        </div>
      </div>

      <div className="-mx-2 overflow-x-auto">
        <table className="w-full text-left text-[13px] table-fixed min-w-[720px]">
          <thead>
            <tr className="border-y border-zinc-200/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <th className="px-2 py-4 w-[40%]">Role</th>
              <th className="px-2 py-4 w-[25%]">Access</th>
              <th className="px-2 py-4 w-[20%]">Status</th>
              <th className="px-2 py-4 w-[15%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100/80">
            {roles.map((role) => (
              <tr key={role.id} className={cn("group hover:bg-zinc-50/50 transition-colors", !role.is_active && "bg-zinc-50/70 opacity-80")}>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px] text-zinc-900">{role.name}</span>
                    {role.is_system && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 border border-zinc-200/60">System</span>
                    )}
                  </div>
                  <p className="mt-0.5 max-w-lg text-xs text-zinc-500">{role.description ?? "No description provided."}</p>
                </td>
                <td className="px-2 py-4">
                  <span className="font-medium text-zinc-700">{role.permissions.length}</span> <span className="text-zinc-500">permissions</span>
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "size-1.5 rounded-full",
                      role.is_active ? "bg-emerald-500" : "bg-zinc-400"
                    )} />
                    <span className="text-zinc-700 font-medium">{role.is_active ? "Active" : "Inactive"}</span>
                  </div>
                </td>
                <td className="px-2 py-4 text-right">
                  <div className="flex items-center justify-end gap-1 text-zinc-400">
                    {canManage && (
                      <Button aria-label={`Edit ${role.name} role`} variant="ghost" size="icon" onClick={() => setEditingRole(role)}>
                        <Pencil />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isPending && roles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-12 text-center">
                  <div className="mx-auto flex max-w-[280px] flex-col items-center justify-center space-y-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-zinc-50 border border-zinc-100">
                      <ShieldCheck className="size-5 text-zinc-400" />
                    </div>
                    <p className="text-[14px] font-medium text-zinc-900">No roles found</p>
                    <p className="text-[13px] text-zinc-500">Create a new role to manage access.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>



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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "Create role"}</DialogTitle>
          <DialogDescription>{protectedAdmin ? "The system Admin permission set is protected. You may review it but cannot replace it." : "Choose the permissions this role grants. Changes apply to users with this role on their next request."}</DialogDescription>
        </DialogHeader>
        <form className="mt-4" onSubmit={submit}>
          <div className="border-y border-zinc-200/80 divide-y divide-zinc-200/80 -mx-6">
            {role === null ? (
              <div className="flex items-start px-6 py-3 group focus-within:bg-zinc-50/50 transition-colors">
                <div className="w-1/3 pt-1.5">
                   <label htmlFor="name" className="text-[13px] font-medium text-zinc-600 block">Role name</label>
                   <span className="text-[11px] text-zinc-400 block mt-0.5 leading-snug pr-4">Lowercase letters, numbers, hyphens, and underscores.</span>
                </div>
                <Input id="name" name="name" required pattern="^[a-z][a-z0-9_-]*$" maxLength={100} placeholder="reporting-manager" className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-9 text-[13px] font-medium text-zinc-900 mt-0.5" />
              </div>
            ) : (
              <div className="flex items-center px-6 py-3 bg-zinc-50/30">
                <span className="w-1/3 text-[13px] font-medium text-zinc-600">Role name</span>
                <div className="w-2/3 flex items-center gap-2">
                  <span className="font-semibold text-[13px] text-zinc-900">{role.name}</span>
                  {role.is_system && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 border border-zinc-200/60">System role</span>}
                </div>
              </div>
            )}
            
            <div className="flex items-start px-6 py-3 group focus-within:bg-zinc-50/50 transition-colors">
              <label htmlFor="description" className="w-1/3 text-[13px] font-medium text-zinc-600 pt-1.5">Description</label>
              <Input id="description" name="description" maxLength={255} defaultValue={role?.description ?? ""} placeholder="Describe this role's responsibilities" className="w-2/3 border-0 focus-visible:ring-0 shadow-none bg-transparent rounded-none px-0 h-9 text-[13px] font-medium text-zinc-900 mt-0.5 placeholder:text-zinc-400" />
            </div>

            {role !== null && !role.is_system && (
              <div className="px-6 py-4 bg-zinc-50/30 group/status">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-zinc-900 group-hover/status:text-zinc-950 transition-colors">Active role</span>
                    <span className="text-xs text-zinc-500 leading-snug">Allow users to use this role. Disabling instantly removes this access.</span>
                  </div>
                  <Switch name="is_active" defaultChecked={role.is_active} className="mt-0.5 shadow-sm" />
                </label>
              </div>
            )}
            
            <div className="px-6 py-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-zinc-900">Permissions</label>
                  <div className="relative w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
                    <Input aria-label="Search permissions" className="pl-8 h-8 text-[12px] bg-zinc-50/50 border-zinc-200/80 focus-visible:ring-zinc-200 shadow-none transition-all" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions" />
                  </div>
                </div>
                
                <div className="max-h-[320px] overflow-y-auto rounded-xl border border-zinc-200/80 p-1.5 bg-zinc-50/30">
                  {permissionGroups(filteredPermissions).map(([group, entries]) => (
                    <div className="mb-4 last:mb-1" key={group}>
                      <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 sticky top-0 bg-zinc-50/95 backdrop-blur z-10">{group}</p>
                      <div className="grid gap-0.5">
                        {entries?.map((permission) => (
                          <label className={cn(
                            "flex gap-3 px-2.5 py-2 text-sm cursor-pointer hover:bg-zinc-100/50 transition-colors items-start group relative rounded-lg",
                            protectedAdmin && "opacity-70 grayscale"
                          )} key={permission.id}>
                            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                               <input name={`permission-${permission.id}`} type="checkbox" defaultChecked={selectedIds.has(permission.id)} disabled={protectedAdmin} className="peer appearance-none size-4 rounded-[4px] border border-zinc-300 bg-white checked:bg-zinc-900 checked:border-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-1 transition-all cursor-pointer disabled:cursor-default" />
                               <Check className="absolute size-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                            </div>
                            <span className="flex flex-col gap-0.5">
                              <span className="font-semibold text-zinc-900 text-[13px] group-hover:text-zinc-950 transition-colors">{permission.code}</span>
                              <span className="block text-[12px] text-zinc-500 leading-snug">{permission.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {filteredPermissions.length === 0 && <p className="p-4 text-center text-[13px] text-zinc-500">No permissions match your search.</p>}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" className="shadow-none active:scale-[0.98] transition-transform">Cancel</Button>} />
            <Button disabled={pending} type="submit" className="active:scale-[0.98] transition-transform">{role ? "Save changes" : "Create role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UpdateConfirmation({ pendingUpdate, pending, onClose, onConfirm }: { pendingUpdate: PendingUpdate | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const deactivating = pendingUpdate?.input.is_active === false
  
  if (!pendingUpdate) return null
  
  return (
    <Dialog open={true} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6" showCloseButton={true}>
        <div className="flex flex-col items-center gap-4 text-center pb-2">
          <div className="flex size-12 items-center justify-center rounded-full ring-[6px] mb-1 bg-zinc-100 ring-zinc-50 text-zinc-600">
            <ShieldCheck className="size-5" />
          </div>
          <DialogHeader className="flex flex-col items-center">
            <DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight">{deactivating ? "Deactivate role" : "Replace role permissions"}</DialogTitle>
            <DialogDescription className="text-[15px] text-slate-500 mt-2 leading-relaxed max-w-[95%] text-center">
              {deactivating ? `Deactivate ${pendingUpdate.role.name}? Users assigned only this role will lose its access immediately.` : `Replace permissions for ${pendingUpdate.role.name}? This changes access for every assigned user.`}
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 sm:space-x-0 w-full mt-4">
          <Button variant="outline" disabled={pending} onClick={onClose} className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out">Cancel</Button>
          <Button disabled={pending} onClick={onConfirm} className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out flex items-center justify-center">{deactivating ? "Deactivate role" : "Replace permissions"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
