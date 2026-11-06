import { mediaStreamPath, RPC_PATH } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { type ProgressReport, VideoPlayer } from "@/components/video-player"
import { itemLabel } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/watch/$itemId")({
  component: Watch,
})

function formatClock(seconds: number): string {
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
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
  const [unsupported, setUnsupported] = useState(false)
  // Bumping this remounts the player from the start.
  const [restarts, setRestarts] = useState(0)
  const label = item.data ? itemLabel(item.data) : null
  const pageTitle = label?.title

  const progress = item.data?.progress
  const startAt =
    restarts === 0 && progress && !progress.completed
      ? progress.positionSeconds
      : undefined

  useEffect(() => {
    if (pageTitle) document.title = `${pageTitle} · Matinee`
    return () => {
      document.title = "Matinee"
    }
  }, [pageTitle])

  // Home's rows and title pages depend on what was just watched.
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: orpc.home.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
    },
    [queryClient],
  )

  const back = () => {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: "/" })
  }

  if (item.data && label && !unsupported) {
    return (
      <VideoPlayer
        key={`${item.data.id}:${restarts}`}
        src={mediaStreamPath(item.data.id)}
        title={label.title}
        subtitle={
          label.code
            ? `${label.code} · ${label.showName}`
            : item.data.title && item.data.title.kind !== "folder"
              ? (label.year ?? "")
              : label.groupLabel.join(" · ")
        }
        startAt={startAt}
        onBack={back}
        onUnsupported={() => setUnsupported(true)}
        onProgress={(report) => sendProgress(itemId, report)}
        onResumed={(seconds) =>
          // Say where playback resumed, with a way back to the start.
          toast(`Resumed at ${formatClock(seconds)}`, {
            // Clear of the control bar at the bottom.
            position: "top-center",
            action: {
              label: "Start over",
              onClick: () => setRestarts((n) => n + 1),
            },
          })
        }
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
            {unsupported
              ? "This browser can't play this file"
              : "Couldn't load this title"}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {unsupported
              ? `Matinee plays files as they are for now, and this browser doesn't support ${item.data?.container.toUpperCase() ?? "this"} files or the codecs inside. Transcoding is planned.`
              : errorMessage(item.error)}
          </p>
          <Link
            to="/"
            className={buttonVariants({
              variant: "secondary",
              className: "mt-6",
            })}
          >
            Back to Home
          </Link>
        </div>
      )}
    </div>
  )
}
