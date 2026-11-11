import { ORPCError } from "@matinee/client"
import {
  PLAYBACK_BUSY,
  PLAYBACK_RESTRICTED,
  PLAYBACK_UNPLAYABLE,
  type PlaybackDevice,
  type PlaybackQuality,
  type PlaybackStart,
} from "@matinee/contracts"
import { queryOptions } from "@tanstack/react-query"

import { loadHls } from "@/components/use-hls"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { playbackDevice } from "./playback-device"
import { randomId } from "./random-id"
import { client } from "./rpc"

/** The first answer for a sitting with a file, and what it was asked with. */
export type FirstStart = {
  sessionId: string
  device: PlaybackDevice
  /** The quality this device's settings start with. */
  quality: PlaybackQuality
  plan: PlaybackStart
}

/**
 * How a file starts playing here, asked for by the watch page's loader so
 * it runs while the page loads. `start` is where to begin in place of the
 * resume point. The sitting's id is made with the request, so a request
 * made on hover over a play button serves the click after it. Nothing
 * asks again while the player is open, and the player drops the answer as
 * it closes, so the next visit asks anew.
 */
export function startQuery(itemId: string, start: number | undefined) {
  const device = playbackDevice()
  const { quality } = usePlayerPreferencesStore.getState()
  return queryOptions({
    queryKey: ["player", "start", itemId, { start, quality, device }],
    queryFn: async (): Promise<FirstStart> => {
      const sessionId = randomId()
      const plan = await client.playback.start({
        itemId,
        sessionId,
        device,
        quality,
        position: start,
      })
      // An encode plays through hls.js, which loads with the answer.
      if (plan.hls) void loadHls()
      return { sessionId, device, quality, plan }
    },
    staleTime: Infinity,
    // An answer asked for on hover that nobody played goes soon.
    gcTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** Every start answer the watch page may hold for a file. */
export function startQueryKey(itemId: string) {
  return ["player", "start", itemId]
}

/** The server found nothing this device plays. */
export function isUnplayable(cause: unknown): boolean {
  return cause instanceof ORPCError && cause.code === PLAYBACK_UNPLAYABLE
}

/**
 * Why the account may not play the file now: its access rules out every
 * way left, or it plays on as many devices as it may. Asking again gets
 * the same answer, so the player shows the server's message and stops.
 */
export type PlaybackRefusal = "restricted" | "busy"

export function playbackRefusal(cause: unknown): PlaybackRefusal | null {
  if (!(cause instanceof ORPCError)) return null
  if (cause.code === PLAYBACK_RESTRICTED) return "restricted"
  if (cause.code === PLAYBACK_BUSY) return "busy"
  return null
}
