import {
  mediaHlsPath,
  mediaPlaybackPath,
  mediaStreamPath,
  RPC_PATH,
  type Subtitles,
  subtitlePath,
  type TrackPicks,
  trickplayTilePath,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { useDocumentTitle } from "@/components/page-header"
import { probeAudioOf } from "@/components/playback-source"
import type { UpNext } from "@/components/up-next"
import type { ProgressReport } from "@/components/use-progress-report"
import { VideoPlayer } from "@/components/video-player"
import { tr } from "@/i18n"
import { itemLabel } from "@/lib/media"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"
import { decodesVideo } from "@/lib/video-support"

const WatchSearch = t.object({
  /**
   * Seconds to start at instead of where the viewer left off, as 0 for
   * Play from the start.
   */
  start: t.number().min(0).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/watch/$itemId")({
  validateSearch: WatchSearch,
  // What the player needs before it can pick a source, asked for while its
  // code loads, and on hover over a play button.
  loader: ({ context: { queryClient }, params: { itemId } }) => {
    const input = { input: { id: itemId } }
    void queryClient.prefetchQuery(orpc.media.get.queryOptions(input))
    void queryClient.prefetchQuery(orpc.media.audio.queryOptions(input))
    void queryClient.prefetchQuery(orpc.media.subtitles.queryOptions(input))
    void queryClient.prefetchQuery(tracksQuery(itemId))
  },
  component: Watch,
})

const NO_SUBTITLES: Subtitles = { tracks: [], audioLanguage: null }
const NO_PICKS: TrackPicks = { audio: null, subtitle: null }

/**
 * The tracks picked before in a file. Picks change while the player is
 * open, and another file's may match, so they're read anew every time.
 */
function tracksQuery(itemId: string) {
  return orpc.playback.tracks.queryOptions({
    input: { itemId },
    staleTime: 0,
  })
}

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
  const router = useRouter()
  const queryClient = useQueryClient()
  const item = useQuery({
    ...orpc.media.get.queryOptions({ input: { id: itemId } }),
    // The resume point must be current, not from an earlier visit.
    staleTime: 0,
  })
  // Playback starts without waiting for these; tracks join when they arrive.
  const subtitles = useQuery(
    orpc.media.subtitles.queryOptions({ input: { id: itemId } }),
  )
  const audio = useQuery(
    orpc.media.audio.queryOptions({ input: { id: itemId } }),
  )
  // The player picks its first tracks once, so it waits for these.
  const picks = useQuery(tracksQuery(itemId))
  const picksReady = picks.isFetchedAfterMount || picks.isError
  // What the server encodes to, so the player's notices can say.
  useQuery(orpc.playback.options.queryOptions({ staleTime: 5 * 60_000 }))
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
  const [unsupported, setUnsupported] = useState(false)
  const label = item.data ? itemLabel(item.data) : null
  const pageTitle = label?.title

  const progress = item.data?.progress
  const startAt =
    start ??
    (progress && !progress.completed ? progress.positionSeconds : undefined)

  // The show's next episode, which the player offers once this one ends.
  const show = item.data?.title?.kind === "show" ? item.data.title : null
  const episodes = useQuery(
    orpc.titles.items.queryOptions({
      input: show ? { id: show.id } : skipToken,
    }),
  )
  const index = episodes.data?.findIndex((each) => each.id === itemId) ?? -1
  const next = index >= 0 ? episodes.data?.[index + 1] : undefined
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
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: orpc.home.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.profiles.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.stats.key() })
    },
    [queryClient],
  )

  const back = () => {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: "/" })
  }

  if (item.data && label && !unsupported && picksReady) {
    const probe = item.data.probe
    return (
      <VideoPlayer
        key={item.data.id}
        src={mediaStreamPath(item.data.id)}
        streamSrc={(request) => mediaPlaybackPath(itemId, request)}
        hlsSrc={(request) => mediaHlsPath(itemId, request)}
        keyframes={(seconds) => client.media.keyframes({ id: itemId, seconds })}
        // A failed list means no tracks to switch between, not a broken player.
        audioTracks={audio.isError ? [] : audio.data}
        probeAudio={probe ? probeAudioOf(probe) : undefined}
        originalLanguage={item.data.title?.originalLanguage ?? null}
        durationSeconds={
          item.data.durationSeconds ?? probe?.format.durationSeconds ?? null
        }
        videoSize={
          probe?.video
            ? { width: probe.video.width, height: probe.video.height }
            : null
        }
        videoCodec={probe?.video?.codec ?? null}
        videoPlays={decodesVideo(probe?.video)}
        file={{
          container: item.data.container,
          sizeBytes: item.data.sizeBytes,
          probe,
        }}
        title={label.title}
        subtitle={
          label.code
            ? `${label.code} · ${label.showName}`
            : item.data.title
              ? (label.year ?? "")
              : label.groupLabel.join(" · ")
        }
        // A failed list means no tracks, not a broken player.
        subtitles={subtitles.isError ? NO_SUBTITLES : subtitles.data}
        subtitleSrc={(trackId) => subtitlePath(itemId, trackId)}
        trickplay={
          trickplayImages && {
            images: trickplayImages,
            src: (tile) => trickplayTilePath(itemId, trickplayImages.key, tile),
          }
        }
        startAt={startAt}
        upNext={upNext}
        onBack={back}
        onUnsupported={() => setUnsupported(true)}
        onProgress={(report) => sendProgress(itemId, report)}
        // A failed read plays by the preferences.
        rememberedTracks={picks.data ?? NO_PICKS}
        onPickTracks={(pick) =>
          void client.playback.pickTracks({ itemId, ...pick }).catch(() => {})
        }
      />
    )
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-black p-6 text-white">
      {item.isPending || (item.data && !picksReady) ? (
        <Spinner className="size-8" />
      ) : (
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {unsupported ? tr("player.unsupported") : tr("player.loadFailed")}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {unsupported
              ? item.data
                ? tr("player.unsupportedDetail", {
                    container: item.data.container.toUpperCase(),
                  })
                : tr("player.unsupportedDetailUnknown")
              : errorMessage(item.error)}
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
