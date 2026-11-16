import type { PartyMemberHealth } from "@matinee/contracts"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { HourglassIcon, UsersRoundIcon } from "lucide-react"
import type { RefObject } from "react"

import { UserAvatar } from "@/components/user-avatar"
import { perLocale, tr } from "@/i18n"
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
function HealthList({ party }: { party: PartyLink }) {
  // Mounted only while open, so the stream closes with the list.
  const health = useQuery({
    ...orpc.party.health.experimental_liveOptions(),
    ...liveQuery,
  })
  const byId = new Map(
    (health.data?.members ?? []).map((entry) => [entry.userId, entry]),
  )
  return (
    <ul className="flex flex-col gap-1">
      {party.members.map(({ user }) => {
        const entry = byId.get(user.id)
        const verdict: Verdict = entry
          ? judge(entry, party.playback.playing)
          : { tone: "off", text: tr("party.health.checking") }
        const detail = entry ? detailOf(entry) : null
        const name = user.displayName ?? user.username
        return (
          <li key={user.id} className="flex items-center gap-2.5 px-1.5 py-1">
            <UserAvatar user={user} className="size-7 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {user.id === party.selfId
                  ? tr("party.health.you", { name })
                  : name}
              </p>
              {detail && (
                <p className="text-muted-foreground truncate text-xs">
                  {detail}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums">
              <span
                aria-hidden
                className={cn("size-2 rounded-full", TONES.get(verdict.tone))}
              />
              {verdict.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * How many watch, or who the party waits for, over the picture. Pressing
 * it lists how each member's player keeps up.
 */
export function PartyHealthButton({
  party,
  container,
}: {
  party: PartyLink
  /** The player, which may be the full-screen element. */
  container: RefObject<HTMLDivElement | null>
}) {
  const actions = usePlayerStoreApi().getState()
  // As a menu of the player's, so the controls stay up while it's open.
  const open = usePlayerStore((state) => state.openMenu === MENU)
  const waits = party.waitingFor.length > 0
  const who = waits ? waitingNames(party) : null
  const label = !waits
    ? tr("party.player.watching", { count: party.members.length })
    : who
      ? tr("party.player.waiting", { names: who })
      : tr("party.player.waitingForYou")
  return (
    <Popover
      open={open}
      onOpenChange={(next) => actions.setMenuOpen(MENU, next)}
    >
      <PopoverTrigger
        title={tr("party.health.title")}
        className="flex max-w-60 min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur-md outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:size-4 [&_svg]:shrink-0"
      >
        {waits ? <HourglassIcon aria-hidden /> : <UsersRoundIcon aria-hidden />}
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        portalContainer={container}
        className="w-80 max-w-(--available-width) p-1.5"
      >
        <PopoverHeader className="px-2">
          <PopoverTitle>{tr("party.health.title")}</PopoverTitle>
        </PopoverHeader>
        <HealthList party={party} />
        <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">
          {tr("party.health.hint")}
        </p>
      </PopoverContent>
    </Popover>
  )
}
