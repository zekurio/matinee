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
import { cn } from "@matinee/ui/lib/utils"
import {
  partialMatchKey,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query"
import { Check, ImageUp, RotateCcw, Trash2 } from "lucide"
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
} from "solid-js"

import { FormAlert } from "@/components/form-alert"
import { Picture, tone } from "@/components/picture"
import { tr, translateKnown } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { Switch as Toggle } from "@/kit/switch"
import { toast } from "@/kit/toast"
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

const ASPECTS = new Map<ImageSlot, string>([
  ["poster", "aspect-[2/3]"],
  ["backdrop", "aspect-video"],
  ["logo", "aspect-video"],
  ["still", "aspect-video"],
])

const GRIDS = new Map<ImageSlot, string>([
  ["poster", "grid-cols-3 sm:grid-cols-5"],
  ["backdrop", "grid-cols-2 sm:grid-cols-3"],
  ["logo", "grid-cols-2 sm:grid-cols-3"],
  ["still", "grid-cols-2 sm:grid-cols-3"],
])

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
export function ImageEditorDialog(props: {
  /** The movie or show, or the show the season or episode is in. */
  title: Owner
  owner: ImageOwner
  /** What the images are of, for the description. */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-5 p-6 sm:max-w-3xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        <ImageEditor
          title={props.title}
          owner={props.owner}
          name={props.name}
        />
      </DialogContent>
    </Dialog>
  )
}

function ImageEditor(props: { title: Owner; owner: ImageOwner; name: string }) {
  const slots = createMemo(() => slotsOf(props.owner))
  const [picked, setPicked] = createSignal<ImageSlot>()
  // The first slot until another is picked, and again if the owner changes.
  const slot = () => {
    const chosen = picked()
    return chosen && slots().includes(chosen)
      ? chosen
      : (slots()[0] ?? "poster")
  }
  const target = createMemo(() => targetOf(props.title, props.owner))
  const images = useQuery(() =>
    orpc.titles.images.queryOptions({ input: target() }),
  )
  const imageOf = (each: ImageSlot) =>
    images.isSuccess
      ? images.data.find((image) => image.slot === each)
      : undefined
  const provider = useLibraryProvider(() => props.title.libraryId)
  // One without its API key has nothing to list either.
  const providerName = () => {
    const found = provider()
    return found?.configured ? found.name : null
  }

  const description = () => {
    const name = providerName()
    return name
      ? tr("title.images.description", { name: props.name, provider: name })
      : tr("title.images.descriptionLocal", { name: props.name })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("title.images.title")}
        </DialogTitle>
        <DialogDescription>{description()}</DialogDescription>
      </DialogHeader>

      <Switch>
        <Match when={images.isError}>
          <FormAlert
            message={tr("title.images.loadError", {
              error: errorMessage(images.error),
            })}
          />
        </Match>
        <Match when={provider() === undefined}>
          <div class="grid flex-1 place-items-center">
            <Spinner class="size-5" />
          </div>
        </Match>
        <Match when={provider() !== undefined}>
          {/* Each slot with the image it has, which also picks the slot to
              change. Phones scroll the row sideways. */}
          <div
            role="group"
            aria-label={tr("title.images.slots")}
            class="-mx-6 -my-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-6 py-1 [&::-webkit-scrollbar]:hidden"
          >
            <For each={slots()}>
              {(each) => (
                <SlotCard
                  slot={each}
                  current={imageOf(each)}
                  toneKey={props.title.id}
                  providerName={providerName()}
                  selected={each === slot()}
                  onSelect={slots().length > 1 ? () => setPicked(each) : null}
                />
              )}
            </For>
          </div>
          {/* A new slot starts over, with its own language switch. */}
          <Show when={slot()} keyed>
            {(current) => (
              <SlotPanel
                title={props.title}
                target={target()}
                slot={current}
                current={imageOf(current)}
                providerName={providerName()}
              />
            )}
          </Show>
        </Match>
      </Switch>
    </>
  )
}

/**
 * A slot's name and the image it has, all at one height whatever the
 * image's shape. With several slots, it's the button that picks one.
 */
