import type { MediaItem, Season, Title, TitleSummary } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  EllipsisIcon,
  ImageIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react"
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useState,
} from "react"

import { cardIconButton } from "@/components/card-actions"
import { useDeferredMenu } from "@/components/deferred-menu"
import {
  DownloadDialog,
  DownloadFilesDialog,
  DownloadMenuItem,
  useDownloadsAllowed,
} from "@/components/download-dialog"
import { FavoriteMenuItem, useItemFavorite } from "@/components/favorite-button"
import {
  IdentifyDialog,
  invalidateTitleData,
} from "@/components/identify-dialog"
import {
  ImageEditorDialog,
  type ImageOwner,
} from "@/components/title/image-editor"
import { useLibraryProvider } from "@/components/title/library-provider"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { useItemWatched, WatchedMenuItems } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { seasonName } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

/*
 * The "⋯" menu of a movie, show, season, or episode, the same on its card,
 * its page, and its row in a folder: what has no button of its own.
 * Marking watched and favorites have the tick and the heart beside it.
 * A file the viewer stopped partway into can play from the start.
 * Everyone gets Download…; admins also get fix match and refresh, which
 * act on the movie or show, and the image editor for what the menu is of.
 * Those need the whole title, which loads when they open.
 */

const authed = getRouteApi("/_authed")

/**
 * Bare over a card's picture, a round button beside Play, or a small one
 * at the end of a row that shows on hover.
 */
export type MenuLook = "card" | "page" | "row"

/** What the menu is for. */
export type ActionsTarget =
  | {
      /** A movie or show. */
      kind: "title"
      title: TitleSummary
      /** The file Play starts, when known. */
      file?: MediaItem | null
    }
  | {
      /** One season of a show. */
      kind: "season"
      title: TitleSummary
      season: Season
    }
  | {
      /** One file: an episode, or a movie's. */
      kind: "item"
      item: MediaItem
      /** The episode or movie, for screen readers and the dialogs. */
      name: string
    }

/** What Download… saves. */
type Download =
  /** One file. */
  | { kind: "file"; item: MediaItem }
  /** The file Play starts for a movie, once the title loads. */
  | { kind: "movie"; title: TitleSummary }
  /** Every file of a show, or of one season, as it is. */
  | { kind: "files"; title: TitleSummary; season?: number | null }

/** What each action of the menu works on. */
type Scope = {
  /** Names it for screen readers and the dialogs. */
  name: string
  libraryId: string
  /** The movie or show, which fix match and refresh act on. */
  title: TitleSummary | null
  download: Download
  /** Whose images the editor edits, if anyone's. */
  images: ImageOwner | null
}

/** A movie's file has the movie's images, an episode its still. */
function itemImages(item: MediaItem): ImageOwner | null {
  if (!item.title) return null
  if (item.title.kind === "movie") return { kind: "title" }
  if (item.seasonNumber === null || item.episodeNumber === null) return null
  return {
    kind: "episode",
    season: item.seasonNumber,
    episode: item.episodeNumber,
  }
}

/**
 * The file Play from the start plays: an episode or movie the viewer
 * stopped partway into. A show's next episode isn't the show, so a show's
 * menu has none.
 */
function restartable(target: ActionsTarget): MediaItem | null {
  const file =
    target.kind === "item"
      ? target.item
      : target.kind === "title" && target.title.kind === "movie"
        ? (target.file ?? null)
        : null
  const progress = file?.progress
  if (!progress || progress.completed || progress.positionSeconds <= 0) {
    return null
  }
  return file
}

function titleDownload(
  title: TitleSummary,
  file: MediaItem | null | undefined,
): Download {
  if (title.kind === "show") return { kind: "files", title }
  return file ? { kind: "file", item: file } : { kind: "movie", title }
}

function scopeOf(target: ActionsTarget): Scope {
  switch (target.kind) {
    case "title":
      return {
        name: target.title.name,
        libraryId: target.title.libraryId,
        title: target.title,
        download: titleDownload(target.title, target.file),
        images: { kind: "title" },
      }
    case "season":
      return {
        name: tr("title.seasonOf", {
          show: target.title.name,
          season: seasonName(target.season.number),
        }),
        libraryId: target.title.libraryId,
        title: target.title,
        download: {
          kind: "files",
          title: target.title,
          season: target.season.number,
        },
        // Files without a season number aren't a season to give a poster.
        images:
          target.season.number === null
            ? null
            : { kind: "season", season: target.season.number },
      }
    case "item":
      return {
        name: target.name,
        libraryId: target.item.libraryId,
        title: target.item.title,
        download: { kind: "file", item: target.item },
        images: itemImages(target.item),
      }
  }
}

const pageButton =
  "border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11"

const rowButton =
  "text-muted-foreground opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100 [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:opacity-100"

/**
 * The trigger's button, for `render`. An element, not a component: the
 * trigger hands it the icon, its handlers, and its state as props. `props`
 * go on it as well, as the bare button's before the menu mounts.
 */
