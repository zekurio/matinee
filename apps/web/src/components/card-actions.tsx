import type { WatchedAt } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Calendar,
  CalendarClock,
  CalendarOff,
  Check,
  Clock,
  Heart,
} from "lucide"
import { createSignal, Show } from "solid-js"

import { useDeferredMenu } from "@/components/deferred-menu"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"

/** Something the user can turn on and off, as it should look right now. */
export type Toggle = { on: () => boolean; toggle: () => void }

/**
 * Whether the user watched something, as it should look right now, and a
 * way to mark it. `watchedAt` is as in `playback.setWatched`; unset is now.
 * `useTitleWatched` in `watched-menu.tsx` makes one for a title.
 */
export type WatchedState = {
  on: () => boolean
  mark: (watched: boolean, watchedAt?: WatchedAt) => void
}

// Bare icons over the picture, which `CardScrim` blurs and dims behind
// them, with a shadow for touch screens, where it doesn't. No fill on
// hover: the scrim already answers the pointer, and the ghost variant's
// would be a slab of the page over the picture. No scale either: an open
// menu follows its trigger's box, so it would shift each time the pointer
// crossed the icon. Touch screens get a bigger target. The tick draws a
// step larger than the heart beside it: its glyph fills less of its box,
// so at the same size it looked smaller.
export const cardIconButton =
  "size-8 text-white/85 drop-shadow-[0_1px_3px_rgb(0_0_0/0.9)] hover:bg-transparent hover:text-white aria-expanded:bg-transparent aria-expanded:text-white [@media(pointer:coarse)]:size-10"

/**
 * Blurs and dims a poster or still while its card's controls show, so the
 * icons read on any picture. It goes over the picture, inside the
 * `group/card`. Touch screens skip it, since there the icons stay up. The
 * filter goes on only while it shows: a library's worth at rest would cost
 * a layer each.
 */
export function CardScrim() {
  return (
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-black/50 to-black/10 opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 group-has-[[aria-expanded=true]]/card:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:hidden"
    />
  )
}

/**
 * Watched and favorite icons for the corner of a poster or still, and the
 * card's "⋯" `menu` after them, for what has no icon of its own (see
 * `actions-menu.tsx`). They show while a pointer is over the `group/card`
 * around them, keyboard focus is in it, or one of their menus is open.
 *
 * Touch screens have no hover, so with `touch` they always see the icons,
 * and without it never do, since a tap on an invisible button would land
 * on it rather than on the card.
 *
 * The check asks when, as the menus do. Once watched, it marks unwatched
 * at once. The menus and the date dialog mount when first needed.
 */
export function CardActions(props: {
  /** Names the movie, show, or episode for screen readers. */
  name: string
  watched: WatchedState
  /** None for what can't be a favorite. */
  favorite: Toggle | null
  /** The card's "⋯" menu, in the card look. */
  menu?: JSX.Element
  /** Show the icons on touch screens, always. */
  touch?: boolean
  class?: string
}) {
  // Null until "Other date" is first picked, so the dialog mounts then.
  const [picking, setPicking] = createSignal<boolean | null>(null)
  return (
    <div
      class={cn(
        "flex items-center opacity-0 transition-opacity group-has-[:focus-visible]/card:opacity-100 group-hover/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 motion-reduce:transition-none",
        props.touch
          ? "[@media(pointer:coarse)]:opacity-100"
          : "[@media(pointer:coarse)]:hidden",
        props.class,
      )}
    >
      <Show
        when={props.watched.on()}
        fallback={
          <WatchedMenu
            name={props.name}
            watched={props.watched}
            onPickDate={() => setPicking(true)}
          />
        }
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={tr("media.markNamedUnwatched", { name: props.name })}
          title={tr("media.markUnwatched")}
          onClick={() => props.watched.mark(false)}
          class={cn(cardIconButton, "text-primary hover:text-primary")}
        >
          <Icon icon={Check} class="size-6" stroke-width={3} />
        </Button>
      </Show>
      <Show when={props.favorite}>
        {(favorite) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              favorite().on()
                ? tr("media.removeNamedFavorite", { name: props.name })
                : tr("media.addNamedFavorite", { name: props.name })
            }
            title={
              favorite().on()
                ? tr("media.removeFavorite")
                : tr("media.addFavorite")
            }
            onClick={() => favorite().toggle()}
            class={cardIconButton}
          >
            <Icon
              icon={Heart}
              class={[
                "size-5 transition-[fill,color,scale] duration-200 motion-reduce:transition-none",
                favorite().on()
                  ? "scale-110 fill-rose-400 text-rose-400"
                  : "fill-rose-400/0",
              ]}
            />
          </Button>
        )}
      </Show>
      {props.menu}
      <Show when={picking() !== null}>
        <WatchedDateDialog
          open={picking() ?? false}
          onOpenChange={setPicking}
          onPick={(watchedAt) => props.watched.mark(true, watchedAt)}
        />
      </Show>
    </div>
  )
}

/**
 * The unwatched check, which asks when. It mounts its menu when reached,
 * and from scratch each time the card is unwatched again.
 */
function WatchedMenu(props: {
  name: string
  watched: WatchedState
  onPickDate: () => void
}) {
  const deferred = useDeferredMenu()
  const label = () => tr("media.markNamedWatched", { name: props.name })
  const mark = (watchedAt?: WatchedAt) => props.watched.mark(true, watchedAt)
  return (
    <Show
      when={deferred.mounted()}
      fallback={
        <Button
          variant="ghost"
          size="icon"
          aria-label={label()}
          title={tr("media.markWatched")}
          class={cardIconButton}
          aria-haspopup={deferred.bare["aria-haspopup"]}
          aria-expanded="false"
          onPointerEnter={deferred.bare.onPointerEnter}
          onFocus={deferred.bare.onFocus}
          onClick={deferred.bare.onClick}
        >
          <Icon icon={Check} class="size-6" />
        </Button>
      }
    >
      <DropdownMenu defaultOpen={deferred.defaultOpen()}>
        <DropdownMenuTrigger
          ref={deferred.focusRef}
          aria-label={label()}
          title={tr("media.markWatched")}
          class={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            cardIconButton,
          )}
        >
          <Icon icon={Check} class="size-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} class="min-w-44">
          <DropdownMenuGroup aria-label={tr("media.markWatched")}>
            <DropdownMenuItem onSelect={() => mark()}>
              <Icon icon={Clock} />
              {tr("media.watchedAt.now")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => mark("released")}>
              <Icon icon={Calendar} />
              {tr("media.watchedAt.released")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onPickDate()}>
              <Icon icon={CalendarClock} />
              {tr("media.watchedAt.other")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => mark("unknown")}>
              <Icon icon={CalendarOff} />
              {tr("media.watchedAt.unknown")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  )
}
