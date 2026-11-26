import { trickplayTilePath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { createFileRoute, Link, useRouter } from "@tanstack/solid-router"
import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
  snapshot,
} from "solid-js"

import { useDocumentTitle } from "@/components/page-header"
import type { UpNext } from "@/components/up-next"
import type { PartyLink } from "@/components/use-party-sync"
import type { ProgressReport } from "@/components/use-progress-report"
import { type Episodes, VideoPlayer } from "@/components/video-player"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { liveData, useLiveQuery } from "@/lib/live-query"
import { itemLabel } from "@/lib/media"
import { partyPosition, useParty } from "@/lib/party"
import {
  type FirstStart,
  isUnplayable,
  playbackRefusal,
  startQuery,
  startQueryKey,
} from "@/lib/playback-start"
import {
  client,
  errorMessage,
  keepaliveClient,
  liveQuery,
  orpc,
} from "@/lib/rpc"

const WatchSearch = t.object({
  /**
   * Seconds to start at instead of where the viewer left off, as 0 for
   * Play from the start.
   */
  start: t.number().min(0).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/watch/$itemId")({
  validateSearch: WatchSearch,
  loaderDeps: ({ search }) => ({ start: search.start }),
  // How the file plays, asked for while the player's code loads, and on
  // hover over a play button. The answer has all the player needs.
  loader: ({ context: { queryClient }, params: { itemId }, deps }) => {
    void queryClient.prefetchQuery(startQuery(itemId, deps.start))
  },
  component: Watch,
})

/**
 * Send a progress report. A page that is closing can't wait for the RPC
 * client, so that last report goes out as a keepalive request instead.
 */
function sendProgress(itemId: string, report: ProgressReport) {
  const input = {
    itemId,
    positionSeconds: report.positionSeconds,
    durationSeconds: report.durationSeconds,
    sessionId: report.sessionId,
    playedSeconds: report.playedSeconds,
    paused: report.paused,
    closed: report.closed,
  }
  const sender = report.leaving ? keepaliveClient : client
  void sender.playback.report(input).catch(() => {})
}

function Watch() {
  const params = Route.useParams()
  const search = Route.useSearch()
  // Another file, as the next episode, starts over.
  return (
    <Show when={params().itemId} keyed>
      {(itemId) => <WatchItem itemId={itemId} start={search().start} />}
    </Show>
  )
}

type Stopped = { unplayable: true } | { unplayable: false; cause: unknown }