function triggerButton(
  look: MenuLook,
  label: string,
  className: string | undefined,
  props?: ComponentProps<typeof Button>,
  icon?: ReactNode,
): ReactElement {
  switch (look) {
    case "card":
      return (
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          {...props}
          className={cn(cardIconButton, className)}
        >
          {icon}
        </Button>
      )
    case "page":
      return (
        <Button
          variant="secondary"
          size="icon-lg"
          aria-label={label}
          {...props}
          className={cn(pageButton, className)}
        >
          {icon}
        </Button>
      )
    case "row":
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          {...props}
          className={cn(rowButton, className)}
        >
          {icon}
        </Button>
      )
  }
}

/**
 * The menu of a movie, show, season, or file. Items in `children` come
 * first, as a folder row's watched and favorite. The menu and its dialogs
 * mount once someone reaches for its button.
 */
export function ActionsMenu({
  target,
  look,
  className,
  children,
}: {
  target: ActionsTarget
  look: MenuLook
  /** For the trigger, to place it. */
  className?: string
  children?: ReactNode
}) {
  const { user } = authed.useRouteContext()
  const admin = user.role === "admin"
  const scope = scopeOf(target)
  const plan = {
    scope,
    restart: restartable(target),
    admin,
    images: admin && scope.title ? scope.images : null,
    look,
    children,
  }
  // Most menus hold something whatever the server says: playing from the
  // start, a row's own items, or an admin's image editor. Only the rest
  // ask it before showing a trigger.
  if (plan.restart || children || plan.images) {
    return <DeferredActionsMenu {...plan} className={className} />
  }
  return <CheckedActionsMenu {...plan} className={className} />
}

/** What a menu holds before it asks the server anything. */
type MenuPlan = {
  scope: Scope
  /** The file Play from the start plays. */
  restart: MediaItem | null
  admin: boolean
  /** Whose images the editor edits, for an admin. */
  images: ImageOwner | null
  look: MenuLook
  children?: ReactNode
}

/**
 * A menu that holds only what the server allows: Download, when the
 * account may, and an admin's fix match and refresh, when the library has
 * a provider. An account that may do neither gets no menu.
 */
function CheckedActionsMenu({
  className,
  ...plan
}: MenuPlan & { className: string | undefined }) {
  const downloads = useDownloadsAllowed(true)
  const owner = plan.admin ? plan.scope.title : null
  const provider = useLibraryProvider(plan.scope.libraryId, owner !== null)
  if (!downloads && !provider) return null
  return <DeferredActionsMenu {...plan} className={className} />
}

/**
 * The trigger alone until someone reaches for it, then the menu. Apart
 * from {@link ActionsMenu}, so a menu that goes away and comes back starts
 * bare again.
 */
function DeferredActionsMenu({
  className,
  ...plan
}: MenuPlan & { className: string | undefined }) {
  const deferred = useDeferredMenu()
  const label = tr("media.moreActions", { name: plan.scope.name })
  const icon = (
    <EllipsisIcon className={plan.look === "card" ? "size-5" : undefined} />
  )
  if (!deferred.mounted) {
    return triggerButton(plan.look, label, className, deferred.bare, icon)
  }
  return (
    <MountedActionsMenu
      {...plan}
      trigger={triggerButton(plan.look, label, className, {
        ref: deferred.focusRef,
      })}
      icon={icon}
      defaultOpen={deferred.defaultOpen}
    />
  )
}

/**
 * {@link ActionsMenu} once someone reaches for it. Whether the account may
 * download and the library's provider load from then, before the press
 * that opens it, and their items join the menu when they arrive.
 */
