import type { Availability } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import { cn } from "@matinee/ui/lib/utils"
import { getRouteApi } from "@tanstack/react-router"
import {
  BellIcon,
  BellRingIcon,
  type LucideIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useId } from "react"

import { tr } from "@/i18n"

import { useCancel, useFollow } from "./use-ask"
import {
  type PosterAction,
  posterAction,
  posterActionLabel,
  requestDimmed,
  requestTip,
} from "./words"

/*
 * A title's state and the one thing its viewer may do about it. On a
 * card, on the poster itself, as Seerr's cards carry them: the state as a
 * glass badge in the corner, the action as a button along the lower edge
 * over a soft gradient while the card is hovered or focused. On a title's
 * page the badge stays on the poster and the button leads the row of
 * buttons, where a library title has Play.
 */

const authed = getRouteApi("/_authed")

// Over the gradient, which is dark in either scheme, so its text is white.
const glass =
  "border-white/15 bg-white/15 text-white backdrop-blur-md hover:bg-white/25"

// In a title's row over its backdrop, as Trailer is drawn beside it.
const pageGlass =
  "border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur"

/**
 * Where the button is drawn: on a poster, over its gradient; `plain`, off
 * a picture, as an ordinary button; or `page`, leading a title page's row
 * of buttons, as large as Play and filling the row on phones as Play does.
 */
export type ActionLook = "poster" | "plain" | "page"

const icons = {
  request: PlusIcon,
  cancel: XIcon,
  follow: BellIcon,
  unfollow: BellRingIcon,
} satisfies Record<PosterAction, LucideIcon>

/**
 * The darkening under a poster's button, from its lower edge up, so the
 * button reads on any picture. `hover` shows it only with the button.
 */
export function PosterShade({ hover = false }: { hover?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/35 to-transparent",
        hover &&
          "opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 motion-reduce:transition-none",
      )}
    />
  )
}

/**
 * Whether a title has a button, on its card's poster or in its page's
 * row: one to press, or a Request that can't be, kept in place with its
 * reason.
 */
export function hasPosterButton(availability: Availability): boolean {
  return posterAction(availability) !== null || requestDimmed(availability)
}

/**
 * The title's one button: "Request", "Cancel request", "Notify me" or
 * "Stop notifying", whichever the server's action allows, else nothing.
 * Cancelling and notifying happen here; a request goes to `onRequest`,
 * which asks at once or opens the request dialog. A Request the viewer
 * can't make, out of requests, with requests off, or declined, stays,
 * looks disabled, and says why in a tooltip, as a blocked menu item in
 * Users does, with the admin's answer to a declined request; a working
 * one says there how few requests are left.
 */
export function PosterActionButton({
  availability,
  action: override,
  name,
  onRequest,
  busy = false,
  size = "default",
  label,
  look = "poster",
  className,
}: {
  availability: Availability
  /** The action in place of the server's, like "Request more" for a show. */
  action?: PosterAction
  /** The title's name, for toasts and screen readers. */
  name: string
  onRequest: () => void
  /** A request for this title is on its way to the server. */
  busy?: boolean
  size?: "sm" | "default"
  /** Words in place of "Request", like "Request the rest". */
  label?: ReactNode
  look?: ActionLook
  className?: string
}) {
  const cancel = useCancel()
  const follow = useFollow()
  const tipId = useId()
  const { user } = authed.useRouteContext()
  const dimmed = !override && requestDimmed(availability)
  const action =
    override ?? posterAction(availability) ?? (dimmed ? "request" : null)
  if (!action) return null
  const tip =
    action === "request" && !override
      ? requestTip(availability, user.role === "admin")
      : null
  const id = availability.requestId
  const Icon = icons[action]
  const pending =
    action === "request"
      ? busy
      : action === "cancel"
        ? cancel.isPending
        : follow.isPending
  const press = () => {
    if (dimmed) return
    if (action === "request") onRequest()
    else if (!id) return
    else if (action === "cancel") cancel.mutate({ id, name })
    else follow.mutate({ id, on: action === "follow" })
  }
  const page = look === "page"
  const button = (
    <Button
      size={page ? "lg" : size}
      variant={action === "request" ? "default" : "secondary"}
      disabled={pending || dimmed}
      // Focusable and hoverable, so its tooltip can say why.
      focusableWhenDisabled={dimmed}
      aria-describedby={tip ? tipId : undefined}
      onClick={press}
      className={cn(
        page
          ? // Play's size and place: as wide as its words, filling the
            // row on phones.
            "min-w-0 max-sm:h-11 max-sm:flex-1"
          : // Long words, like German's, wrap rather than cut off on a
            // narrow poster.
            cn(
              "h-auto w-full py-1.5 leading-tight whitespace-normal",
              size === "sm" ? "min-h-8" : "min-h-9",
            ),
        // Dimmed and flat: a lift would say it can be pressed.
        "aria-disabled:hover:bg-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none",
        look === "poster" && "shadow-lg shadow-black/30",
        action !== "request" && look === "poster" && glass,
        action !== "request" && page && pageGlass,
        className,
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={page ? 2 : 2.5}
        className={cn(action === "unfollow" && "text-primary")}
      />
      <span
        key={action}
        className={cn(
          "animate-in fade-in-0 min-w-0 duration-150 motion-reduce:animate-none",
          page ? "truncate" : "text-balance",
        )}
      >
        {action === "request" && label ? label : posterActionLabel(action)}
      </span>
    </Button>
  )
  if (!tip) return button
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent
          // The answer and the note are two lines, and the note is cut
          // short; aloud, the hidden copy below reads all of it.
          className="max-w-64 flex-col items-start gap-1 leading-4 text-pretty"
        >
          <span>{tip.text}</span>
          {tip.note && (
            <span className="text-background/75 line-clamp-2 italic">
              {tr("ask.declined.note", { note: tip.note })}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
      {/* The tooltip is for eyes; this reads the same words aloud. */}
      <span id={tipId} hidden>
        {tip.text}
        {tip.note && ` ${tr("ask.declined.note", { note: tip.note })}`}
      </span>
    </>
  )
}

/**
 * A card's button, along the poster's lower edge while the card is
 * hovered or has keyboard focus, as Seerr's cards show "Request". Put it
 * in a `group/card` box over the poster. Touch screens have no hover:
 * they leave it out and a tap opens the title's page, unless `touch`,
 * for a card with no page to open, where it stays.
 */
export function CardActionButton({
  touch = false,
  ...props
}: Parameters<typeof PosterActionButton>[0] & { touch?: boolean }) {
  if (!props.action && !posterAction(props.availability)) return null
  return (
    <span
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 p-2 opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 motion-reduce:transition-none",
        touch
          ? "[@media(pointer:coarse)]:opacity-100"
          : "[@media(pointer:coarse)]:hidden",
      )}
    >
      <PosterActionButton size="sm" {...props} />
    </span>
  )
}