function WatchItem(props: { itemId: string; start: number | undefined }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const context = Route.useRouteContext()
  const user = () => context().user
  const { itemId } = props
  // The first answer, which the player starts from and keeps. The ones
  // after it are the player's own, so it's copied out of the query once.
  const started = useQuery(() => startQuery(itemId, props.start))
  let kept: FirstStart | null = null
  const first = createMemo(() => {
    if (kept === null && started.isSuccess) kept = snapshot(started.data)
    return kept
  })
  const [stopped, setStopped] = createSignal<Stopped | null>(null)
  const unplayable = () => {
    const stop = stopped()
    return stop ? stop.unplayable : isUnplayable(started.error)
  }
  // The file's container, for saying why nothing plays, when the first
  // answer didn't come with it.
  const item = useQuery(() => ({
    ...orpc.media.get.queryOptions({ input: { id: itemId } }),
    enabled: unplayable() && first() === null,
  }))
  // The stream ends once the images are there or won't come. Only one that
  // ended while they were being made opens again.
  const trickplay = useLiveQuery(() => ({
    ...orpc.media.trickplay.experimental_liveOptions({ input: { id: itemId } }),
    ...liveQuery,
    refetchInterval: (query) =>
      query.state.data?.status === "pending"
        ? liveQuery.refetchInterval(query)
        : false,
  }))
  const trickplayTiles = createMemo(() => {
    const data = liveData(trickplay())
    if (data?.status !== "ready") return null
    const images = data.images
    return {
      images,
      src: (tile: number) => trickplayTilePath(itemId, images.key, tile),
    }
  })
  const playing = () => first()?.plan.item
  const label = createMemo(() => {
    const current = playing()
    return current ? itemLabel(current) : null
  })

  // Another episode, in place of this one, so back still leaves the player.
  const playInstead = (id: string) =>
    void router.navigate({
      to: "/watch/$itemId",
      params: { itemId: id },
      replace: true,
    })
  // The show's next episode, which the player offers once the credits
  // start or this one ends.
  const upNext = createMemo<UpNext | null>(() => {
    const plan = first()?.plan
    const next = plan?.next
    if (!plan || !next) return null
    const nextLabel = itemLabel(next)
    return {
      name: nextLabel.code
        ? `${nextLabel.code} · ${nextLabel.title}`
        : nextLabel.title,
      at: plan.upNextAt,
      play: () => playInstead(next.id),
    }
  })
  // An episode's buttons for the one before and the one after.
  const episodes = createMemo<Episodes | null>(() => {
    if (playing()?.title?.kind !== "show") return null
    const previous = first()?.plan.previous
    return {
      previous: previous ? () => playInstead(previous.id) : null,
      next: upNext()?.play ?? null,
    }
  })

  useDocumentTitle(() => label()?.title)

  // In a watch party, the player follows it while it plays this file.
  // The owner's player is where the party's file comes from: what they
  // open, the party watches. Anyone else who opens another file watches
  // it alone, and stays in the party.
  const { party, offsetMs } = useParty()
  const partyItemId = createMemo(() => party()?.item?.id ?? null)
  const inStep = createMemo(() => partyItemId() === itemId)
  let stepped = false
  const wasInStep = createMemo(() => (stepped ||= inStep()))
  const link = createMemo<PartyLink | null>(() => {
    const current = party()
    if (!current || !inStep() || !current.playback) return null
    const selfId = user().id
    return {
      playback: current.playback,
      offsetMs: offsetMs(),
      members: current.members,
      selfId,
      waitingFor: current.waitingFor,
      nameOf: (id) => {
        if (id === selfId) return null
        const member = current.members.find((other) => other.user.id === id)
        return member ? (member.user.displayName ?? member.user.username) : null
      },
      control: (isPlaying, positionSeconds) =>
        void client.party
          .control({ itemId, playing: isPlaying, positionSeconds })
          .catch(() => {}),
      report: (status) =>
        void client.party.status({ itemId, ...status }).catch(() => {}),
      // The party goes on to its queue, and this player after it.
      ended: () => void client.party.next({ itemId }).catch(() => {}),
    }
  })

  // The owner opened this file, so the party watches it from where the
  // owner starts.
  const announceAt = createMemo(() => {
    const startsAt = first()?.plan.position
    const current = party()
    return current !== null && current.owner && !wasInStep()
      ? startsAt
      : undefined
  })
  createEffect(announceAt, (positionSeconds) => {
    if (positionSeconds === undefined) return
    client.party
      .play({ itemId, positionSeconds })
      .catch((cause: unknown) =>
        toast.error(tr("party.failed"), { description: errorMessage(cause) }),
      )
  })

  // The party went on to another file, and a player that was with it
  // goes along, to where the party is in it by now.
  const follow = createMemo(
    () => {
      const to = partyItemId()
      if (!wasInStep() || to === null || inStep()) return null
      const playback = party()?.playback
      return {
        to,
        start: playback ? Math.floor(partyPosition(playback, offsetMs())) : 0,
      }
    },
    { equals: (a, b) => a?.to === b?.to },
  )
  createEffect(follow, (going) => {
    if (going === null) return
    void router.navigate({
      to: "/watch/$itemId",
      params: { itemId: going.to },
      // In place of the resume point.
      search: { start: going.start },
      replace: true,
    })
  })

  // Home's rows, title pages, and statistics depend on what was just watched.
  // The next visit asks anew, for a new sitting from where this one ends.
  onSettled(() => () => {
    queryClient.removeQueries({ queryKey: startQueryKey(itemId) })
    void queryClient.invalidateQueries({ queryKey: orpc.home.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.profiles.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.stats.key() })
  })

  const back = () => {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: "/" })
  }

  const subtitle = () => {
    const current = label()
    if (!current) return ""
    if (current.code) return `${current.code} · ${current.showName}`
    return playing()?.title
      ? (current.year ?? "")
      : current.groupLabel.join(" · ")
  }
  const nowPlaying = createMemo(() => {
    const current = label()
    const file = playing()
    // The poster reads at the size of a lock screen; a still is the fallback.
    const art = file?.title?.images.poster ?? file?.episode?.still ?? null
    return {
      title: current?.title ?? "",
      artist: current?.code ? current.showName : (current?.year ?? ""),
      album: current?.code ? (current.groupLabel.at(-1) ?? "") : "",
      art: art && {
        id: art.id,
        aspectRatio: art.placeholder?.aspectRatio ?? null,
      },
    }
  })

  return (
    <Show
      when={!stopped() && first()}
      keyed
      fallback={
        <WatchFailed
          waiting={first() === null && started.isPending}
          unplayable={unplayable()}
          container={
            (item.isSuccess ? item.data.container : undefined) ??
            playing()?.container
          }
          failure={(() => {
            const stop = stopped()
            return stop && !stop.unplayable ? stop.cause : started.error
          })()}
        />
      }
    >
      {(start) => (
        <VideoPlayer
          start={start}
          title={label()?.title ?? ""}
          subtitle={subtitle()}
          nowPlaying={nowPlaying()}
          trickplay={trickplayTiles()}
          // A party's queue says what comes next, and it moves on through
          // its own queue.
          upNext={link() ? null : upNext()}
          episodes={link() ? null : episodes()}
          party={link()}
          onBack={back}
          onUnplayable={() => setStopped({ unplayable: true })}
          onFailed={(cause) => setStopped({ unplayable: false, cause })}
          onProgress={(report) => sendProgress(itemId, report)}
          onPickTracks={(pick) =>
            void client.playback.pickTracks({ itemId, ...pick }).catch(() => {})
          }
        />
      )}
    </Show>
  )
}

/** The spinner while the first answer is on its way, or why nothing plays. */
function WatchFailed(props: {
  waiting: boolean
  unplayable: boolean
  container: string | null | undefined
  failure: unknown
}) {
  const refusal = () =>
    props.unplayable ? null : playbackRefusal(props.failure)
  return (
    <div class="fixed inset-0 grid place-items-center bg-black p-6 text-white">
      <Show
        when={!props.waiting}
        fallback={<Spinner class="size-10 text-white/85" />}
      >
        <div class="max-w-md text-center">
          <h1 class="text-2xl font-semibold tracking-tight">
            {props.unplayable
              ? tr("player.unsupported")
              : refusal() === "restricted"
                ? tr("player.restricted")
                : refusal() === "busy"
                  ? tr("player.busy")
                  : tr("player.loadFailed")}
          </h1>
          <p class="mt-2 text-sm text-white/70">
            {props.unplayable
              ? props.container
                ? tr("player.unsupportedDetail", {
                    container: props.container.toUpperCase(),
                  })
                : tr("player.unsupportedDetailUnknown")
              : errorMessage(props.failure)}
          </p>
          <Link
            to="/"
            class={buttonVariants({ variant: "outline", class: "mt-6" })}
          >
            {tr("player.backHome")}
          </Link>
        </div>
      </Show>
    </div>
  )
}
