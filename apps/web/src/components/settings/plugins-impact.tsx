import type { PluginImpact, PluginInfo } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpenIcon, LogInIcon, UserXIcon } from "lucide-react"
import { type ReactNode, useRef } from "react"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

import { listOf } from "./plugins-common"

/** How long an answer about what a plugin takes away stays good. */
const IMPACT_FRESH_MS = 30_000

/** Library names shown before the rest are counted. */
const SHOWN_LIBRARIES = 3

/**
 * Who is locked out, by name, so an admin can give them another way in
 * first. The server names the first few; the rest are a count.
 */
function lockedOutNames(impact: PluginImpact): string | null {
  const names = impact.lockedOutNames
  if (names.length === 0) return null
  const more = impact.lockedOut - names.length
  return listOf(
    more > 0 ? [...names, tr("plugins.impact.others", { count: more })] : names,
  )
}

/**
 * Whether turning the plugin off can take anything away. Only metadata
 * and sign-in can; a plugin with neither goes off without a question.
 */
export function couldHaveImpact(plugin: PluginInfo): boolean {
  return (
    plugin.contributes.metadata.length > 0 || plugin.contributes.auth.length > 0
  )
}

export function impactOptions(id: string) {
  return orpc.admin.plugins.impact.queryOptions({
    input: { id },
    staleTime: IMPACT_FRESH_MS,
    // The warning falls back to general words, so a failure isn't worth
    // the wait of asking again.
    retry: false,
    retryOnMount: false,
  })
}

/** Ask ahead for what the plugin takes away, as the admin heads there. */
export function usePrefetchImpact(plugin: PluginInfo) {
  const queryClient = useQueryClient()
  return () => {
    if (!couldHaveImpact(plugin)) return
    void queryClient.prefetchQuery(impactOptions(plugin.id))
  }
}

export function impactEmpty(impact: PluginImpact): boolean {
  return impact.libraries.length === 0 && impact.linkedAccounts === 0
}

function providerNames(plugin: PluginInfo): string {
  return listOf(plugin.contributes.auth.map((item) => item.name))
}

/**
 * What turning the plugin off or removing it takes away, a row each,
 * worst first: people locked out, then linked sign-ins, then libraries.
 */
export function ImpactList({
  plugin,
  impact,
  removing,
}: {
  plugin: PluginInfo
  impact: PluginImpact
  /** Removing deletes the links; turning off keeps them for later. */
  removing: boolean
}) {
  const providers = providerNames(plugin)
  const libraries = impact.libraries
  // Four names fit where three and "1 more" would.
  const shown =
    libraries.length > SHOWN_LIBRARIES + 1
      ? libraries.slice(0, SHOWN_LIBRARIES)
      : libraries
  const more = libraries.length - shown.length
  const names = lockedOutNames(impact)
  return (
    <ul className="bg-foreground/[0.02] flex flex-col divide-y overflow-hidden rounded-xl border text-left">
      {impact.lockedOut > 0 && (
        <ImpactRow
          icon={<UserXIcon />}
          danger
          title={tr("plugins.impact.lockedOut", { count: impact.lockedOut })}
        >
          <span className="flex flex-col gap-0.5">
            {names && (
              <span className="text-foreground wrap-anywhere">{names}</span>
            )}
            <span>
              {removing
                ? tr("plugins.impact.lockedOut.remove", { providers })
                : tr("plugins.impact.lockedOut.off", { providers })}
            </span>
          </span>
        </ImpactRow>
      )}
      {impact.linkedAccounts > 0 && (
        <ImpactRow
          icon={<LogInIcon />}
          title={tr("plugins.impact.linked", {
            count: impact.linkedAccounts,
            providers,
          })}
        >
          {removing
            ? tr("plugins.impact.linked.remove", {
                count: impact.linkedAccounts,
              })
            : tr("plugins.impact.linked.off", {
                count: impact.linkedAccounts,
              })}
        </ImpactRow>
      )}
      {libraries.length > 0 && (
        <ImpactRow
          icon={<FolderOpenIcon />}
          title={tr("plugins.impact.libraries", { count: libraries.length })}
        >
          <span className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-1">
              {shown.map((library) => (
                <span
                  key={library.id}
                  title={library.name}
                  className="bg-secondary text-foreground line-clamp-2 max-w-full rounded-md px-1.5 py-0.5 text-xs leading-4 wrap-anywhere"
                >
                  {library.name}
                </span>
              ))}
              {more > 0 && (
                <span className="ml-0.5 py-0.5 text-xs leading-4">
                  {tr("plugins.impact.librariesMore", { count: more })}
                </span>
              )}
            </span>
            <span>
              {removing
                ? tr("plugins.impact.libraries.remove", {
                    count: libraries.length,
                  })
                : tr("plugins.impact.libraries.off", {
                    count: libraries.length,
                  })}
            </span>
          </span>
        </ImpactRow>
      )}
    </ul>
  )
}

