import { Button } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { useRouteContext } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"
import { useId, useRef, useState } from "react"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { formatRelative } from "@/lib/format"
import {
  useHiddenRequests,
  useRequestActionsStore,
  useSendHeldOnLeave,
} from "@/stores/request-actions"

import { DeclinePopover } from "./decline-popover"
import { GoesToLibrary } from "./goes-to"
import {
  addAction,
  askers,
  formatNames,
  scopeLabel,
  useRequestQueue,
} from "./request-queue"

/**
 * On a title's page, for an admin, a request that waits for them: who
 * requested it and when, with Add and Decline as the queue has them, and the
 * same Undo. On a catalog title's page it's the title's request; on a
 * library show's, the one for more of its seasons. Nothing for anyone
 * else, or while nothing waits.
 */
export function AdminRequestStrip({ requestId }: { requestId: string | null }) {
  const { user } = useRouteContext({ from: "/_authed/_shell" })
  const admin = user.role === "admin"
  // The same live queue the avatar's dot reads, so this opens no stream.
  const queue = useRequestQueue(admin)
  const hidden = useHiddenRequests()
  const hold = useRequestActionsStore((state) => state.hold)
  const [declining, setDeclining] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // Where focus goes once a decline closes its popover. Null while none
  // was sent, so a popover closed without one hands focus back.
  const afterDecline = useRef<HTMLElement | null>(null)
  const id = useId()
  useSendHeldOnLeave()

  const found =
    admin && requestId
      ? (queue.data?.waiting.find((entry) => entry.id === requestId) ?? null)
      : null
  // Kept while the strip collapses, so its words stay put as it goes.
  const [kept, setKept] = useState(found)
  if (found && found !== kept) setKept(found)
  const item = found ?? kept
  if (!item) return null
  const open = found !== null && !hidden.has(item.id)

  // The strip goes once it's answered, so focus moves on to the title's
  // own buttons under it.
  const nextFocus = () =>
    root.current?.nextElementSibling?.querySelector<HTMLElement>(
      "button:not([disabled]), a[href]",
    ) ?? null

  const { first, rest } = askers(item)
  const scope = scopeLabel(item.scope)
  const names: [string] = [item.title.name]
  const facts = [
    rest.length > 0
      ? tr("requests.alsoRequested", {
          names: formatNames(rest.map((entry) => entry.name)),
        })
      : null,
    scope,
  ].filter(Boolean)

  return (
    <div
      ref={root}
      aria-hidden={!open || undefined}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none",
        open ? "mt-6 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <section
          aria-labelledby={`${id}-who`}
          className="bg-foreground/10 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg py-1.5 pr-1.5 pl-3 backdrop-blur"
        >
          {first && (
            <UserAvatar
              user={{
                avatarId: null,
                displayName: first.name,
                username: first.name,
              }}
              className="size-6 shrink-0 text-[11px]"
            />
          )}
          <p className="min-w-0 flex-1 text-[13px] leading-5">
            <span id={`${id}-who`} className="text-foreground/90">
              {first
                ? tr("requests.strip.requested", {
                    name: first.name,
                    when: formatRelative(first.createdAt),
                  })
                : tr("requests.strip.waiting")}
            </span>
            {facts.map((fact) => (
              <span key={fact} className="text-muted-foreground">
                {" · "}
                {fact}
              </span>
            ))}
            {item.destinations.length > 1 && (
              <span className="text-muted-foreground">
                {" · "}
                {trRich("requests.goesTo.short", {
                  library: <GoesToLibrary item={item} />,
                })}
              </span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-1 max-sm:w-full">
            <DeclinePopover
              item={item}
              open={declining}
              onOpenChange={(next) => {
                if (next) afterDecline.current = null
                setDeclining(next)
              }}
              finalFocus={() => afterDecline.current ?? true}
              onAnswer={(answer) => {
                afterDecline.current = nextFocus()
                setDeclining(false)
                hold({ ...answer, ids: [item.id], names })
              }}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-foreground/10 data-popup-open:bg-foreground/10 max-sm:h-10 max-sm:flex-1"
                >
                  {tr("requests.decline")}
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="max-sm:h-10 max-sm:flex-1"
              onClick={() => {
                hold(addAction([item]))
                nextFocus()?.focus()
              }}
            >
              <CheckIcon />
              {tr("requests.add")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
