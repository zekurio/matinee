import type { Library } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import { Compass, Film, House, LibraryBig, TvMinimal } from "lucide"
import { omit, Show } from "solid-js"

import { useDiscoverEnabled } from "@/components/discover/discover-data"
import { tr } from "@/i18n"
import { Icon, type IconNode } from "@/kit/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { orpc } from "@/lib/rpc"

/*
 * The places the desktop rail and the phone's tabs lead to, and the face
 * both draw them with.
 */

export const libraryIcons = {
  movies: Film,
  shows: TvMinimal,
} satisfies Record<Library["kind"], IconNode>

/** A place the rail and the phone's tabs lead to. */
export type Destination = {
  to: "/" | "/media" | "/movies" | "/shows" | "/discover" | "/stats"
  icon: IconNode
  label: string
  /** Only the address itself, not the pages under it. */
  exact?: boolean
}

/**
 * Home, then Movies and Shows, each across every library of its kind and
 * only when there's a library of it, then Explore when this viewer gets
 * Discover. Read from what's cached without waiting on it, so the rail
 * never holds the page; the libraries are asked for before the app renders.
 */
export function useDestinations(): () => Destination[] {
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const discover = useDiscoverEnabled()
  const has = (kind: Library["kind"]) =>
    libraries.isSuccess &&
    libraries.data.some((library) => library.kind === kind)
  return () => [
    { to: "/", icon: House, label: tr("shell.home"), exact: true },
    ...(has("movies")
      ? [
          {
            to: "/movies" as const,
            icon: libraryIcons.movies,
            label: tr("shell.movies"),
          },
        ]
      : []),
    ...(has("shows")
      ? [
          {
            to: "/shows" as const,
            icon: libraryIcons.shows,
            label: tr("shell.shows"),
          },
        ]
      : []),
    ...(discover()
      ? [
          {
            to: "/discover" as const,
            icon: Compass,
            label: tr("shell.explore"),
          },
        ]
      : []),
  ]
}

/**
 * The phone's tabs, as the Flutter phone app has them: Home, Media, and
 * Explore. Downloads is native-only, since the web client keeps no files
 * offline; its place stays out rather than leading to a screen that can't
 * work.
 */
export function usePhoneDestinations(): () => Destination[] {
  return () => [
    { to: "/", icon: House, label: tr("shell.home"), exact: true },
    { to: "/media", icon: LibraryBig, label: tr("shell.media") },
    { to: "/discover", icon: Compass, label: tr("shell.explore") },
  ]
}

/**
 * A destination's look, shared by the rail and the phone's tabs, as the
 * Flutter tab bar draws it: the icon in a 32 tall box with the label under
 * it. On a phone the open one sits over a pill and keeps the foreground
 * color; a pointer over another brightens only its glyph. A press shrinks
 * the icon a little. Keyboard focus rings the pill, not the whole target.
 *
 * The rail shows the icon alone, on a rounded square where the tabs have
 * the wide pill, which is a shape for an icon with a word under it. It has
 * no tile behind it: the open destination takes the accent color, and a
 * pointer over another brightens that glyph alone. Nothing on it moves or
 * fades: a press doesn't shrink it, and its color changes at once, since a
 * fade would stall halfway while the next page builds. A word under each icon
 * had to fit 80 pixels in every language, and "Einstellungen" doesn't. Its
 * label is the kit's tooltip beside the icon and the link's name for a
 * screen reader.
 */
export const destinationLink =
  "group/tab flex min-w-0 flex-col items-center gap-1 outline-none select-none"

/**
 * The phone tab's color, on the icon and the label rather than on the
 * link: `color` is inherited, so a fade on the link restyles everything
 * inside it on every frame, where these two are the only parts showing it.
 * Only the glyph glows under a pointer; the glow follows the icon's own
 * color, so it reads in either appearance.
 */
const destinationColor =
  "text-muted-foreground transition-colors duration-200 group-hover/tab:text-foreground group-data-[status=active]/tab:text-foreground motion-reduce:transition-none"

/** The phone tab's glyph takes the glow; its word only brightens. */
const destinationIcon =
  "relative size-6 text-muted-foreground transition-[color,filter] duration-200 group-hover/tab:text-foreground group-hover/tab:drop-shadow-[0_0_6px_currentColor] group-data-[status=active]/tab:text-foreground motion-reduce:transition-none"

/** The rail's glyph: a color change alone, with the accent marking the page. */
const railIcon =
  "relative size-6 text-muted-foreground group-hover/tab:text-foreground group-data-[status=active]/tab:text-primary"

export function DestinationFace(props: {
  icon: IconNode
  label: string
  rail?: boolean
}) {
  return (
    <>
      <span
        class={[
          "relative grid place-items-center",
          props.rail
            ? "size-10"
            : "h-8 w-16 transition-transform duration-200 group-active/tab:scale-[0.92] motion-reduce:transition-none",
        ]}
      >
        <Show when={!props.rail}>
          <span
            aria-hidden="true"
            // Grows by scale, not width: a width would lay the phone tab
            // out again on every frame of the change.
            class="bg-foreground/10 absolute inset-0 scale-x-50 rounded-full opacity-0 transition-[scale,opacity] duration-200 ease-out group-data-[status=active]/tab:scale-x-100 group-data-[status=active]/tab:opacity-100 motion-reduce:transition-none"
          />
        </Show>
        <span
          aria-hidden="true"
          class={[
            "ring-ring absolute inset-0 hidden ring-2 group-focus-visible/tab:block",
            props.rail ? "rounded-xl" : "rounded-full",
          ]}
        />
        <Icon
          icon={props.icon}
          class={props.rail ? railIcon : destinationIcon}
        />
      </span>
      <Show when={!props.rail}>
        <span
          class={[
            "max-w-full truncate px-1 text-xs font-medium",
            destinationColor,
          ]}
        >
          {props.label}
        </span>
      </Show>
    </>
  )
}

export function DestinationLink(
  props: Destination & {
    class?: string
    rail?: boolean
    /** Draw the tab open, where the address is one of its preset pages. */
    selected?: boolean
    onClick?: (event: MouseEvent) => void
  },
) {
  const face = () => (
    <DestinationFace icon={props.icon} label={props.label} rail={props.rail} />
  )
  return (
    <Show
      when={props.rail}
      fallback={
        <Link
          to={props.to}
          activeOptions={{ exact: props.exact ?? false, includeSearch: false }}
          // A pointer press after a keyboard focus drops the ring Chrome
          // would otherwise leave on the target.
          onPointerDown={(event) => {
            if (event.currentTarget.matches(":focus-visible")) {
              event.currentTarget.blur()
            }
          }}
          onClick={(event) => props.onClick?.(event)}
          data-status={props.selected ? "active" : undefined}
          aria-current={props.selected ? "page" : undefined}
          class={cn(destinationLink, props.class)}
        >
          {face()}
        </Link>
      }
    >
      <Tooltip>
        <TooltipTrigger
          render={(trigger) => (
            <Link
              {...omit(trigger, "type", "class")}
              to={props.to}
              activeOptions={{
                exact: props.exact ?? false,
                includeSearch: false,
              }}
              aria-label={props.label}
              onPointerDown={(event) => {
                if (event.currentTarget.matches(":focus-visible")) {
                  event.currentTarget.blur()
                }
              }}
              class={cn(destinationLink, props.class)}
            />
          )}
        >
          {face()}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {props.label}
        </TooltipContent>
      </Tooltip>
    </Show>
  )
}
