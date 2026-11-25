import type { User } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Show } from "solid-js"

import { Avatar, AvatarFallback, AvatarImage } from "@/kit/avatar"

/**
 * The user's picture, or the first letter of their name without one. Size it
 * with `class`; the letter takes the font size set there.
 */
export function UserAvatar(props: {
  user: Pick<User, "avatarUrl" | "displayName" | "username">
  class?: string
}) {
  const name = () => props.user.displayName ?? props.user.username
  return (
    <Avatar
      aria-hidden="true"
      class={cn("after:border-foreground/10", props.class)}
    >
      {/* An upload on this server, or the provider's picture at its own
          URL, which needn't learn which page shows it. */}
      <Show when={props.user.avatarUrl}>
        {(url) => (
          <AvatarImage src={url()} referrerpolicy="no-referrer" alt="" />
        )}
      </Show>
      <AvatarFallback class="bg-secondary text-secondary-foreground [font-size:inherit] font-semibold">
        {/* Trimmed to the capital's own height, so the letter sits in the
            middle. */}
        <span class="block leading-none [text-box:trim-both_cap_alphabetic]">
          {name().slice(0, 1).toUpperCase()}
        </span>
      </AvatarFallback>
    </Avatar>
  )
}
