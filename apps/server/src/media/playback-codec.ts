import type { TranscodeVideoCodec } from "@matinee/contracts"

/** The first codec the player wants that the server can make. */
export function playbackVideoCodec(
  wanted: readonly TranscodeVideoCodec[],
  encodable: readonly string[],
): TranscodeVideoCodec {
  return wanted.find((codec) => encodable.includes(codec)) ?? "h264"
}
