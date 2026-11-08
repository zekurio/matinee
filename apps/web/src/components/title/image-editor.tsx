import {
  IMAGE_TYPES,
  type ImageSlot,
  type ImageTarget,
  ImageUpload,
  type ItemImage,
  type RemoteImage,
  type Title,
  TITLE_IMAGE_SLOTS,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { cn } from "@matinee/ui/lib/utils"
import {
  partialMatchKey,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { CheckIcon, ImageUpIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { useId, useRef, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Picture, tone } from "@/components/picture"
import { tr, translateKnown } from "@/i18n"
import { languageName } from "@/lib/languages"
import { art, present } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { useLibraryProvider } from "./library-provider"

/** Whose images: the title's own, or one of its seasons' or episodes'. */
export type ImageOwner =
  | { kind: "title" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number }

/** What the editor needs of the movie or show. */
type Owner = Pick<Title, "id" | "libraryId" | "providerId">

const ASPECTS = {
  poster: "aspect-[2/3]",
  backdrop: "aspect-video",
  logo: "aspect-video",
  still: "aspect-video",
} satisfies Record<ImageSlot, string>

const GRIDS = {
  poster: "grid-cols-3 sm:grid-cols-5",
  backdrop: "grid-cols-2 sm:grid-cols-3",
  logo: "grid-cols-2 sm:grid-cols-3",
  still: "grid-cols-2 sm:grid-cols-3",
} satisfies Record<ImageSlot, string>

function slotsOf(owner: ImageOwner): readonly ImageSlot[] {
  if (owner.kind === "title") return TITLE_IMAGE_SLOTS
  return owner.kind === "season" ? ["poster"] : ["still"]
}

function targetOf(title: Owner, owner: ImageOwner): ImageTarget {
  if (owner.kind === "title") return { id: title.id }
  if (owner.kind === "season") return { id: title.id, season: owner.season }
  return { id: title.id, season: owner.season, episode: owner.episode }
}

function slotName(slot: ImageSlot): string {
  switch (slot) {
    case "poster":
      return tr("title.images.slot.poster")
    case "backdrop":
      return tr("title.images.slot.backdrop")
    case "logo":
      return tr("title.images.slot.logo")
    case "still":
      return tr("title.images.slot.still")
  }
}

/**
 * Refetch what shows the title's images. The provider's choices stay, as
 * a pick doesn't change them and asking again costs provider requests.
 */
function refetchShown(queryClient: QueryClient) {
  const remote = orpc.titles.remoteImages.key()
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpc.titles.key(),
      predicate: (query) => !partialMatchKey(query.queryKey, remote),
    }),
    queryClient.invalidateQueries({ queryKey: orpc.media.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
  ])
}

/**
 * Pick the images of a title, season, or episode from what the library's
 * provider has, or upload them, as Jellyfin's image editor does. What an
 * admin picks stays through refreshes.
 */
export function ImageEditorDialog({
  title,
  owner,
  name,
  open,
  onOpenChange,
}: {
  /** The movie or show, or the show the season or episode is in. */
  title: Owner
  owner: ImageOwner
  /** What the images are of, for the description. */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-5 p-6 sm:max-w-3xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        {open && <ImageEditor title={title} owner={owner} name={name} />}
      </DialogContent>
    </Dialog>
  )
}

function ImageEditor({
  title,
  owner,
  name,
}: {
  title: Owner
  owner: ImageOwner
  name: string
}) {
  const slots = slotsOf(owner)
  const [slot, setSlot] = useState<ImageSlot>(slots[0] ?? "poster")
  const target = targetOf(title, owner)
  const images = useQuery(orpc.titles.images.queryOptions({ input: target }))
  const provider = useLibraryProvider(title.libraryId)
  // One without its API key has nothing to list either.
  const providerName = provider?.configured ? provider.name : null

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("title.images.title")}
        </DialogTitle>
        <DialogDescription>
          {providerName
            ? tr("title.images.description", { name, provider: providerName })
            : tr("title.images.descriptionLocal", { name })}
        </DialogDescription>
      </DialogHeader>

      {images.isError ? (
        <FormAlert
          message={tr("title.images.loadError", {
            error: errorMessage(images.error),
          })}
        />
      ) : provider === undefined ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          {/* Each slot with the image it has, which also picks the slot to
              change. Phones scroll the row sideways. */}
          <div
            role="group"
            aria-label={tr("title.images.slots")}
            className="-mx-6 -my-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-6 py-1 [&::-webkit-scrollbar]:hidden"
          >
            {slots.map((each) => (
              <SlotCard
                key={each}
                slot={each}
                current={images.data?.find((image) => image.slot === each)}
                toneKey={title.id}
                providerName={providerName}
                selected={each === slot}
                onSelect={slots.length > 1 ? () => setSlot(each) : null}
              />
            ))}
          </div>
          {/* A new slot starts over, with its own language switch. */}
          <SlotPanel
            key={slot}
            title={title}
            target={target}
            slot={slot}
            current={images.data?.find((image) => image.slot === slot)}
            providerName={providerName}
          />
        </>
      )}
    </>
  )
}

