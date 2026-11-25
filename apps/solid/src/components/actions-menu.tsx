import type { MediaItem, Season, TitleSummary } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { getRouteApi, useNavigate } from "@tanstack/solid-router"
import { Ellipsis, EyeOff, Image, RefreshCw, RotateCcw, Search } from "lucide"
import { createMemo, Show } from "solid-js"

import { cardIconButton } from "@/components/card-actions"
import { useDeferredMenu } from "@/components/deferred-menu"
import {
  DownloadDialog,
  DownloadFilesDialog,
  DownloadMenuItem,
  useDownloadsAllowed,
} from "@/components/download-dialog"
import { titleActionButton } from "@/components/favorite-button"
import {
  IdentifyDialog,
  invalidateTitleData,
} from "@/components/identify-dialog"
import { PartyMenuItem } from "@/components/party/party-menu-item"
import {
  ImageEditorDialog,
  type ImageOwner,
} from "@/components/title/image-editor"
import { useLibraryProvider } from "@/components/title/library-provider"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { seasonName } from "@/lib/media"
import { type PartyRole, usePartyRole } from "@/lib/party"
import { can } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createTitleActionsStore } from "@/stores/title-actions"

/*
 * The "⋯" menu of a movie, show, season, or episode, the same on its card
 * and its page: what has no button of its own.
 * Marking watched and favorites have the tick and the heart beside it.
 * A file the viewer stopped partway into can play from the start.
 * In a watch party, a file can go to its queue, or be proposed for it.
 * Everyone gets Download…; admins also get fix match and refresh, which
 * act on the movie or show, and the image editor for what the menu is of.
 * Those need the whole title, which loads when they open. A recommended
 * title's card adds "Not interested" at the end.
 */

const authed = getRouteApi("/_authed")

/** Bare over a card's picture, or a round button beside Play. */
export type MenuLook = "card" | "page"

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
  const file = fileOf(target)
  const progress = file?.progress
  if (!progress || progress.completed || progress.positionSeconds <= 0) {
    return null
  }
  return file
}

/**
 * The one file the menu is of, which a watch party can queue: an episode,
 * or a movie's file. A show or a season is many.
 */
function fileOf(target: ActionsTarget): MediaItem | null {
  if (target.kind === "item") return target.item
  if (target.kind === "title" && target.title.kind === "movie") {
    return target.file ?? null
  }
  return null
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

/** What a menu holds before it asks the server anything. */
type MenuPlan = {
  scope: Scope
  /** The file Play from the start plays. */
  restart: MediaItem | null
  /** The file a watch party can queue, while the viewer is in one. */
  party: { role: PartyRole; file: MediaItem } | null
  admin: boolean
  /** Whose images the editor edits, for an admin. */
  images: ImageOwner | null
  /** "Not interested", for a recommended title. */
  dismiss: (() => void) | null
  look: MenuLook
}

function triggerClass(look: MenuLook, extra: string | undefined) {
  return look === "card"
    ? cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        cardIconButton,
        extra,
      )
    : cn(
        buttonVariants({ variant: "secondary", size: "icon-lg" }),
        titleActionButton,
        extra,
      )
}

function MenuIcon(props: { look: MenuLook }) {
  return (
    <Icon
      icon={Ellipsis}
      class={props.look === "card" ? "size-5" : undefined}
    />
  )
}

/**
 * The menu of a movie, show, season, or file. The menu and its dialogs
 * mount once someone reaches for its button.
 */
export function ActionsMenu(props: {
  target: ActionsTarget
  look: MenuLook
  /** "Not interested", for a title the viewer was recommended. */
  dismiss?: () => void
  /** For the trigger, to place it. */
  class?: string
}) {
  const context = authed.useRouteContext()
  const role = usePartyRole()
  const plan = createMemo<MenuPlan>(() => {
    // What the menu calls an admin's: fixing a match, refreshing, images.
    const admin = can(context().user, "title.update")
    const scope = scopeOf(props.target)
    const file = fileOf(props.target)
    const party = role()
    return {
      scope,
      restart: restartable(props.target),
      party: party && file ? { role: party, file } : null,
      admin,
      images: admin && scope.title ? scope.images : null,
      dismiss: props.dismiss ?? null,
      look: props.look,
    }
  })
  // Most menus hold something whatever the server says: playing from the
  // start, or an admin's image editor. Only the rest ask it before
  // showing a trigger.
  const known = () => {
    const current = plan()
    return Boolean(
      current.restart || current.party || current.images || current.dismiss,
    )
  }
  return (
    <Show
      when={known()}
      fallback={<CheckedActionsMenu plan={plan()} class={props.class} />}
    >
      <DeferredActionsMenu plan={plan()} class={props.class} />
    </Show>
  )
}

