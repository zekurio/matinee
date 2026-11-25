import { flagAt, numberAt, oneOf, textAt } from "../lib/decode"
import { Observable } from "../lib/observable"
import { readStored, writeStored } from "../lib/storage"

const KEY = "matinee.tv.player"

export const SUBTITLE_COLORS = ["white", "yellow", "cyan", "green"] as const
export type SubtitleColor = (typeof SUBTITLE_COLORS)[number]

/** What sits behind each line of a subtitle. */
export const SUBTITLE_BACKGROUNDS = ["none", "shaded", "black"] as const
export type SubtitleBackground = (typeof SUBTITLE_BACKGROUNDS)[number]

export const SUBTITLE_EDGES = ["shadow", "outline", "none"] as const
export type SubtitleEdge = (typeof SUBTITLE_EDGES)[number]

/** How much bigger than normal subtitles draw. */
export const SUBTITLE_SCALES = [0.75, 1, 1.25, 1.5, 2] as const

/** Lets the player pick a codec, as the web's `auto` choice does. */
export const AUTOMATIC = "auto"

type Stored = {
  quality: string
  videoCodec: string
  autoplayNext: boolean
  fillScreen: boolean
  subtitleScale: number
  subtitleColor: SubtitleColor
  subtitleBackground: SubtitleBackground
  subtitleEdge: SubtitleEdge
}

/**
 * What the player keeps on this TV, as the web keeps it per browser: the
 * quality videos start in, the codec encodes come in, and how subtitles
 * look. Languages and skips follow the account instead.
 */
export class PlayerPrefs extends Observable {
  private stored: Stored

  constructor() {
    super()
    const saved = readStored(KEY)
    this.stored = {
      // The server answers with the nearest quality the account may use,
      // so one over its limit stays saved for when it's lifted.
      quality: textAt(saved, "quality") ?? "original",
      videoCodec: textAt(saved, "videoCodec") ?? AUTOMATIC,
      autoplayNext: flagAt(saved, "autoplayNext") ?? true,
      fillScreen: flagAt(saved, "fillScreen") ?? false,
      subtitleScale: numberAt(saved, "subtitleScale") ?? 1,
      subtitleColor: oneOf(
        SUBTITLE_COLORS,
        textAt(saved, "subtitleColor"),
        "white",
      ),
      subtitleBackground: oneOf(
        SUBTITLE_BACKGROUNDS,
        textAt(saved, "subtitleBackground"),
        "shaded",
      ),
      subtitleEdge: oneOf(
        SUBTITLE_EDGES,
        textAt(saved, "subtitleEdge"),
        "shadow",
      ),
    }
  }

  get value(): Readonly<Stored> {
    return this.stored
  }

  set(change: Partial<Stored>) {
    this.stored = { ...this.stored, ...change }
    writeStored(KEY, this.stored)
    this.changed()
  }
}

/** The one set of player preferences the TV has. */
export const playerPrefs = new PlayerPrefs()