/**
 * A slot's name and the image it has, all at one height whatever the
 * image's shape. With several slots, it's the button that picks one.
 */
function SlotCard({
  slot,
  current,
  toneKey,
  providerName,
  selected,
  onSelect,
}: {
  slot: ImageSlot
  /** Undefined while loading. */
  current: ItemImage | undefined
  toneKey: string
  providerName: string | null
  selected: boolean
  onSelect: (() => void) | null
}) {
  const body = (
    <>
      <span
        className={cn(
          "relative h-14 shrink-0 overflow-hidden rounded-md border",
          ASPECTS[slot],
          tone(toneKey),
        )}
      >
        <Picture
          sources={present(art(current?.image, "thumb"))}
          className={slot === "logo" ? "object-contain p-1" : undefined}
        />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-medium">{slotName(slot)}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {current ? stateText(slot, current, providerName) : "\u00a0"}
        </span>
      </span>
    </>
  )
  const card = "flex shrink-0 items-center gap-3 rounded-lg border p-1.5 pr-4"
  if (!onSelect) {
    return <div className={cn(card, "border-foreground/10")}>{body}</div>
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        card,
        "focus-visible:ring-ring outline-none focus-visible:ring-2",
        selected
          ? "border-primary bg-primary/10"
          : "border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.04]",
      )}
    >
      {body}
    </button>
  )
}

type Change =
  | { kind: "set"; imageId: string | null }
  | { kind: "upload"; file: File }
  | { kind: "reset" }

