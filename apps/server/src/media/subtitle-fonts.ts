import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"

import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { matroskaFonts } from "./matroska-subtitles"

const dir = join(env.dataDir, "subtitles", "fonts")
const fonts = defineQueue<{ key: string; path: string }, void>({
  id: "subtitle-fonts",
  name: "Subtitle fonts",
  description:
    "Extract Matroska font attachments without reading video blocks.",
  concurrency: 1,
  key: (job) => job.key,
  label: (job) => job.key,
  run: async (job) => {
    await mkdir(dir, { recursive: true })
    const data = await matroskaFonts(job.path)
    // One atomic cache file bounds the cache entry and avoids partial manifests.
    const file = join(dir, job.key)
    const tmp = `${file}.${process.pid}.tmp`
    const header = Buffer.alloc(4 + 4 * data.length)
    header.writeUInt32BE(data.length)
    data.forEach((font, i) => header.writeUInt32BE(font.length, 4 + i * 4))
    await writeFile(tmp, Buffer.concat([header, ...data]))
    await rename(tmp, file)
    const prefix = `${job.key.slice(0, 36)}-`
    for (const name of await readdir(dir)) {
      if (name.startsWith(prefix) && name !== job.key) {
        await rm(join(dir, name), { force: true })
      }
    }
  },
})

/** The caller has checked access to this media item. */
export async function itemFonts(item: MediaItemRow) {
  const info = await stat(item.path)
  const key = `${item.id}-${Math.floor(info.mtimeMs)}-${info.size}`
  const file = join(dir, key)
  if (!(await stat(file).catch(() => null))) {
    await fonts.run({ key, path: item.path }, { priority: "high" })
  }
  const bytes = await readFile(file)
  const count = bytes.readUInt32BE(0)
  const result: Buffer[] = []
  let at = 4 + count * 4
  for (let i = 0; i < count; i++) {
    const length = bytes.readUInt32BE(4 + i * 4)
    result.push(bytes.subarray(at, at + length))
    at += length
  }
  return { key, fonts: result }
}
