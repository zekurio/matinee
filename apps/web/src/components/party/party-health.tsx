import type { PartyMemberHealth } from "@matinee/contracts"
import { Hourglass, UsersRound } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { perLocale, tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import { liveData, useLiveQuery } from "@/lib/live-query"
import { liveQuery, orpc } from "@/lib/rpc"
import { methodName, qualityName } from "@/lib/stats"
import { usePlayerStore, usePlayerStoreApi } from "@/stores/player"

import { type PartyLink, waitingNames } from "../use-party-sync"

const MENU = "party-health"
// Closer than this to the party counts as with it. Past `LATE_S` the
// player jumps to catch up, which is as far off as it gets.
const SYNCED_S = 0.5
const LATE_S = 2

const seconds = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

type Tone = "good" | "fair" | "poor" | "off"

/** How a member keeps up, in a word or two, and how well. */
type Verdict = { tone: Tone; text: string }

const TONES = new Map<Tone, string>([
  ["good", "bg-emerald-400"],
  ["fair", "bg-amber-400"],
  ["poor", "bg-red-400"],
  ["off", "bg-white/30"],
])

function judge(health: PartyMemberHealth, partyPlaying: boolean): Verdict {
  if (health.state === "away") {
    return { tone: "off", text: tr("party.health.away") }
  }
  if (health.state === "buffering") {
    return { tone: "poor", text: tr("party.health.buffering") }
  }
  if (partyPlaying && health.state === "paused") {
    return { tone: "fair", text: tr("party.health.paused") }
  }
  const drift = health.driftSeconds ?? 0
  const off = Math.abs(drift)
  if (off < SYNCED_S) return { tone: "good", text: tr("party.health.inSync") }
  const amount = seconds().format(off)
  return {
    tone: off < LATE_S ? "fair" : "poor",
    text:
      drift < 0
        ? tr("party.health.behind", { seconds: amount })
        : tr("party.health.ahead", { seconds: amount }),
  }
}

/** How the member's player gets the file, and how much it has. */
function detailOf(health: PartyMemberHealth): string | null {
  const parts: string[] = []
  if (health.method) {
    parts.push(methodName(health.method))
    if (health.method !== "direct" && health.quality) {
      parts.push(qualityName(health.quality))
    }
  }
  if (health.bufferedSeconds !== null) {
    parts.push(
      tr("party.health.loaded", {
        seconds: seconds().format(health.bufferedSeconds),
      }),
    )
  }
  if (health.remote) parts.push(tr("party.health.remote"))
  return parts.length > 0 ? parts.join(" · ") : null
}

/** Each member with how their player keeps up, while the list is open. */
function HealthList(props: { party: PartyLink }) {
  // Mounted only while open, so the stream closes with the list.
  const health = useLiveQuery(() => ({
    ...orpc.party.health.experimental_liveOptions(),
    ...liveQuery,
  }))
  const byId = createMemo(() => {
    const members = liveData(health())?.members ?? []
    return new Map(members.map((entry) => [entry.userId, entry]))
  })
  return (
    <ul class="flex flex-col gap-1">
      <For each={props.party.members} keyed={(member) => member.user.id}>
        {(member) => {
          const entry = () => byId().get(member().user.id)
          const verdict = (): Verdict => {
            const found = entry()
            return found
              ? judge(found, props.party.playback.playing)
              : { tone: "off", text: tr("party.health.checking") }
          }
          const detail = () => {
            const found = entry()
            return found ? detailOf(found) : null
          }
          const name = () => member().user.displayName ?? member().user.username
          return (
            <li class="flex items-center gap-2.5 px-1.5 py-1">
              <UserAvatar user={member().user} class="size-7 text-xs" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {member().user.id === props.party.selfId
                    ? tr("party.health.you", { name: name() })
                    : name()}
                </p>
                <Show when={detail()}>
                  {(text) => (
                    <p class="text-muted-foreground truncate text-xs">
                      {text()}
                    </p>
                  )}
                </Show>
              </div>
              <span class="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums">
                <span
                  aria-hidden="true"
                  class={["size-2 rounded-full", TONES.get(verdict().tone)]}
                />
                {verdict().text}
              </span>
            </li>
          )
        }}
      </For>
    </ul>
  )
}

/**
 * How many watch, or who the party waits for, over the picture. Pressing
 * it lists how each member's player keeps up.
 */
export function PartyHealthButton(props: {
  party: PartyLink
  /** The player, which may be the full-screen element. */
  container: () => HTMLElement | undefined
}) {
  const { setMenuOpen } = usePlayerStoreApi().getState()
  // As a menu of the player's, so the controls stay up while it's open.
  const open = usePlayerStore((state) => state.openMenu === MENU)
  const waits = () => props.party.waitingFor.length > 0
  const label = () => {
    if (!waits()) {
      return tr("party.player.watching", { count: props.party.members.length })
    }
    const who = waitingNames(props.party)
    return who
      ? tr("party.player.waiting", { names: who })
      : tr("party.player.waitingForYou")
  }
  return (
    <Popover
      open={open()}
      onOpenChange={(next: boolean) => setMenuOpen(MENU, next)}
    >
      <PopoverTrigger
        title={tr("party.health.title")}
        class="flex max-w-60 min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur-md outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <Icon icon={waits() ? Hourglass : UsersRound} />
        <span class="truncate">{label()}</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        portalContainer={props.container()}
        class="w-80 max-w-(--available-width) p-1.5"
      >
        <PopoverHeader class="px-2">
          <PopoverTitle>{tr("party.health.title")}</PopoverTitle>
        </PopoverHeader>
        <HealthList party={props.party} />
        <p class="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">
          {tr("party.health.hint")}
        </p>
      </PopoverContent>
    </Popover>
  )
}
