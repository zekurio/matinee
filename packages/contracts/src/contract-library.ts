import { eventIterator, oc } from "@orpc/contract"

import { del, get, post, put } from "./contract-routes"
import { t } from "./schema"
import {
  AudioTrack,
  BrowsedTitles,
  IdInput,
  Keyframes,
  Library,
  LibraryInput,
  MediaItem,
  MetadataMatch,
  MetadataProvider,
  Person,
  SearchInput,
  SearchResults,
  ShelfEntry,
  Subtitles,
  Title,
  TitleFacets,
  TitleFilter,
  TitleKind,
  TitleList,
} from "./schemas"
import { TrickplayStatus } from "./trickplay"

export const librariesContract = oc.tag("Libraries").router({
  list: get("/libraries").output(t.array(Library)),
  get: get("/libraries/{id}").input(IdInput).output(Library),
  create: post("/libraries").input(LibraryInput).output(Library),
  update: put("/libraries/{id}")
    .input(LibraryInput.extend({ id: t.uuid() }))
    .output(Library),
  remove: del("/libraries/{id}").input(IdInput).output(t.void()),
  scan: post("/libraries/{id}/scan").input(IdInput).output(t.void()),
  /** Fetch metadata again for every title, matched or not. */
  refreshMetadata: post("/libraries/{id}/refresh-metadata")
    .input(IdInput)
    .output(t.void()),
})

export const metadataContract = oc.tag("Metadata").router({
  /** Every provider the server knows, configured or not. */
  providers: get("/metadata/providers").output(t.array(MetadataProvider)),
})

/** One box that looks through everything a user can open. */
export const searchContract = oc.tag("Search").router({
  query: get("/search").input(SearchInput).output(SearchResults),
})

export const peopleContract = oc.tag("People").router({
  /** Someone in the cast or crew of a title, and everything they're in. */
  get: get("/people/{name}")
    .input(t.object({ name: t.string().trim().min(1).max(200) }))
    .output(Person),
})

export const titlesContract = oc.tag("Titles").router({
  /** The movies or shows in a library. */
  list: get("/libraries/{libraryId}/titles")
    .input(TitleFilter.extend({ libraryId: t.uuid() }))
    .output(TitleList),
  /**
   * Titles from every library, such as a genre's or a studio's. The
   * query matches names only, not paths as in a library's list.
   */
  browse: get("/titles").input(TitleFilter).output(BrowsedTitles),
  /**
   * The genres and studios in a library, or in every library without
   * `libraryId`, for picking a filter.
   */
  facets: get("/titles/facets")
    .input(
      t.object({ libraryId: t.uuid().optional(), kind: TitleKind.optional() }),
    )
    .output(TitleFacets),
  get: get("/titles/{id}").input(IdInput).output(Title),
  /**
   * A title's files in episode order. `season` narrows to one season;
   * null picks the files without a season number. A POST in REST, since a
   * query string can't carry that null.
   */
  items: post("/titles/{id}/items")
    .input(
      t.object({
        id: t.uuid(),
        season: t.number().int().min(0).nullable().optional(),
      }),
    )
    .output(t.array(MediaItem)),
  /** Search the library's provider, to fix a wrong or missing match. */
  findMatches: get("/titles/{id}/matches")
    .input(
      t.object({
        id: t.uuid(),
        query: t.string().trim().min(1, "Enter a name to search for.").max(200),
        year: t.number().int().min(1870).max(2200).optional(),
      }),
    )
    .output(t.array(MetadataMatch)),
  /** Match the title to a provider result and fetch its metadata. */
  identify: post("/titles/{id}/identify")
    .input(t.object({ id: t.uuid(), providerId: t.string().min(1).max(64) }))
    .output(Title),
  /** Fetch the title's metadata again now. */
  refresh: post("/titles/{id}/refresh").input(IdInput).output(Title),
})

export const mediaContract = oc.tag("Media").router({
  list: get("/libraries/{libraryId}/media")
    .input(
      t.object({
        libraryId: t.uuid(),
        query: t.string().trim().max(200).optional(),
        /** Only files under this folder of the library, such as a show. */
        folder: t.string().trim().min(1).max(500).optional(),
        /**
         * `recent` puts the folders with the newest files first, and keeps
         * each folder's files in file-name order.
         */
        sort: t.enum(["title", "recent"]).$default("title"),
        limit: t.number().int().min(1).max(500).$default(100),
        offset: t.number().int().min(0).$default(0),
      }),
    )
    .output(t.object({ items: t.array(MediaItem), total: t.number().int() })),
  get: get("/media/{id}").input(IdInput).output(MediaItem),
  /**
   * A file's subtitle tracks: files beside it and streams inside it.
   * A file the background probe hasn't reached yet is probed first, so
   * that call can take a moment.
   */
  subtitles: get("/media/{id}/subtitles").input(IdInput).output(Subtitles),
  /** A file's audio tracks, in file order. Probes the file like `subtitles`. */
  audio: get("/media/{id}/audio").input(IdInput).output(t.array(AudioTrack)),
  /**
   * Where `mediaPlaybackPath()` can start near `seconds` with the `original`
   * quality, which copies the video and so starts on a keyframe.
   */
  keyframes: get("/media/{id}/keyframes")
    .input(t.object({ id: t.uuid(), seconds: t.number().min(0) }))
    .output(Keyframes),
  /**
   * The seek bar's preview images, as a stream that ends once it has an
   * answer. A file without images moves to the front of the queue for
   * them, and the stream stays open while they're made: `pending` first,
   * then `ready` or `unavailable`. Over REST it's server-sent events. The
   * server also ends a stream every few minutes; while it was `pending`,
   * reconnect to keep waiting.
   */
  trickplay: get("/media/{id}/trickplay")
    .input(IdInput)
    .output(eventIterator(TrickplayStatus)),
  /**
   * The newest titles in a library, with how many files each has and
   * when it last grew.
   */
  shelf: get("/libraries/{libraryId}/shelf")
    .input(
      t.object({
        libraryId: t.uuid(),
        limit: t.number().int().min(1).max(24).$default(8),
      }),
    )
    .output(t.array(ShelfEntry)),
})
