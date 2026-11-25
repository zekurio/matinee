import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import {
  Avatar as AvatarPrimitive,
  AvatarFallback as AvatarFallbackPrimitive,
  AvatarImage as AvatarImagePrimitive,
} from "@ui-sdk/solid/avatar"
import { omit } from "solid-js"

/** A person or team's picture, with initials as the fallback. */
function Avatar(
  props: ComponentProps<typeof AvatarPrimitive> & {
    size?: "default" | "sm" | "lg"
  },
) {
  return (
    <AvatarPrimitive
      data-slot="avatar"
      data-size={props.size ?? "default"}
      class={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        props.class,
      )}
      {...omit(props, "class", "size")}
    />
  )
}

/** The image inside an avatar, shown once it loads. */
function AvatarImage(props: ComponentProps<typeof AvatarImagePrimitive>) {
  return (
    <AvatarImagePrimitive
      data-slot="avatar-image"
      class={cn(
        "aspect-square size-full rounded-full object-cover",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** What an avatar shows while its image loads, or instead of one. */
function AvatarFallback(props: ComponentProps<typeof AvatarFallbackPrimitive>) {
  return (
    <AvatarFallbackPrimitive
      data-slot="avatar-fallback"
      class={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A small status dot or glyph in an avatar's bottom corner. */
function AvatarBadge(props: ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      class={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A row of avatars that overlap at their edges. */
function AvatarGroup(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      class={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The last chip of an avatar group, holding the number left out. */
function AvatarGroupCount(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      class={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
