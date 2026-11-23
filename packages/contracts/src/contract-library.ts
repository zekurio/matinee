import { eventIterator, oc } from "@orpc/contract"

import { del, get, post, put } from "./contract-routes"
import { DownloadResolveInput, DownloadResolution } from "./download-resolve"
import { Download, DownloadPlan, DownloadSpecInput } from "./downloads"
import { Person, PersonInput } from "./people"
import { t } from "./schema"
import {
  AudioTrack,
  BrowsedTitles,
  IdInput,
  ImageSlot,
  ImageTarget,
  ImageUpload,
  ItemImage,
  Keyframes,
  Library,
  LibraryInput,
  MediaItem,
  MetadataLanguageChoice,
  MetadataMatch,
  MetadataProvider,
  RemoteImage,
  SearchInput,
  SearchResults,
  ShelfEntry,
  Subtitles,
  Title,
  TitleFacets,
  TitleFilterOptions,
  TitleKind,
  TitleList,
  TitleQuery,
  TitleScope,
} from "./schemas"
import { TrickplayStatus } from "./trickplay"

export const librariesContract = oc.tag("Libraries").router({
  /** The libraries the account may open. */
  list: get("/libraries", "library.read").output(t.array(Library)),
  get: get("/libraries/{id}", "library.read").input(IdInput).output(Library),
  create: post("/libraries", "library.create")
    .input(LibraryInput)
    .output(Library),
  update: put("/libraries/{id}", "library.update")
    .input(LibraryInput.extend({ id: t.uuid() }))
    .output(Library),
  remove: del("/libraries/{id}", "library.delete")
    .input(IdInput)
    .output(t.void()),
  scan: post("/libraries/{id}/scan", "library.scan")
    .input(IdInput)
    .output(t.void()),
  /** Fetch metadata again for every title, matched or not. */
  refreshMetadata: post("/libraries/{id}/refresh-metadata", "library.scan")
    .input(IdInput)
    .output(t.void()),
})

export const metadataContract = oc.tag("Metadata").router({
  /** Every provider the server knows, configured or not. */
  providers: get("/metadata/providers", "library.read").output(
    t.array(MetadataProvider),
  ),
  /**
   * The languages a library's form offers. A new library starts on the
   * one in the client's own language, else on the first. A library saved
   * with another keeps it.
   */
  languages: get("/metadata/languages", "library.read").output(
    t.array(MetadataLanguageChoice),
  ),
})

/** One box that looks through everything a user can open. */
export const searchContract = oc.tag("Search").router({
  query: get("/search", "title.read").input(SearchInput).output(SearchResults),
})

export const peopleContract = oc.tag("People").router({
  /** Someone in the cast or crew of a title, and everything they're in. */
  get: get("/people/{name}", "title.read").input(PersonInput).output(Person),
})

export const titlesContract = oc.tag("Titles").router({
  /**
   * The movies or shows in a library, filtered and sorted. A POST in
   * REST, since a query string can't carry the filters' lists and nulls.
   */
  list: post("/libraries/{libraryId}/titles/browse", "title.read")
    .input(TitleQuery.extend({ libraryId: t.uuid() }))
    .output(TitleList),
  /**
   * Titles from every library, such as a genre's or a studio's, or from
   * the one `libraryId` names. The query matches names, and paths too
   * within one library, as in a library's list.
   */
  browse: post("/titles/browse", "title.read")
    .input(TitleQuery.extend({ libraryId: t.uuid().optional() }))
    .output(BrowsedTitles),
  /**
   * What each of `list`'s and `browse`'s filters offers for the titles in
   * a scope, with how many titles have each choice.
   */
  filterOptions: get("/titles/filter-options", "title.read")
    .input(TitleScope)
    .output(TitleFilterOptions),
  /**
   * The genres and studios in a library, or in every library without
   * `libraryId`, for picking a filter.
   */
  facets: get("/titles/facets", "title.read")
    .input(
      t.object({ libraryId: t.uuid().optional(), kind: TitleKind.optional() }),
    )
    .output(TitleFacets),
  get: get("/titles/{id}", "title.read").input(IdInput).output(Title),
  /**
   * A title's files in episode order. `season` narrows to one season;
   * null picks the files without a season number. A POST in REST, since a
   * query string can't carry that null.
   */
  items: post("/titles/{id}/items", "title.read")
    .input(
      t.object({
        id: t.uuid(),
        season: t.number().int().min(0).nullable().optional(),
      }),
    )
    .output(t.array(MediaItem)),
  /** Search the library's provider, to fix a wrong or missing match. */
  findMatches: get("/titles/{id}/matches", "title.update")
    .input(
      t.object({
        id: t.uuid(),
        query: t
          .string()
          .trim()
          .min(1, "Enter a name to search for.")
          .max(200, "Use at most 200 characters."),
        year: t.number().int().min(1870).max(2200).optional(),
      }),
    )
    .output(t.array(MetadataMatch)),
  /** Match the title to a provider result and fetch its metadata. */
  identify: post("/titles/{id}/identify", "title.update")
    .input(t.object({ id: t.uuid(), providerId: t.string().min(1).max(64) }))
    .output(Title),
  /** Fetch the title's metadata again now. */
  refresh: post("/titles/{id}/refresh", "title.update")
    .input(IdInput)
    .output(Title),
  /**
   * The images of the title, of one of its seasons, or of one of its
   * episodes, and which of them an admin chose. A movie or show has a
   * poster, backdrop, and logo, a season a poster, an episode a still.
   */
  images: get("/titles/{id}/images", "title.update")
    .input(ImageTarget)
    .output(t.array(ItemImage)),
  /**
   * What the library's provider has for one image, best first: in the
   * library's language, then English, then without text. `allLanguages`
   * adds the rest. Empty while the title has no match.
   */
  remoteImages: get("/titles/{id}/images/{slot}/remote", "title.update")
    .input(
      ImageTarget.extend({
        slot: ImageSlot,
        allLanguages: t.boolean().$default(false),
      }),
    )
    .output(t.array(RemoteImage)),
  /**
   * Use one of `remoteImages`, or no image with null. Fetching the
   * metadata again keeps it, until a fix match picks another entry.
   */
  setImage: put("/titles/{id}/images/{slot}", "title.update")
    .input(
      ImageTarget.extend({
        slot: ImageSlot,
        imageId: t.string().max(64).nullable(),
      }),
    )
    .output(t.array(ItemImage)),
  /** Use an image file instead, kept like a `setImage` choice, and on a fix match too. */
  uploadImage: post("/titles/{id}/images/{slot}", "title.update")
    .input(ImageTarget.extend({ slot: ImageSlot, file: ImageUpload }))
    .output(t.array(ItemImage)),
  /**
   * Go back to the provider's image, fetching the metadata again for it.
   * A POST in REST, since a DELETE would carry the season in its body.
   */
  resetImage: post("/titles/{id}/images/{slot}/reset", "title.update")
    .input(ImageTarget.extend({ slot: ImageSlot }))
    .output(t.array(ItemImage)),
})

