import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import { useState } from "react"

import { FavoriteHeart } from "@/components/favorite-button"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { WatchedAtItems } from "@/components/watched-menu"
import type { Toggle, WatchedState } from "@/lib/viewer-state"

// Bare icons over the picture, which `CardScrim` blurs and dims behind
// them, with a shadow for touch screens, where it doesn't. No scale on
// hover: an open menu follows its trigger's box, so it would shift each
// time the pointer crossed the icon. Touch screens get a bigger target.
const iconButton =
  "text-white/85 drop-shadow-[0_1px_3px_rgb(0_0_0/0.9)] hover:text-white aria-expanded:text-white [@media(pointer:coarse)]:size-10"

/**
 * Blurs and dims a poster or still while its {@link CardActions} show, so
 * the icons read on any picture. It goes over the picture, inside the
 * `group/card`. Touch screens skip it, since there the icons stay up.
 */
export function CardScrim() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-black/10 opacity-0 backdrop-blur-xs transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 group-has-[[aria-expanded=true]]/card:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:hidden"
    />
  )
}

/**
 * Watched and favorite icons for the corner of a poster or still. They
 * show while a pointer is over the `group/card` around them, focus is in
 * it, or the check's menu is open.
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
  touch = false,
  className,
}: {
  /** Names the movie, show, or episode for screen readers. */
  name: string
  watched: WatchedState
  favorite: Toggle
  /** Show the icons on touch screens, always. */
  touch?: boolean
  className?: string
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div
      className={cn(
        "flex items-center opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 motion-reduce:transition-none",
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
          aria-label={`Mark ${name} unwatched`}
          title="Mark unwatched"
          onClick={() => watched.mark(false)}
          className={cn(iconButton, "text-primary hover:text-primary")}
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
                aria-label={`Mark ${name} watched`}
                title="Mark watched"
                className={iconButton}
              />
            }
          >
            <CheckIcon className="size-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mark watched</DropdownMenuLabel>
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
            ? `Remove ${name} from favorites`
            : `Add ${name} to favorites`
        }
        title={favorite.on ? "Remove from favorites" : "Add to favorites"}
        onClick={favorite.toggle}
        className={iconButton}
      >
        <FavoriteHeart on={favorite.on} className="size-6" />
      </Button>
      <WatchedDateDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(watchedAt) => watched.mark(true, watchedAt)}
      />
    </div>
  )
}