function SlotCard(props: {
  slot: ImageSlot
  /** Undefined while loading. */
  current: ItemImage | undefined
  toneKey: string
  providerName: string | null
  selected: boolean
  onSelect: (() => void) | null
}) {
  const card = "flex shrink-0 items-center gap-3 rounded-lg border p-1.5 pr-4"
  const body = () => (
    <>
      <span
        class={cn(
          "relative h-14 shrink-0 overflow-hidden rounded-md border",
          ASPECTS.get(props.slot),
          tone(props.toneKey),
        )}
      >
        <Picture
          sources={present(art(props.current?.image, "thumb"))}
          class={props.slot === "logo" ? "object-contain p-1" : undefined}
        />
      </span>
      <span class="min-w-0 text-left">
        <span class="block text-sm font-medium">{slotName(props.slot)}</span>
        <span class="text-muted-foreground block truncate text-xs">
          {props.current
            ? stateText(props.slot, props.current, props.providerName)
            : " "}
        </span>
      </span>
    </>
  )
  return (
    <Show
      when={props.onSelect}
      fallback={<div class={cn(card, "border-foreground/10")}>{body()}</div>}
    >
      {(select) => (
        <button
          type="button"
          aria-pressed={props.selected ? "true" : "false"}
          onClick={() => select()()}
          class={cn(
            card,
            "focus-visible:ring-ring outline-none focus-visible:ring-2",
            props.selected
              ? "border-primary bg-primary/10"
              : "border-foreground/10 hover:border-foreground/25 hover:bg-foreground/[0.04]",
          )}
        >
          {body()}
        </button>
      )}
    </Show>
  )
}

type Change =
  | { kind: "set"; imageId: string | null }
  | { kind: "upload"; file: File }
  | { kind: "reset" }

