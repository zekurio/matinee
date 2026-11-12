import { writeFile } from "node:fs/promises"

import { t } from "@matinee/contracts/schema"

import { indexedSubtitles } from "./matroska-subtitles"
import { movieSubtitleIndex } from "./movie-subtitles"

// Separate process so ionice applies to source reads, not just ffmpeg,
// without lowering the server's playback reads or its shared fs workers.
const [mode, source, destination, ...tracks] = t
  .array(t.string())
  .parse(process.argv.slice(2))
if (!source || !destination) throw new Error("Missing subtitle worker paths")
const streams = t.array(t.coerce.number().int().min(0).max(10000)).parse(tracks)
if (mode === "movie") {
  const index = await movieSubtitleIndex(source)
  process.stdout.write(
    `${JSON.stringify({ bytesRead: index.bytesRead, streams: index.usable ? streams : [] })}\n`,
  )
} else {
  let bytesRead = 0
  const small = await indexedSubtitles(source, streams, undefined, (bytes) => {
    bytesRead = bytes
  })
  if (small) await writeFile(destination, small.bytes)
  process.stdout.write(
    `${JSON.stringify({ bytesRead, streams: small?.streams ?? [] })}\n`,
  )
}
