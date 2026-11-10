import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import { type ReactNode, useState } from "react"

import { FavoriteHeart } from "@/components/favorite-button"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { WatchedAtItems } from "@/components/watched-menu"
import { tr } from "@/i18n"
import type { Toggle, WatchedState } from "@/lib/viewer-state"

// Bare icons over the picture, which `CardScrim` blurs and dims behind
// them, with a shadow for touch screens, where it doesn't. No scale on
// hover: an open menu follows its trigger's box, so it would shift each
// time the pointer crossed the icon. Touch screens get a bigger target.
// The tick draws a step larger than the heart beside it: its glyph fills
// less of its box, so at the same size it looked smaller.
export const cardIconButton =
  "size-8 text-white/85 drop-shadow-[0_1px_3px_rgb(0_0_0/0.9)] hover:text-white aria-expanded:text-white [@media(pointer:coarse)]:size-10"

/**
 * Blurs and dims a poster or still while its {@link CardActions} show, so
 * the icons read on any picture. It goes over the picture, inside the
 * `group/card`. Touch screens skip it, since there the icons stay up.
 */
export function CardScrim() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-black/10 opacity-0 backdrop-blur-xs transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 group-has-[[aria-expanded=true]]/card:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:hidden"
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
 * at once.
 */
export function CardActions({
  name,
  watched,
  favorite,
  menu,
  touch = false,
  className,
}: {
  /** Names the movie, show, or episode for screen readers. */
  name: string
  watched: WatchedState
  favorite: Toggle
  /** The card's "⋯" menu, in the card look. */
  menu?: ReactNode
  /** Show the icons on touch screens, always. */
  touch?: boolean
  className?: string
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div
      className={cn(
        "flex items-center opacity-0 transition-opacity group-has-[:focus-visible]/card:opacity-100 group-hover/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 motion-reduce:transition-none",
        touch
          ? "[@media(pointer:coarse)]:opacity-100"
          : "[@media(pointer:coarse)]:hidden",
        className,
      )}
    >
      {watched.on ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={tr("media.markNamedUnwatched", { name })}
          title={tr("media.markUnwatched")}
          onClick={() => watched.mark(false)}
          className={cn(cardIconButton, "text-primary hover:text-primary")}
        >
          <CheckIcon className="size-6" strokeWidth={3} />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={tr("media.markNamedWatched", { name })}
                title={tr("media.markWatched")}
                className={cardIconButton}
              />
            }
          >
            <CheckIcon className="size-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
            <DropdownMenuGroup aria-label={tr("media.markWatched")}>
              <WatchedAtItems
                onSelect={(watchedAt) => watched.mark(true, watchedAt)}
                onPickDate={() => setPicking(true)}
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          favorite.on
            ? tr("media.removeNamedFavorite", { name })
            : tr("media.addNamedFavorite", { name })
        }
        title={
          favorite.on ? tr("media.removeFavorite") : tr("media.addFavorite")
        }
        onClick={favorite.toggle}
        className={cardIconButton}
      >
        <FavoriteHeart on={favorite.on} className="size-5" />
      </Button>
      {menu}
      <WatchedDateDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(watchedAt) => watched.mark(true, watchedAt)}
      />
    </div>
  )
}
