import {
  type Permission,
  type PermissionResource,
  permissionResource,
} from "@matinee/contracts"
import { Checkbox } from "@matinee/ui/components/checkbox"
import { FieldLegend, FieldSet } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { Switch } from "@matinee/ui/components/switch"
import { useState } from "react"

import { tr } from "@/i18n"
import { withPermissions } from "@/lib/permissions"

/**
 * Permissions by resource, as their names spell it: `library.scan` is
 * `scan` under `library`. They show as the API names them, since a token
 * is written against that API and a group grants the same names, with a
 * line under each resource saying what it covers.
 */
function groupByResource(permissions: readonly Permission[]) {
  const groups = new Map<PermissionResource, Permission[]>()
  for (const permission of permissions) {
    if (permission === "all") continue
    const resource = permissionResource(permission)
    groups.set(resource, [...(groups.get(resource) ?? []), permission])
  }
  return [...groups].map(([resource, members]) => ({
    resource,
    permissions: members,
  }))
}

/**
 * Permissions to pick, by resource, with a box per resource that takes
 * all of its permissions. `value` may hold permissions that aren't
 * offered; they stay as they are.
 */
export function PermissionPicker({
  legend,
  offered,
  all,
  mayChange,
  value,
  error,
  onChange,
}: {
  legend: string
  /** The permissions to pick from. `all` among them is left out. */
  offered: readonly Permission[]
  /**
   * Offer `all` as a switch above the list, with what it says. On, it
   * stands alone and the list hides.
   */
  all?: { label: string; hint: string }
  /** False for a permission whose box is locked as it is. */
  mayChange?: (permission: Permission) => boolean
  value: readonly Permission[]
  error?: string | undefined
  onChange: (value: Permission[]) => void
}) {
  const [search, setSearch] = useState("")
  const everything = all !== undefined && value.includes("all")
  const needle = search.trim().toLowerCase()
  const groups = groupByResource(offered)
    .map((group) => ({
      ...group,
      shown: group.permissions.filter(
        (permission) =>
          permission.toLowerCase().includes(needle) ||
          tr(`access.permission.${group.resource}`)
            .toLowerCase()
            .includes(needle),
      ),
    }))
    .filter((group) => group.shown.length > 0)
  const open = (permission: Permission) => mayChange?.(permission) ?? true

  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      {all && (
        <label className="-mt-1 flex min-w-0 items-start gap-3">
          <Switch
            className="mt-0.5"
            checked={everything}
            // `all` stands alone: picked permissions would mean nothing beside it.
            onCheckedChange={(on) => onChange(on ? ["all"] : [])}
          />
          <span className="min-w-0">
            <span className="block text-sm leading-5">{all.label}</span>
            <span className="text-muted-foreground text-13px block leading-5">
              {all.hint}
            </span>
          </span>
        </label>
      )}
      {!everything && (
        <>
          <Input
            type="search"
            value={search}
            placeholder={tr("access.permissions.search")}
            aria-label={tr("access.permissions.search")}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="-mx-1 flex max-h-72 flex-col gap-3.5 overflow-y-auto px-1 py-0.5">
            {groups.length === 0 && (
              <li className="text-muted-foreground text-13px">
                {tr("access.permissions.noMatch")}
              </li>
            )}
            {groups.map(({ resource, permissions, shown }) => {
              const changeable = permissions.filter(open)
              return (
                <li key={resource} className="flex flex-col gap-1.5">
                  <label className="flex items-start gap-2.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={permissions.every((permission) =>
                        value.includes(permission),
                      )}
                      disabled={changeable.length === 0}
                      onCheckedChange={(on) =>
                        onChange(withPermissions(value, changeable, on))
                      }
                    />
                    <span className="min-w-0">
                      <code className="block text-sm leading-5 font-medium">
                        {resource}
                      </code>
                      <span className="text-muted-foreground text-13px block leading-5">
                        {tr(`access.permission.${resource}`)}
                      </span>
                    </span>
                  </label>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pl-7">
                    {shown.map((permission) => (
                      <li key={permission}>
                        <label className="text-13px flex items-center gap-2">
                          <Checkbox
                            checked={value.includes(permission)}
                            disabled={!open(permission)}
                            onCheckedChange={(on) =>
                              onChange(withPermissions(value, [permission], on))
                            }
                          />
                          <code>{permission}</code>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </FieldSet>
  )
}