/** One slot: the image it has, what to do with it, and the choices. */
function SlotPanel({
  title,
  target,
  slot,
  current,
  providerName,
}: {
  title: Owner
  target: ImageTarget
  slot: ImageSlot
  /** Undefined while loading. */
  current: ItemImage | undefined
  providerName: string | null
}) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const switchId = useId()
  const [allLanguages, setAllLanguages] = useState(false)
  // A provider lists images only for an entry the title matched.
  const provider = title.providerId ? providerName : null
  const remote = useQuery({
    ...orpc.titles.remoteImages.queryOptions({
      input: { ...target, slot, allLanguages },
    }),
    enabled: provider !== null,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const change = useMutation({
    mutationFn: (action: Change) => {
      const input = { ...target, slot }
      if (action.kind === "upload") {
        return client.titles.uploadImage({ ...input, file: action.file })
      }
      if (action.kind === "reset") return client.titles.resetImage(input)
      return client.titles.setImage({ ...input, imageId: action.imageId })
    },
    onSuccess: async (images) => {
      queryClient.setQueryData(
        orpc.titles.images.queryKey({ input: target }),
        images,
      )
      await refetchShown(queryClient)
    },
    onError: (error) =>
      toast.error(tr("title.images.error"), {
        description: errorMessage(error),
      }),
  })

  const upload = (file: File) => {
    const checked = ImageUpload.safeParse(file)
    if (!checked.success) {
      toast.error(tr("title.images.error"), {
        description: translateKnown(checked.error.issues[0]?.message ?? ""),
      })
      return
    }
    change.mutate({ kind: "upload", file })
  }

  // What's on its way to the server, to show a spinner on.
  const busy = change.isPending ? change.variables : undefined
  const removing = busy?.kind === "set" && busy.imageId === null

  return (
    <div className="-mx-6 flex min-h-0 flex-1 flex-col border-t">
      {/* One line for every slot, so what's below doesn't move. Phones
          show the buttons' icons only. */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-6">
        <Button
          variant="secondary"
          size="sm"
          aria-label={tr("title.images.upload")}
          disabled={change.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {busy?.kind === "upload" ? <Spinner /> : <ImageUpIcon />}
          <span className="max-sm:hidden">{tr("title.images.upload")}</span>
        </Button>
        {current?.image && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={tr("title.images.remove")}
            disabled={change.isPending}
            onClick={() => change.mutate({ kind: "set", imageId: null })}
          >
            {removing ? <Spinner /> : <Trash2Icon />}
            <span className="max-sm:hidden">{tr("title.images.remove")}</span>
          </Button>
        )}
        {current?.chosen && provider && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={tr("title.images.reset", { provider })}
            disabled={change.isPending}
            onClick={() => change.mutate({ kind: "reset" })}
          >
            {busy?.kind === "reset" ? <Spinner /> : <RotateCcwIcon />}
            <span className="max-sm:hidden">
              {tr("title.images.reset", { provider })}
            </span>
          </Button>
        )}
        {provider && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <label
              id={`${switchId}-label`}
              htmlFor={switchId}
              className="text-muted-foreground text-sm whitespace-nowrap"
            >
              {tr("title.images.allLanguages")}
            </label>
            <Switch
              id={switchId}
              aria-labelledby={`${switchId}-label`}
              size="sm"
              checked={allLanguages}
              onCheckedChange={(checked) => setAllLanguages(checked)}
            />
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) upload(file)
          }}
        />
      </div>

      {provider ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
          {remote.isPending ? (
            <div className="grid flex-1 place-items-center">
              <Spinner className="size-5" />
            </div>
          ) : remote.isError ? (
            <FormAlert message={errorMessage(remote.error)} />
          ) : remote.data.length === 0 ? (
            <p className="text-muted-foreground grid flex-1 place-items-center text-center text-sm">
              {allLanguages
                ? tr("title.images.empty", { provider })
                : tr("title.images.emptyLanguage", { provider })}
            </p>
          ) : (
            <ul className={cn("grid gap-3 pt-1", GRIDS[slot])}>
              {remote.data.map((image) => (
                <li key={image.id}>
                  <Choice
                    image={image}
                    slot={slot}
                    toneKey={title.id}
                    inUse={image.id === current?.image?.id}
                    pending={busy?.kind === "set" && busy.imageId === image.id}
                    disabled={change.isPending}
                    onPick={() =>
                      change.mutate({ kind: "set", imageId: image.id })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground grid flex-1 place-items-center px-6 pb-6 text-center text-sm">
          {providerName
            ? tr("title.images.unmatched", { provider: providerName })
            : tr("title.images.noProvider")}
        </p>
      )}
    </div>
  )
}

/** "Picked from TMDB", "Uploaded", "None", and so on. */
function stateText(
  slot: ImageSlot,
  current: ItemImage,
  providerName: string | null,
): string {
  if (current.image === null) {
    if (current.chosen) return tr("title.images.state.removed")
    return slot === "still"
      ? tr("title.images.state.noneFrame")
      : tr("title.images.state.none")
  }
  if (current.uploaded) return tr("title.images.state.uploaded")
  if (!providerName) return tr("title.images.state.picked")
  return current.chosen
    ? tr("title.images.state.pickedFrom", { provider: providerName })
    : tr("title.images.state.from", { provider: providerName })
}

/** "1000 × 1500 · English", from what the provider says. */
function caption(image: RemoteImage, slot: ImageSlot): string {
  const size =
    image.width && image.height
      ? tr("title.images.size", {
          width: String(image.width),
          height: String(image.height),
        })
      : null
  // Stills have no text to speak of, whatever the provider says.
  const language =
    slot === "still"
      ? null
      : image.language
        ? languageName(image.language)
        : tr("title.images.noText")
  return [size, language].filter(Boolean).join(" · ")
}

function Choice({
  image,
  slot,
  toneKey,
  inUse,
  pending,
  disabled,
  onPick,
}: {
  image: RemoteImage
  slot: ImageSlot
  toneKey: string
  inUse: boolean
  pending: boolean
  disabled: boolean
  onPick: () => void
}) {
  const text = caption(image, slot)
  return (
    <button
      type="button"
      aria-pressed={inUse}
      disabled={disabled}
      onClick={onPick}
      className="group focus-visible:ring-ring focus-visible:ring-offset-background flex w-full flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default"
    >
      <span
        className={cn(
          "relative w-full overflow-hidden rounded-md border transition-colors",
          ASPECTS[slot],
          tone(toneKey),
          inUse
            ? "border-primary ring-primary ring-1"
            : "group-hover:border-foreground/30",
        )}
      >
        <Picture
          sources={present(art(image.preview))}
          className={slot === "logo" ? "object-contain p-2" : undefined}
        />
        {inUse && (
          <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full">
            <CheckIcon className="size-3.5" />
          </span>
        )}
        {pending && (
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-white">
            <Spinner />
          </span>
        )}
      </span>
      {text && (
        <span className="text-muted-foreground truncate text-xs tabular-nums">
          {text}
        </span>
      )}
      <span className="sr-only">
        {inUse ? tr("title.images.inUse") : tr("title.images.use")}
      </span>
    </button>
  )
}
