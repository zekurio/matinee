import { RPC_PATH, trickplayTilePath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { useDocumentTitle } from "@/components/page-header"
import type { UpNext } from "@/components/up-next"
import type { ProgressReport } from "@/components/use-progress-report"
import { VideoPlayer } from "@/components/video-player"
import { tr } from "@/i18n"
import { itemLabel } from "@/lib/media"
import {
  type FirstStart,
  isUnplayable,
  playbackRefusal,
  startQuery,
  startQueryKey,
} from "@/lib/playback-start"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"

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
  if (report.leaving) {
    void fetch(`${RPC_PATH}/playback/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {})
    return
  }
  void client.playback.report(input).catch(() => {})
}

function Watch() {
  const { itemId } = Route.useParams()
  const { start } = Route.useSearch()
  // Another file, as the next episode, starts over.
  return <WatchItem key={itemId} itemId={itemId} start={start} />
}

function WatchItem({
  itemId,
  start,
}: {
  itemId: string
  start: number | undefined
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  // The first answer, which the player starts from and keeps. The ones
  // after it are the player's own.
  const started = useQuery(startQuery(itemId, start))
  const [first, setFirst] = useState<FirstStart | null>(null)
  if (first === null && started.data) setFirst(started.data)
  const [stopped, setStopped] = useState<
    { unplayable: true } | { unplayable: false; cause: unknown } | null
  >(null)
  const unplayable = stopped ? stopped.unplayable : isUnplayable(started.error)
  // The file's container, for saying why nothing plays, when the first
  // answer didn't come with it.
  const item = useQuery({
    ...orpc.media.get.queryOptions({ input: { id: itemId } }),
    enabled: unplayable && first === null,
  })
  // The stream ends once the images are there or won't come. Only one that
  // ended while they were being made opens again.
  const trickplay = useQuery({
    ...orpc.media.trickplay.experimental_liveOptions({ input: { id: itemId } }),
    ...liveQuery,
    refetchInterval: (query) =>
      query.state.data?.status === "pending"
        ? liveQuery.refetchInterval(query)
        : false,
  })
  const trickplayImages =
    trickplay.data?.status === "ready" ? trickplay.data.images : null
  const playing = first?.plan.item
  const label = playing ? itemLabel(playing) : null
  const pageTitle = label?.title

  // The show's next episode, which the player offers once this one ends.
  const next = first?.plan.next
  const nextLabel = next ? itemLabel(next) : null
  const upNext: UpNext | null =
    next && nextLabel
      ? {
          name: nextLabel.code
            ? `${nextLabel.code} · ${nextLabel.title}`
            : nextLabel.title,
          // In place of this one, so back still leaves the player.
          play: () =>
            void router.navigate({
              to: "/watch/$itemId",
              params: { itemId: next.id },
              replace: true,
            }),
        }
      : null

  useDocumentTitle(pageTitle)

  // Home's rows, title pages, and statistics depend on what was just watched.
  // The next visit asks anew, for a new sitting from where this one ends.
  // A remount under StrictMode asks again too, and keeps the first answer.
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: startQueryKey(itemId) })
      void queryClient.invalidateQueries({ queryKey: orpc.home.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.profiles.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.stats.key() })
    },
    [queryClient, itemId],
  )

  const back = () => {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: "/" })
  }

  if (first && playing && label && !stopped) {
    return (
      <VideoPlayer
        start={first}
        title={label.title}
        subtitle={
          label.code
            ? `${label.code} · ${label.showName}`
            : playing.title
              ? (label.year ?? "")
              : label.groupLabel.join(" · ")
        }
        trickplay={
          trickplayImages && {
            images: trickplayImages,
            src: (tile) => trickplayTilePath(itemId, trickplayImages.key, tile),
          }
        }
        upNext={upNext}
        onBack={back}
        onUnplayable={() => setStopped({ unplayable: true })}
        onFailed={(cause) => setStopped({ unplayable: false, cause })}
        onProgress={(report) => sendProgress(itemId, report)}
        onPickTracks={(pick) =>
          void client.playback.pickTracks({ itemId, ...pick }).catch(() => {})
        }
      />
    )
  }

  const container = item.data?.container ?? playing?.container
  const failure = stopped && !stopped.unplayable ? stopped.cause : started.error
  const refusal = unplayable ? null : playbackRefusal(failure)
  return (
    <div className="fixed inset-0 grid place-items-center bg-black p-6 text-white">
      {!first && started.isPending ? (
        <Spinner className="size-8" />
      ) : (
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {unplayable
              ? tr("player.unsupported")
              : refusal === "restricted"
                ? tr("player.restricted")
                : refusal === "busy"
                  ? tr("player.busy")
                  : tr("player.loadFailed")}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {unplayable
              ? container
                ? tr("player.unsupportedDetail", {
                    container: container.toUpperCase(),
                  })
                : tr("player.unsupportedDetailUnknown")
              : errorMessage(failure)}
          </p>
          <Link
            to="/"
            className={buttonVariants({
              variant: "secondary",
              className: "mt-6",
            })}
          >
            {tr("player.backHome")}
          </Link>
        </div>
      )}
    </div>
  )
}