export const mediaContract = oc.tag("Media").router({
  list: get("/libraries/{libraryId}/media", "media.read")
    .input(
      t.object({
        libraryId: t.uuid(),
        query: t
          .string()
          .trim()
          .max(200, "Use at most 200 characters.")
          .optional(),
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
  get: get("/media/{id}", "media.read").input(IdInput).output(MediaItem),
  /**
   * A file's subtitle tracks: files beside it and streams inside it.
   * A file the background probe hasn't reached yet is probed first, so
   * that call can take a moment.
   */
  subtitles: get("/media/{id}/subtitles", "media.read")
    .input(IdInput)
    .output(Subtitles),
  /** A file's audio tracks, in file order. Probes the file like `subtitles`. */
  audio: get("/media/{id}/audio", "media.read")
    .input(IdInput)
    .output(t.array(AudioTrack)),
  /**
   * Where `mediaPlaybackPath()` can start near `seconds` with the `original`
   * quality, which copies the video and so starts on a keyframe.
   */
  keyframes: get("/media/{id}/keyframes", "media.read")
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
  trickplay: get("/media/{id}/trickplay", "media.read")
    .input(IdInput)
    .output(eventIterator(TrickplayStatus)),
  /**
   * The newest titles in a library, with how many files each has and
   * when it last grew.
   */
  shelf: get("/libraries/{libraryId}/shelf", "media.read")
    .input(
      t.object({
        libraryId: t.uuid(),
        limit: t.number().int().min(1).max(24).$default(8),
      }),
    )
    .output(t.array(ShelfEntry)),
})

/**
 * Versions of a file made for watching offline; see `downloads.ts`. The
 * file as it is needs none of these: `mediaStreamPath()` serves it.
 */
export const downloadsContract = oc.tag("Downloads").router({
  /** Resolve defaults, sizes and form choices for a device. POST carries nested wishes and nullable values. */
  resolve: post("/downloads/resolve", "media.download")
    .input(DownloadResolveInput)
    .output(t.array(DownloadResolution)),
  /**
   * What a download with `spec` would hold, and about how big it is, for
   * a dialog to show before it starts. Fails with a message to show when
   * the file can't be downloaded that way. Starts nothing.
   */
  plan: post("/media/{id}/download-plan", "media.download")
    .input(DownloadSpecInput)
    .output(DownloadPlan),
  /**
   * Set up a download, which `downloadFilePath()` or `downloadInitPath()`
   * and `downloadSegmentPath()` then fetch. The server makes it only while
   * a client fetches it. It stays resumable while the client keeps coming
   * back, and goes after a day without a request, or with `remove`.
   */
  start: post("/media/{id}/downloads", "media.download")
    .input(DownloadSpecInput)
    .output(Download),
  /** Stop a download and delete what the server still has of it. */
  remove: del("/downloads/{downloadId}", "media.download")
    .input(t.object({ downloadId: t.uuid() }))
    .output(t.void()),
})