/** One slot: the image it has, what to do with it, and the choices. */
function SlotPanel(props: {
  title: Owner
  target: ImageTarget
  slot: ImageSlot
  /** Undefined while loading. */
  current: ItemImage | undefined
  providerName: string | null
}) {
  const queryClient = useQueryClient()
  let fileInput: HTMLInputElement | undefined
  const switchId = createUniqueId()
  const [allLanguages, setAllLanguages] = createSignal(false)
  // A provider lists images only for an entry the title matched.
  const provider = () => (props.title.providerId ? props.providerName : null)
  const remote = useQuery(() => ({
    ...orpc.titles.remoteImages.queryOptions({
      input: {
        ...props.target,
        slot: props.slot,
        allLanguages: allLanguages(),
      },
    }),
    enabled: provider() !== null,
    staleTime: 5 * 60_000,
    retry: false,
  }))
  const choices = () => (remote.isSuccess ? remote.data : [])

  const change = useMutation(() => ({
    mutationFn: (action: Change) => {
      const input = { ...props.target, slot: props.slot }
      if (action.kind === "upload") {
        return client.titles.uploadImage({ ...input, file: action.file })
      }
      if (action.kind === "reset") return client.titles.resetImage(input)
      return client.titles.setImage({ ...input, imageId: action.imageId })
    },
    onSuccess: async (images: ItemImage[]) => {
      queryClient.setQueryData(
        orpc.titles.images.queryKey({ input: props.target }),
        images,
      )
      await refetchShown(queryClient)
    },
    onError: (error: Error) =>
      toast.error(tr("title.images.error"), {
        description: errorMessage(error),
      }),
  }))

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
  const busy = () => (change.isPending ? change.variables : undefined)
  const removing = () => {
    const now = busy()
    return now?.kind === "set" && now.imageId === null
  }
  const pendingId = () => {
    const now = busy()
    return now?.kind === "set" ? now.imageId : undefined
  }

  return (
    <div class="-mx-6 flex min-h-0 flex-1 flex-col border-t">
      {/* One line for every slot, so what's below doesn't move. Phones
          show the buttons' icons only. */}
      <div class="flex h-14 shrink-0 items-center gap-2 px-6">
        <Button
          variant="secondary"
          size="sm"
          aria-label={tr("title.images.upload")}
          disabled={change.isPending}
          onClick={() => fileInput?.click()}
        >
          <Show
            when={busy()?.kind === "upload"}
            fallback={<Icon icon={ImageUp} />}
          >
            <Spinner />
          </Show>
          <span class="max-sm:hidden">{tr("title.images.upload")}</span>
        </Button>
        <Show when={props.current?.image}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tr("title.images.remove")}
            disabled={change.isPending}
            onClick={() => change.mutate({ kind: "set", imageId: null })}
          >
            <Show when={removing()} fallback={<Icon icon={Trash2} />}>
              <Spinner />
            </Show>
            <span class="max-sm:hidden">{tr("title.images.remove")}</span>
          </Button>
        </Show>
        <Show when={props.current?.chosen && provider()}>
          {(name) => (
            <Button
              variant="ghost"
              size="sm"
              aria-label={tr("title.images.reset", { provider: name() })}
              disabled={change.isPending}
              onClick={() => change.mutate({ kind: "reset" })}
            >
              <Show
                when={busy()?.kind === "reset"}
                fallback={<Icon icon={RotateCcw} />}
              >
                <Spinner />
              </Show>
              <span class="max-sm:hidden">
                {tr("title.images.reset", { provider: name() })}
              </span>
            </Button>
          )}
        </Show>
        <Show when={provider()}>
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <label
              id={`${switchId}-label`}
              for={switchId}
              class="text-muted-foreground text-sm whitespace-nowrap"
            >
              {tr("title.images.allLanguages")}
            </label>
            <Toggle
              id={switchId}
              aria-labelledby={`${switchId}-label`}
              size="sm"
              checked={allLanguages()}
              onCheckedChange={(checked) => setAllLanguages(checked)}
            />
          </div>
        </Show>
        <input
          ref={(element) => (fileInput = element)}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (file) upload(file)
          }}
        />
      </div>

      <Show
        when={provider()}
        fallback={
          <p class="text-muted-foreground grid flex-1 place-items-center px-6 pb-6 text-center text-sm">
            {props.providerName
              ? tr("title.images.unmatched", { provider: props.providerName })
              : tr("title.images.noProvider")}
          </p>
        }
      >
        {(name) => (
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
            <Switch>
              <Match when={remote.isPending}>
                <div class="grid flex-1 place-items-center">
                  <Spinner class="size-5" />
                </div>
              </Match>
              <Match when={remote.isError}>
                <FormAlert message={errorMessage(remote.error)} />
              </Match>
              <Match when={choices().length === 0}>
                <p class="text-muted-foreground grid flex-1 place-items-center text-center text-sm">
                  {allLanguages()
                    ? tr("title.images.empty", { provider: name() })
                    : tr("title.images.emptyLanguage", { provider: name() })}
                </p>
              </Match>
              <Match when={choices().length > 0}>
                <ul class={cn("grid gap-3 pt-1", GRIDS.get(props.slot))}>
                  <For each={choices()} keyed={(image) => image.id}>
                    {(image) => (
                      <li>
                        <Choice
                          image={image()}
                          slot={props.slot}
                          toneKey={props.title.id}
                          inUse={image().id === props.current?.image?.id}
                          pending={pendingId() === image().id}
                          disabled={change.isPending}
                          onPick={() =>
                            change.mutate({ kind: "set", imageId: image().id })
                          }
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </Match>
            </Switch>
          </div>
        )}
      </Show>
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

function Choice(props: {
  image: RemoteImage
  slot: ImageSlot
  toneKey: string
  inUse: boolean
  pending: boolean
  disabled: boolean
  onPick: () => void
}) {
  const text = () => caption(props.image, props.slot)
  return (
    <button
      type="button"
      aria-pressed={props.inUse ? "true" : "false"}
      disabled={props.disabled}
      onClick={() => props.onPick()}
      class="group focus-visible:ring-ring focus-visible:ring-offset-background flex w-full flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default"
    >
      <span
        class={cn(
          "relative w-full overflow-hidden rounded-md border transition-colors",
          ASPECTS.get(props.slot),
          tone(props.toneKey),
          props.inUse
            ? "border-primary ring-primary ring-1"
            : "group-hover:border-foreground/30",
        )}
      >
        <Picture
          sources={present(art(props.image.preview))}
          class={props.slot === "logo" ? "object-contain p-2" : undefined}
        />
        <Show when={props.inUse}>
          <span class="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full">
            <Icon icon={Check} class="size-3.5" />
          </span>
        </Show>
        <Show when={props.pending}>
          <span class="absolute inset-0 grid place-items-center bg-black/50 text-white">
            <Spinner />
          </span>
        </Show>
      </span>
      <Show when={text()}>
        <span class="text-muted-foreground truncate text-xs">{text()}</span>
      </Show>
      <span class="sr-only">
        {props.inUse ? tr("title.images.inUse") : tr("title.images.use")}
      </span>
    </button>
  )
}