/**
 * A menu that holds only what the server allows: Download, when the
 * account may, and an admin's fix match and refresh, when the library has
 * a provider. An account that may do neither gets no menu.
 */
function CheckedActionsMenu(props: { plan: MenuPlan; class?: string }) {
  const downloads = useDownloadsAllowed(true)
  const provider = useLibraryProvider(
    () => props.plan.scope.libraryId,
    () => props.plan.admin && props.plan.scope.title !== null,
  )
  return (
    <Show when={downloads() || provider()}>
      <DeferredActionsMenu plan={props.plan} class={props.class} />
    </Show>
  )
}

/**
 * The trigger alone until someone reaches for it, then the menu. Apart
 * from {@link ActionsMenu}, so a menu that goes away and comes back starts
 * bare again.
 */
function DeferredActionsMenu(props: { plan: MenuPlan; class?: string }) {
  const deferred = useDeferredMenu()
  const label = () => tr("media.moreActions", { name: props.plan.scope.name })
  return (
    <Show
      when={deferred.mounted()}
      fallback={
        <button
          type="button"
          aria-label={label()}
          class={triggerClass(props.plan.look, props.class)}
          aria-haspopup={deferred.bare["aria-haspopup"]}
          aria-expanded="false"
          onPointerEnter={deferred.bare.onPointerEnter}
          onFocus={deferred.bare.onFocus}
          onClick={deferred.bare.onClick}
        >
          <MenuIcon look={props.plan.look} />
        </button>
      }
    >
      <MountedActionsMenu
        plan={props.plan}
        label={label()}
        class={props.class}
        defaultOpen={deferred.defaultOpen()}
        focusRef={deferred.focusRef}
      />
    </Show>
  )
}

/**
 * {@link ActionsMenu} once someone reaches for it. Whether the account may
 * download and the library's provider load from then, before the press
 * that opens it, and their items join the menu when they arrive.
 */
