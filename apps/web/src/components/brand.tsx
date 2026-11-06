import { cn } from "@matinee/ui/lib/utils"

/** The Matinee mark: a play triangle in a rounded square. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-foreground" />
      <path d="M9.5 7.5v9l7-4.5z" className="fill-background" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      Matinee
    </span>
  )
}