function ImpactRow({
  icon,
  title,
  danger = false,
  children,
}: {
  icon: ReactNode
  title: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
          danger
            ? "bg-danger-soft text-destructive"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
        <span
          className={cn(
            "text-sm leading-5 font-medium",
            danger ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground text-[13px] leading-5">
          {children}
        </span>
      </span>
    </li>
  )
}

/**
 * The general warning, for when the server couldn't say what the plugin
 * takes away: what it could take, from what it provides.
 */
function genericOff(plugin: PluginInfo): string {
  const parts = [tr("plugins.impact.unknown")]
  if (plugin.contributes.auth.length > 0) {
    parts.push(
      tr("plugins.off.generic.signIns", { providers: providerNames(plugin) }),
    )
  }
  if (plugin.contributes.metadata.length > 0) {
    parts.push(tr("plugins.off.generic.metadata"))
  }
  return parts.join(" ")
}

/**
 * The question before turning off a plugin that takes something away.
 * Cancel has the focus, so Enter keeps the plugin on.
 */
export function TurnOffDialog({
  plugin,
  open,
  onOpenChange,
  onConfirm,
}: {
  plugin: PluginInfo
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  const impact = useQuery({
    ...impactOptions(plugin.id),
    enabled: open && couldHaveImpact(plugin),
  })
  const data = impact.data
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        initialFocus={cancel}
        className="data-[size=default]:sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">
            {tr("plugins.off.title", { name: plugin.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {data
              ? tr("plugins.off.description")
              : impact.isError
                ? genericOff(plugin)
                : tr("plugins.impact.checking")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {data && !impactEmpty(data) && (
          <ImpactList plugin={plugin} impact={data} removing={false} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel}>
            {tr("plugins.consent.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {tr("plugins.off.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type RemoveContent = { description: ReactNode; list: ReactNode }

/**
 * The remove question's sentence and list, by what the plugin takes away:
 * the plain sentence alone when it's nothing, the general warning if the
 * server couldn't say, or a line while it's asked.
 */
export function removeContent(
  plugin: PluginInfo,
  impact: { data: PluginImpact | undefined; isError: boolean },
): RemoveContent {
  const plain = tr("plugins.remove.description")
  if (!couldHaveImpact(plugin) || (impact.data && impactEmpty(impact.data))) {
    return { description: plain, list: null }
  }
  if (impact.data) {
    return {
      description: plain,
      list: <ImpactList plugin={plugin} impact={impact.data} removing />,
    }
  }
  if (impact.isError) {
    const parts = [
      tr("plugins.impact.unknown"),
      plugin.contributes.auth.length > 0
        ? tr("plugins.remove.withSignIns", {
            providers: providerNames(plugin),
          })
        : plain,
    ]
    if (plugin.contributes.metadata.length > 0) {
      parts.push(tr("plugins.remove.metadata"))
    }
    return { description: parts.join(" "), list: null }
  }
  return {
    description: (
      <span className="inline-flex items-center gap-2">
        <Spinner className="size-3.5" />
        {tr("plugins.impact.checking")}
      </span>
    ),
    list: null,
  }
}

/** What the admin picked when asked about linked accounts. */
export type LinksAnswer = "keep" | "remove" | "cancel"

/**
 * The question before saving a change to a setting that decides who a
 * sign-in belongs to, while accounts are linked through the plugin. It
 * names the settings, says in two sentences why it matters, and offers
 * the choices, with who is locked out if the links go. Cancel has the
 * focus, and closing the dialog any other way cancels too.
 */
export function LinksDialog({
  plugin,
  open,
  settings,
  impact,
  onAnswer,
}: {
  plugin: PluginInfo
  open: boolean
  /** The labels of the settings that change. */
  settings: string[]
  /** What is linked; null when the server couldn't say. */
  impact: PluginImpact | null
  onAnswer: (links: LinksAnswer) => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  const providers = providerNames(plugin)
  const quoted = listOf(
    settings.map((label) => tr("plugins.quoted", { text: label })),
  )
  const names = impact ? lockedOutNames(impact) : null
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onAnswer("cancel")
      }}
    >
      <AlertDialogContent
        initialFocus={cancel}
        className="data-[size=default]:sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("plugins.links.title")}</AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2">
            <span>
              {impact
                ? tr("plugins.links.changed", {
                    count: impact.linkedAccounts,
                    settings: quoted,
                    providers,
                  })
                : tr("plugins.links.changedUnknown", {
                    settings: quoted,
                    providers,
                  })}
            </span>
            <span>{tr("plugins.links.why")}</span>
            <span>{tr("plugins.links.choice", { providers })}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {impact && impact.lockedOut > 0 && (
          <ul className="bg-foreground/[0.02] flex flex-col overflow-hidden rounded-xl border text-left">
            <ImpactRow
              icon={<UserXIcon />}
              danger
              title={tr("plugins.impact.lockedOut", {
                count: impact.lockedOut,
              })}
            >
              <span className="flex flex-col gap-0.5">
                {names && (
                  <span className="text-foreground wrap-anywhere">{names}</span>
                )}
                <span>{tr("plugins.links.lockedOut", { providers })}</span>
              </span>
            </ImpactRow>
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel}>
            {tr("plugins.consent.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => onAnswer("remove")}
          >
            {tr("plugins.links.removeAction")}
          </AlertDialogAction>
          {/* Not the highlighted button: keeping links across a real change
              of provider is the choice that lets the wrong person in. */}
          <AlertDialogAction variant="outline" onClick={() => onAnswer("keep")}>
            {tr("plugins.links.keepAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
