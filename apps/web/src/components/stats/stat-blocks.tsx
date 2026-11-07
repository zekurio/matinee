import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { cn } from "@matinee/ui/lib/utils"
import { LockIcon, type LucideIcon } from "lucide-react"
import { type ReactNode, useId } from "react"

import { perLocale, tr } from "@/i18n"

/** Columns for a page's blocks of statistics. */
export const statsGrid =
  "grid items-start gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3"

/** A titled block of statistics with a small heading. */
export function StatsSection({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <div className="flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id={id} className="text-[15px] leading-6 font-semibold">
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** A page section's heading, the size of Home's rows. */
export function SectionHeading({
  title,
  children,
  action,
}: {
  title: string
  /** Inline after the title, like a count or a privacy note. */
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
      {action && <div className="ml-auto max-w-full">{action}</div>}
    </div>
  )
}

/** Says a part of a profile is hidden from everyone else. */
export function PrivateNote() {
  return (
    <span
      title={tr("stats.private.hint")}
      className="text-muted-foreground bg-foreground/[0.06] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
    >
      <LockIcon aria-hidden className="size-3" />
      {tr("stats.private.note")}
    </span>
  )
}

export type StatFigure = {
  label: string
  value: string
  /** A line under the label, like "8 on the GPU". */
  detail?: string
}

/**
 * The headline figures: two or three to a row on small screens, all in one
 * row from `lg` up.
 */
export function StatFigures({
  figures,
  className,
}: {
  figures: StatFigure[]
  className?: string
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 content-start gap-x-6 gap-y-4 sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none",
        className,
      )}
    >
      {figures.map(({ label, value, detail }) => (
        <li key={label} className="flex min-w-0 flex-col">
          {/* The label comes first for screen readers; the figure shows on top. */}
          <span className="text-muted-foreground order-2 truncate text-xs leading-5">
            {label}
          </span>
          <span className="order-1 truncate text-xl leading-7 font-semibold tracking-tight tabular-nums">
            {value}
          </span>
          {detail && (
            <span className="text-muted-foreground/70 order-3 truncate text-xs">
              {detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export type RankedRow = {
  key: string
  label: ReactNode
  value: number
  /** What the row's number says, like "4h 10m" or "12 plays". */
  detail: string
}

const percents = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
)

/** A whole-number percent, with "<1%" so a small share doesn't read as none. */
export function percent(value: number, total: number): string {
  if (total <= 0 || value <= 0) return percents().format(0)
  const share = value / total
  return share < 0.01 ? `<${percents().format(0.01)}` : percents().format(share)
}

/**
 * Rows with a hairline bar under each, as long as the row's part of
 * `total`, or of all the rows together without it. With `share` the row
 * ends with that percent, so its detail should lead with what `value`
 * counts. Leave `share` off when rows overlap, like genres, since their
 * percents would add up to more than 100.
 */
export function RankedBars({
  rows,
  total: given,
  share = false,
  className,
}: {
  rows: RankedRow[]
  total?: number
  share?: boolean
  className?: string
}) {
  const total = given ?? rows.reduce((sum, row) => sum + row.value, 0)
  const scale = Math.max(1, total)
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4 text-[13px] leading-5">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {row.detail}
              {share && (
                <>
                  {" · "}
                  <span className="text-foreground font-medium">
                    {percent(row.value, total)}
                  </span>
                </>
              )}
            </span>
          </div>
          <span
            aria-hidden
            className="bg-foreground/[0.07] h-[3px] rounded-full"
          >
            <span
              className="bg-primary block h-full rounded-full"
              style={{ width: `${Math.max((row.value / scale) * 100, 1)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Nothing to show yet: an icon, what will appear, and a way on, like the
 * library page's empty state. `compact` for a part of a page.
 */
export function StatsEmpty({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <Empty className={cn(compact ? "py-8" : "py-14", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="mb-3 size-9 [&_svg]:size-5">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle
          role="heading"
          aria-level={3}
          className="text-base font-semibold"
        >
          {title}
        </EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
