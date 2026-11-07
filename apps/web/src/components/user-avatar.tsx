import { avatarPath, type User } from "@matinee/contracts"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@matinee/ui/components/avatar"
import { cn } from "@matinee/ui/lib/utils"

/**
 * The user's picture, or the first letter of their name without one. Size it
 * with `className`; the letter takes the font size set there.
 */
export function UserAvatar({
  user,
  className,
}: {
  user: Pick<User, "avatarId" | "displayName" | "username">
  className?: string
}) {
  const name = user.displayName ?? user.username
  return (
    <Avatar aria-hidden className={cn("after:border-foreground/10", className)}>
      {user.avatarId && <AvatarImage src={avatarPath(user.avatarId)} alt="" />}
      <AvatarFallback className="bg-secondary text-secondary-foreground [font-size:inherit] font-semibold">
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
