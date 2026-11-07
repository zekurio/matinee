import {
  mediaHlsPath,
  mediaPlaybackPath,
  mediaStreamPath,
  RPC_PATH,
  type Subtitles,
  subtitlePath,
  trickplayTilePath,
} from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { useDocumentTitle } from "@/components/page-header"
import { probeAudioOf } from "@/components/playback-source"
import type { ProgressReport } from "@/components/use-progress-report"
import { VideoPlayer } from "@/components/video-player"
import { tr } from "@/i18n"
import { itemLabel } from "@/lib/media"
import { client, errorMessage, liveQuery, orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/watch/$itemId")({
  component: Watch,
})

const NO_SUBTITLES: Subtitles = { tracks: [], audioLanguage: null }

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
    progress && !progress.completed ? progress.positionSeconds : undefined

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

  if (item.data && label && !unsupported) {
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
        onBack={back}
        onUnsupported={() => setUnsupported(true)}
        onProgress={(report) => sendProgress(itemId, report)}
      />
    )
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-black p-6 text-white">
      {item.isPending ? (
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
