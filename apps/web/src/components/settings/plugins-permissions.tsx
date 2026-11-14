import type { PluginPermission } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  ClapperboardIcon,
  DatabaseIcon,
  EyeIcon,
  GlobeIcon,
  KeyRoundIcon,
  LibraryBigIcon,
  LogInIcon,
  RouterIcon,
  UserPlusIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { tr } from "@/i18n"

import { eventLabel, listOf } from "./plugins-common"

type Kind = PluginPermission["kind"]

function glyphFor(kind: Kind): ReactNode {
  switch (kind) {
    case "network":
      return <GlobeIcon />
    case "network-config":
      return <RouterIcon />
    case "storage":
      return <DatabaseIcon />
    case "metadata":
      return <ClapperboardIcon />
    case "auth":
      return <LogInIcon />
    case "auth-credentials":
      return <KeyRoundIcon />
    case "events-library":
      return <LibraryBigIcon />
    case "events-playback":
      return <EyeIcon />
    case "events-users":
      return <UserPlusIcon />
  }
}

/** What a permission allows, as one sentence with its names in it. */
function sentence({ kind, detail }: PluginPermission): string {
  const names = listOf(detail)
  switch (kind) {
    case "network":
      return tr("plugins.permission.network")
    case "network-config":
      return tr("plugins.permission.network-config", {
        settings: listOf(detail.map((text) => tr("plugins.quoted", { text }))),
      })
    case "storage":
      return tr("plugins.permission.storage")
    case "metadata":
      return tr("plugins.permission.metadata", { providers: names })
    case "auth":
      return tr("plugins.permission.auth", { providers: names })
    case "auth-credentials":
      return tr("plugins.permission.auth-credentials", { providers: names })
    case "events-library":
      return tr("plugins.permission.events-library")
    case "events-playback":
      return tr("plugins.permission.events-playback")
    case "events-users":
      return tr("plugins.permission.events-users")
  }
}

/** The names that read better as a list under the sentence. */
function chips({ kind, detail }: PluginPermission): string[] {
  switch (kind) {
    case "network":
      return detail
    case "events-library":
    case "events-playback":
    case "events-users":
      return detail.map(eventLabel)
    default:
      return []
  }
}

/** Why a sensitive permission deserves a second look. */
function sensitiveReason(kind: Kind): string | null {
  if (kind === "auth-credentials") return tr("plugins.sensitive.credentials")
  if (kind === "events-playback") return tr("plugins.sensitive.playback")
  return null
}

/**
 * What a permission still allows once the new parts are taken out, for the
 * "already allowed" half of an update. Null when nothing is left.
 */
function without(
  permission: PluginPermission,
  added: PluginPermission[],
): PluginPermission | null {
  const fresh = added.find((item) => item.kind === permission.kind)
  if (!fresh) return permission
  if (permission.detail.length === 0) return null
  const detail = permission.detail.filter(
    (name) => !fresh.detail.includes(name),
  )
  return detail.length > 0 ? { ...permission, detail } : null
}

/**
 * The permissions a plugin has or asks for, in plain sentences, then what
 * no plugin can do whatever it asks for. The consent step, a plugin's page,
 * and the approval prompt all show this list.
 *
 * With `added`, those lead under their own heading and the rest follow as
 * already allowed, so an update's new asks are what the eye lands on.
 */
export function PermissionList({
  permissions,
  added,
}: {
  permissions: PluginPermission[]
  /** The ones that are new since the last approval. */
  added?: PluginPermission[]
}) {
  if (!added) {
    return (
      <div className="flex flex-col gap-3">
        {permissions.length === 0 ? (
          <Nothing />
        ) : (
          <Rows permissions={permissions} />
        )}
        <SandboxNote />
      </div>
    )
  }
  const kept = permissions.flatMap((permission) => {
    const rest = without(permission, added)
    return rest ? [rest] : []
  })
  return (
    <div className="flex flex-col gap-4">
      {added.length > 0 && (
        <Group title={tr("plugins.permissions.new")}>
          <Rows permissions={added} fresh />
        </Group>
      )}
      {kept.length > 0 && (
        <Group title={tr("plugins.permissions.kept")}>
          <Rows permissions={kept} muted={added.length > 0} />
        </Group>
      )}
      {permissions.length === 0 && <Nothing />}
      <SandboxNote />
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-[13px] leading-5 font-medium">
        {title}
      </h4>
      {children}
    </section>
  )
}

function Nothing() {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-[13px] leading-5">
      {tr("plugins.permissions.none")}
    </p>
  )
}

function SandboxNote() {
  return (
    <p className="text-muted-foreground text-[13px] leading-5">
      {tr("plugins.permissions.sandbox")}
    </p>
  )
}

function Rows({
  permissions,
  fresh = false,
  muted = false,
}: {
  permissions: PluginPermission[]
  fresh?: boolean
  muted?: boolean
}) {
  return (
    <ul className="bg-foreground/[0.02] flex flex-col divide-y overflow-hidden rounded-xl border">
      {permissions.map((permission) => (
        <PermissionRow
          key={`${permission.kind}:${permission.detail.join(",")}`}
          permission={permission}
          fresh={fresh}
          muted={muted}
        />
      ))}
    </ul>
  )
}

function PermissionRow({
  permission,
  fresh,
  muted,
}: {
  permission: PluginPermission
  fresh: boolean
  muted: boolean
}) {
  const reason = permission.sensitive ? sensitiveReason(permission.kind) : null
  const names = chips(permission)
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
          permission.sensitive
            ? "bg-warning-soft text-warning"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {glyphFor(permission.kind)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <p
          className={cn(
            "text-sm leading-5 wrap-anywhere",
            muted && "text-muted-foreground",
          )}
        >
          {fresh && (
            <span className="bg-accent-soft text-foreground mr-2 inline-flex h-5 translate-y-[-1px] items-center rounded-full px-2 align-middle text-xs font-medium">
              {tr("plugins.permissions.newBadge")}
            </span>
          )}
          {sentence(permission)}
        </p>
        {names.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {names.map((name) => (
              <li
                key={name}
                title={name}
                className={cn(
                  "bg-secondary max-w-full rounded-md px-1.5 py-0.5 text-xs leading-4 wrap-anywhere",
                  permission.kind === "network" && "font-mono",
                )}
              >
                {name}
              </li>
            ))}
          </ul>
        )}
        {reason && (
          <p className="text-[13px] leading-5">
            <span className="text-warning font-medium">
              {tr("plugins.sensitive.label")}
            </span>{" "}
            <span className="text-muted-foreground">{reason}</span>
          </p>
        )}
      </div>
    </li>
  )
}
