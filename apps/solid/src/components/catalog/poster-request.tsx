import type { Availability } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { getRouteApi } from "@tanstack/solid-router"
import { Plus, X } from "lucide"
import { createMemo, createUniqueId, Show } from "solid-js"

import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { can } from "@/lib/permissions"

import { useCancel } from "./use-ask"
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

const icons = new Map([
  ["request", Plus],
  ["cancel", X],
] satisfies [PosterAction, typeof Plus][])

/**
 * Whether a title has a button, on its card's poster or in its page's
 * row: one to press, or a Request that can't be, kept in place with its
 * reason.
 */
export function hasPosterButton(availability: Availability): boolean {
  return posterAction(availability) !== null || requestDimmed(availability)
}

export type PosterActionProps = {
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
  label?: JSX.Element
  /**
   * What Request is read aloud as where its words alone don't say what
   * it asks for, like "Request Season 3" among a show's seasons.
   */
  requestName?: string
  look?: ActionLook
  class?: string
}

/**
 * The title's one button: "Request" or "Cancel request", whichever the
 * server's action allows, else nothing. Cancelling happens here; a
 * request goes to `onRequest`, which asks at once or opens the request
 * dialog. A Request the viewer
 * can't make, out of requests, with requests off, or declined, stays,
 * looks disabled, and says why in a tooltip, as a blocked menu item in
 * Users does, with the admin's answer to a declined request; a working
 * one says there how few requests are left.
 */
export function PosterActionButton(props: PosterActionProps) {
  const cancel = useCancel()
  const tipId = createUniqueId()
  const context = authed.useRouteContext()
  const dimmed = () => !props.action && requestDimmed(props.availability)
  const action = createMemo(
    () =>
      props.action ??
      posterAction(props.availability) ??
      (dimmed() ? "request" : null),
  )
  const tip = createMemo(() =>
    action() === "request" && !props.action
      ? requestTip(
          props.availability,
          can(context().user, "adminRequest.decline"),
        )
      : null,
  )
  const pending = () =>
    action() === "request" ? (props.busy ?? false) : cancel.isPending
  const press = () => {
    if (dimmed()) return
    if (action() === "request") props.onRequest()
    else {
      const id = props.availability.requestId
      if (id) cancel.mutate({ id, name: props.name })
    }
  }
  const page = () => props.look === "page"
  const look = () => props.look ?? "poster"

  // Read only while there is an action.
  const current = () => action() ?? "request"
  const size = () => (page() ? "lg" : (props.size ?? "default"))
  const variant = () => (current() === "request" ? "default" : "secondary")
  const face = () =>
    cn(
      page()
        ? // Play's size and place: as wide as its words, filling the
          // row on phones.
          "min-w-0 max-sm:flex-1"
        : // Long words, like German's, wrap rather than cut off on a
          // narrow poster.
          cn(
            "h-auto w-full py-1.5 leading-tight whitespace-normal",
            props.size === "sm" ? "min-h-8" : "min-h-9",
          ),
      // Dimmed and flat: a lift would say it can be pressed. It still
      // takes the pointer, for its tooltip.
      "aria-disabled:hover:bg-primary aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none",
      look() === "poster" && "shadow-lg shadow-black/30",
      current() !== "request" && look() === "poster" && glass,
      current() !== "request" && page() && pageGlass,
      props.class,
    )
  const content = () => (
    <>
      <Icon
        icon={icons.get(current()) ?? Plus}
        stroke-width={page() ? 2 : 2.5}
      />
      <Show when={current()} keyed>
        {(shown) => (
          <span
            class={cn(
              "animate-in fade-in-0 min-w-0 duration-150 motion-reduce:animate-none",
              page() ? "truncate" : "text-balance",
            )}
          >
            {shown === "request" && props.label
              ? props.label
              : posterActionLabel(shown)}
          </span>
        )}
      </Show>
    </>
  )

  return (
    <Show when={action()}>
      <Show
        when={tip()}
        fallback={
          <Button
            size={size()}
            variant={variant()}
            disabled={pending() || dimmed()}
            focusableWhenDisabled={dimmed()}
            aria-label={current() === "request" ? props.requestName : undefined}
            onClick={press}
            class={face()}
          >
            {content()}
          </Button>
        }
      >
        {(shown) => (
          <>
            {/* It adds to what the trigger says, which names itself. */}
            <Tooltip type="description">
              {/* The trigger is the button: dimmed, it stays focusable and
                  hoverable with aria-disabled, so its tooltip can say why. */}
              <TooltipTrigger
                aria-disabled={dimmed() ? "true" : undefined}
                disabled={pending() && !dimmed()}
                aria-label={
                  current() === "request" ? props.requestName : undefined
                }
                aria-describedby={tipId}
                onClick={press}
                class={cn(
                  buttonVariants({ size: size(), variant: variant() }),
                  face(),
                )}
              >
                {content()}
              </TooltipTrigger>
              <TooltipContent
                // The answer and the note are two lines, and the note is
                // cut short; aloud, the hidden copy below reads all of it.
                class="max-w-64 flex-col items-start gap-1 leading-4 text-pretty"
              >
                <span>{shown().text}</span>
                <Show when={shown().note}>
                  {(note) => (
                    <span class="text-background/75 line-clamp-2 italic">
                      {tr("ask.declined.note", { note: note() })}
                    </span>
                  )}
                </Show>
              </TooltipContent>
            </Tooltip>
            {/* The tooltip is for eyes; this reads the same words aloud. */}
            <span id={tipId} hidden>
              {shown().note
                ? tr("catalog.tip.join", {
                    first: shown().text,
                    second: tr("ask.declined.note", {
                      note: shown().note ?? "",
                    }),
                  })
                : shown().text}
            </span>
          </>
        )}
      </Show>
    </Show>
  )
}

/**
 * A card's button, along the poster's lower edge while the card is
 * hovered or has keyboard focus, as Seerr's cards show "Request". Put it
 * in a `group/card` box over the poster. Touch screens have no hover:
 * they leave it out and a tap opens the title's page, unless `touch`,
 * for a card with no page to open, where it stays.
 */
export function CardActionButton(
  props: PosterActionProps & { touch?: boolean },
) {
  return (
    <Show when={props.action || posterAction(props.availability)}>
      <span
        class={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 p-2 opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 motion-reduce:transition-none",
          props.touch
            ? "[@media(pointer:coarse)]:opacity-100"
            : "[@media(pointer:coarse)]:hidden",
        )}
      >
        <PosterActionButton
          availability={props.availability}
          action={props.action}
          name={props.name}
          onRequest={props.onRequest}
          busy={props.busy}
          size="sm"
          label={props.label}
          requestName={props.requestName}
          look={props.look}
          class={props.class}
        />
      </span>
    </Show>
  )
}