function MountedActionsMenu(props: {
  plan: MenuPlan
  label: string
  class?: string
  defaultOpen: boolean
  focusRef: (element: HTMLElement) => void
}) {
  const owner = () => props.plan.scope.title
  const provider = useLibraryProvider(
    () => props.plan.scope.libraryId,
    () => props.plan.admin && owner() !== null,
  )
  // Set when the user can fix the match and refresh.
  const adminProvider = () =>
    (props.plan.admin && owner() ? provider() : null) ?? null
  const downloads = useDownloadsAllowed()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Kept after closing, so the dialogs can animate out. Null until one
  // first opens, so none mounts before then.
  const store = createTitleActionsStore()
  // Keep the title in Query so refreshes also reach an open dialog.
  const full = useQuery(() => ({
    ...orpc.titles.get.queryOptions({ input: { id: store.titleId() ?? "" } }),
    enabled: store.titleId() !== null,
  }))
  const fullTitle = () => (full.isSuccess ? full.data : undefined)

  const load = (title: TitleSummary) =>
    queryClient.ensureQueryData(
      orpc.titles.get.queryOptions({ input: { id: title.id } }),
    )
  const loadFailed = (title: TitleSummary, cause: unknown) =>
    toast.error(tr("media.loadFailed", { name: title.name }), {
      description: errorMessage(cause),
    })
  const startDownload = async () => {
    const download = props.plan.scope.download
    if (download.kind === "file") store.setFile(download.item)
    if (download.kind === "movie") {
      try {
        const found = (await load(download.title)).next
        if (!found) {
          toast.error(tr("media.noFiles", { name: download.title.name }))
          return
        }
        store.setFile(found)
      } catch (cause) {
        loadFailed(download.title, cause)
        return
      }
    }
    store.setDownloading(true)
  }
  /** Loads the whole movie or show, then opens a dialog for it. */
  const withTitle = async (
    title: TitleSummary,
    open: (value: boolean) => void,
  ) => {
    try {
      await load(title)
      store.setTitleId(title.id)
      open(true)
    } catch (cause) {
      loadFailed(title, cause)
    }
  }
  const refresh = useMutation(() => ({
    mutationFn: (title: TitleSummary) =>
      client.titles.refresh({ id: title.id }),
    onSuccess: async (_result, title) => {
      await invalidateTitleData(queryClient)
      toast.success(tr("title.refresh.done", { name: title.name }), {
        description: tr("title.refresh.doneDescription", {
          provider: adminProvider()?.name ?? "",
        }),
      })
    },
    onError: (error: Error) =>
      toast.error(tr("title.refresh.error"), {
        description: errorMessage(error),
      }),
  }))

  const adminItems = () =>
    adminProvider() !== null || props.plan.images !== null
  const playItems = () => Boolean(props.plan.restart || props.plan.party)
  return (
    <>
      <DropdownMenu defaultOpen={props.defaultOpen}>
        <DropdownMenuTrigger
          ref={props.focusRef}
          aria-label={props.label}
          class={triggerClass(props.plan.look, props.class)}
        >
          <MenuIcon look={props.plan.look} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={props.plan.look === "page" ? "start" : "end"}
          sideOffset={props.plan.look === "page" ? 6 : 4}
          // As wide as its items, rather than its small trigger, so none wraps.
          class="w-max min-w-48 whitespace-nowrap"
        >
          <Show when={props.plan.restart}>
            {(restart) => (
              <DropdownMenuItem
                onSelect={() =>
                  void navigate({
                    to: "/watch/$itemId",
                    params: { itemId: restart().id },
                    search: { start: 0 },
                  })
                }
              >
                <Icon icon={RotateCcw} />
                {tr("media.playFromStart")}
              </DropdownMenuItem>
            )}
          </Show>
          <Show when={props.plan.party}>
            {(party) => (
              <PartyMenuItem
                item={party().file}
                name={props.plan.scope.name}
                role={party().role}
              />
            )}
          </Show>
          <Show when={playItems() && (downloads() || adminItems())}>
            <DropdownMenuSeparator />
          </Show>
          <Show when={downloads()}>
            <DownloadMenuItem onSelect={() => void startDownload()} />
          </Show>
          <Show when={downloads() && adminItems()}>
            <DropdownMenuSeparator />
          </Show>
          <Show when={adminProvider() && owner()}>
            {(title) => (
              <>
                <DropdownMenuItem
                  onSelect={() => void withTitle(title(), store.setIdentifying)}
                >
                  <Icon icon={Search} />
                  {tr("title.menu.fixMatch")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={refresh.isPending}
                  onSelect={() => refresh.mutate(title())}
                >
                  <Icon icon={RefreshCw} />
                  {tr("title.menu.refresh")}
                </DropdownMenuItem>
              </>
            )}
          </Show>
          <Show when={props.plan.images && owner()}>
            {(title) => (
              <DropdownMenuItem
                onSelect={() => void withTitle(title(), store.setEditingImages)}
              >
                <Icon icon={Image} />
                {tr("title.menu.editImages")}
              </DropdownMenuItem>
            )}
          </Show>
          <Show when={props.plan.dismiss}>
            {(dismiss) => (
              <>
                <Show when={playItems() || downloads() || adminItems()}>
                  <DropdownMenuSeparator />
                </Show>
                <DropdownMenuItem onSelect={() => dismiss()()}>
                  <Icon icon={EyeOff} />
                  {tr("discover.notInterested")}
                </DropdownMenuItem>
              </>
            )}
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>
      <Show when={store.downloading() !== null}>
        <Show
          when={
            props.plan.scope.download.kind === "files" &&
            props.plan.scope.download
          }
          fallback={
            <Show when={store.file()}>
              {(file) => (
                <DownloadDialog
                  item={file()}
                  name={props.plan.scope.name}
                  open={store.downloading() ?? false}
                  onOpenChange={store.setDownloading}
                />
              )}
            </Show>
          }
        >
          {(download) => (
            <DownloadFilesDialog
              title={download().title}
              season={download().season}
              name={props.plan.scope.name}
              open={store.downloading() ?? false}
              onOpenChange={store.setDownloading}
            />
          )}
        </Show>
      </Show>
      <Show when={adminProvider() && fullTitle()}>
        {(title) => (
          <IdentifyDialog
            title={title()}
            providerName={adminProvider()?.name ?? ""}
            open={store.identifying()}
            onOpenChange={store.setIdentifying}
          />
        )}
      </Show>
      <Show when={props.plan.images && fullTitle()}>
        {(title) => (
          <Show when={props.plan.images}>
            {(images) => (
              <ImageEditorDialog
                title={title()}
                owner={images()}
                name={props.plan.scope.name}
                open={store.editingImages()}
                onOpenChange={store.setEditingImages}
              />
            )}
          </Show>
        )}
      </Show>
    </>
  )
}
