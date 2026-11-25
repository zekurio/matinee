import type { AdminRequestItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Link } from "@tanstack/solid-router"
import { createMemo, For, Show } from "solid-js"

import type { AskedItem } from "@/components/asked/asked"
import { declineLine } from "@/components/catalog/words"
import { UserAvatar } from "@/components/user-avatar"
import { knownMessage, tr } from "@/i18n"
import { AvatarGroup } from "@/kit/avatar"

import { askers } from "./request-queue"

/*
 * What a card says besides its year, name and state: who asked, on the
 * admin's cards, and what went wrong, which the state's badge opens.
 * Everything else about a request is in the admin's "…" menu.
 */

/**
 * What the connection said about a request it holds, label and value,
 * when it said anything: for working out why one is stuck.
 */
export function Diagnostics(props: { item: AdminRequestItem }) {
  return (
    <Show when={props.item.diagnostics.length > 0}>
      <dl class="bg-muted grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md px-2.5 py-1.5 text-xs">
        <For each={props.item.diagnostics}>
          {(entry) => (
            <div class="contents">
              <dt class="text-muted-foreground">{entry.label}</dt>
              <dd class="text-foreground/85 font-mono break-all">
                {entry.value}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  )
}

/**
 * What went wrong with a request in the queue, for its badge to open:
 * the error on one that needs attention, the reason and note on one
 * declined or given up on. Null when nothing did.
 */
export function queueDetail(item: AdminRequestItem): JSX.Element {
  if (item.state === "needsAttention") {
    const error = item.error
      ? (knownMessage(item.error) ?? tr("requests.attention.failedUnknown"))
      : tr("requests.attention.unknown")
    return (
      <>
        <p>{error}</p>
        <Diagnostics item={item} />
      </>
    )
  }
  if (item.state !== "declined") return null
  const why = item.reason
    ? tr(`requests.reason.${item.reason}`)
    : tr("requests.state.declined")
  return <Reason why={why} note={item.note} />
}

/** Why a person's own request was declined, for its badge to open. */
export function ownDetail(item: AskedItem): JSX.Element {
  if (item.state !== "declined") return null
  const { reason } = item.season ?? item.availability
  if (!reason) return null
  return <Reason why={declineLine(reason)} note={reason.note} />
}

/** The reason a request was declined, and the admin's note under it. */
function Reason(props: { why: string; note: string | null }) {
  return (
    <>
      <p>{props.why}</p>
      <Show when={props.note}>
        <p class="whitespace-pre-line italic">{props.note}</p>
      </Show>
    </>
  )
}

/** How many askers' avatars a card shows; the count after them says the rest. */
const AVATARS = 3

/**
 * Each avatar's place in the stack, first asker on top: the card names
 * them, so theirs is the face that shows whole, with the others behind.
 */
const STACK = ["z-3", "z-2", "z-1"]

/**
 * Who asked: the first few faces, the first one's name, and how many
 * more, "Ben +2". The faces and the name open the first one's profile;
 * everyone else, and when each asked, is in the card's menu.
 */
export function Askers(props: { item: AdminRequestItem }) {
  const who = createMemo(() => askers(props.item))
  return (
    <Show when={who().first}>
      {(first) => (
        <div class="text-13px flex min-w-0 items-center gap-2">
          <Link
            to="/profiles/$username"
            params={{ username: first().username }}
            class="group/asker focus-visible:ring-ring -mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 outline-none focus-visible:ring-2"
          >
            <AvatarGroup class="shrink-0">
              <For each={[first(), ...who().rest].slice(0, AVATARS)}>
                {(asker, index) => (
                  <UserAvatar
                    user={{
                      avatarUrl: asker.avatarUrl,
                      displayName: asker.name,
                      username: asker.username,
                    }}
                    class={cn("text-11px size-6", STACK[index()])}
                  />
                )}
              </For>
            </AvatarGroup>
            <span class="text-foreground/90 group-hover/asker:text-foreground truncate underline-offset-2 group-hover/asker:underline">
              {first().name}
            </span>
          </Link>
          <Show when={who().rest.length > 0}>
            <span class="text-muted-foreground shrink-0 tabular-nums">
              {tr("requests.othersCount", { count: who().rest.length })}
            </span>
          </Show>
        </div>
      )}
    </Show>
  )
}