function MountedActionsMenu({
  scope,
  restart,
  admin,
  images,
  look,
  children,
  trigger,
  icon,
  defaultOpen,
}: MenuPlan & {
  trigger: ReactElement
  icon: ReactNode
  defaultOpen: boolean
}) {
  const owner = scope.title
  const provider = useLibraryProvider(scope.libraryId, admin && owner !== null)
  // Set when the user can fix the match and refresh.
  const adminProvider = (admin && owner ? provider : null) ?? null
  const downloads = useDownloadsAllowed()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Kept after closing, so the dialogs can animate out. Null until one
  // first opens, so none mounts before then.
  const [file, setFile] = useState<MediaItem | null>(null)
  const [downloading, setDownloading] = useState<boolean | null>(null)
  const [full, setFull] = useState<Title | null>(null)
  const [identifying, setIdentifying] = useState(false)
  const [editingImages, setEditingImages] = useState(false)

  const load = (title: TitleSummary) =>
    queryClient.ensureQueryData(
      orpc.titles.get.queryOptions({ input: { id: title.id } }),
    )
  const loadFailed = (title: TitleSummary, cause: unknown) =>
    toast.error(tr("media.loadFailed", { name: title.name }), {
      description: errorMessage(cause),
    })
  const startDownload = async () => {
    const download = scope.download
    if (download.kind === "file") setFile(download.item)
    if (download.kind === "movie") {
      try {
        const found = (await load(download.title)).next
        if (!found) {
          toast.error(tr("media.noFiles", { name: download.title.name }))
          return
        }
        setFile(found)
      } catch (cause) {
        loadFailed(download.title, cause)
        return
      }
    }
    setDownloading(true)
  }
  /** Loads the whole movie or show, then opens a dialog for it. */
  const withTitle = async (
    title: TitleSummary,
    open: (value: boolean) => void,
  ) => {
    try {
      setFull(await load(title))
      open(true)
    } catch (cause) {
      loadFailed(title, cause)
    }
  }
  const refresh = useMutation({
    mutationFn: (title: TitleSummary) =>
      client.titles.refresh({ id: title.id }),
    onSuccess: async (_, title) => {
      await invalidateTitleData(queryClient)
      toast.success(tr("title.refresh.done", { name: title.name }), {
        description: tr("title.refresh.doneDescription", {
          provider: adminProvider?.name ?? "",
        }),
      })
    },
    onError: (error) =>
      toast.error(tr("title.refresh.error"), {
        description: errorMessage(error),
      }),
  })

  const adminItems = Boolean(adminProvider) || images !== null
  const playItems = Boolean(restart || children)
  return (
    <>
      <DropdownMenu defaultOpen={defaultOpen}>
        <DropdownMenuTrigger render={trigger}>{icon}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={look === "page" ? "start" : "end"}
          sideOffset={look === "page" ? 6 : 4}
          // As wide as its items, rather than its small trigger, so none wraps.
          className="w-max min-w-48 whitespace-nowrap"
        >
          {restart && (
            <DropdownMenuItem
              onClick={() =>
                void navigate({
                  to: "/watch/$itemId",
                  params: { itemId: restart.id },
                  search: { start: 0 },
                })
              }
            >
              <RotateCcwIcon />
              {tr("media.playFromStart")}
            </DropdownMenuItem>
          )}
          {children}
          {playItems && (downloads || adminItems) && <DropdownMenuSeparator />}
          {downloads && (
            <DownloadMenuItem onSelect={() => void startDownload()} />
          )}
          {downloads && adminItems && <DropdownMenuSeparator />}
          {owner && adminProvider && (
            <>
              <DropdownMenuItem
                onClick={() => void withTitle(owner, setIdentifying)}
              >
                <SearchIcon />
                {tr("title.menu.fixMatch")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={refresh.isPending}
                onClick={() => refresh.mutate(owner)}
              >
                <RefreshCwIcon />
                {tr("title.menu.refresh")}
              </DropdownMenuItem>
            </>
          )}
          {owner && images && (
            <DropdownMenuItem
              onClick={() => void withTitle(owner, setEditingImages)}
            >
              <ImageIcon />
              {tr("title.menu.editImages")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {downloading !== null &&
        (scope.download.kind === "files" ? (
          <DownloadFilesDialog
            title={scope.download.title}
            season={scope.download.season}
            name={scope.name}
            open={downloading}
            onOpenChange={setDownloading}
          />
        ) : (
          file && (
            <DownloadDialog
              item={file}
              name={scope.name}
              open={downloading}
              onOpenChange={setDownloading}
            />
          )
        ))}
      {adminProvider && full && (
        <IdentifyDialog
          title={full}
          providerName={adminProvider.name}
          open={identifying}
          onOpenChange={setIdentifying}
        />
      )}
      {images && full && (
        <ImageEditorDialog
          title={full}
          owner={images}
          name={scope.name}
          open={editingImages}
          onOpenChange={setEditingImages}
        />
      )}
    </>
  )
}

/**
 * The "⋯" at the end of a file's row in a folder list: the file's
 * {@link ActionsMenu}, after marking it watched or a favorite, since the
 * row has no tick or heart. Pointers that hover see it on hover and
 * focus, inside a `group/item`; touch screens always do.
 */
export function ItemMenu({
  item,
  label,
  className,
}: {
  item: MediaItem
  /** Names the file for screen readers. */
  label: string
  className?: string
}) {
  const watched = useItemWatched(item)
  const favorite = useItemFavorite(item)
  // Null until "Other date" is first picked, so the dialog mounts then.
  const [picking, setPicking] = useState<boolean | null>(null)
  return (
    <>
      <ActionsMenu
        target={{ kind: "item", item, name: label }}
        look="row"
        className={className}
      >
        <WatchedMenuItems
          scope="as"
          watched={watched.on}
          started={watched.on || item.progress !== null}
          onSelect={watched.mark}
          onPickDate={() => setPicking(true)}
        />
        <DropdownMenuSeparator />
        <FavoriteMenuItem favorite={favorite} />
      </ActionsMenu>
      {picking !== null && (
        <WatchedDateDialog
          open={picking}
          onOpenChange={setPicking}
          onPick={(watchedAt) => watched.mark(true, watchedAt)}
        />
      )}
    </>
  )
}
