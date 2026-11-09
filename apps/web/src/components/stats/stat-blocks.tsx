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

/** The surface statistics sit on: the card color, a rim, rounded. */
export const statsCard = "bg-card rounded-xl border"

/**
 * A titled block of statistics: a card, its name in small type at the
 * top, as the apps show them.
 */
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
      className={cn(statsCard, "flex min-w-0 flex-col gap-3 p-4", className)}
    >
      <div className="flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id={id} className="text-muted-foreground text-sm leading-6">
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
  icon: LucideIcon
  /** A line under the label, like "8 on the GPU". */
  detail?: string
}

/**
 * The headline figures as a card of rows, as Settings lists its rows: an
 * icon, what the figure counts, and the figure at the end, so it reads as
 * a sentence rather than a wall of numbers.
 */
export function StatFigures({
  figures,
  className,
}: {
  figures: StatFigure[]
  className?: string
}) {
  return (
    <ul className={cn(statsCard, "divide-y self-start", className)}>
      {figures.map(({ label, value, icon: Icon, detail }) => (
        <li key={label} className="flex min-w-0 items-center gap-3.5 px-4 py-3">
          <Icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] leading-6">{label}</span>
            {detail && (
              <span className="text-muted-foreground truncate text-xs">
                {detail}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[15px] leading-6 font-semibold tabular-nums">
            {value}
          </span>
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

/** A section's rows run to its card's edges, as the apps draw them, with a line between each. */
export const statsRows = "-mx-4 -mb-4 flex flex-col divide-y"

/** A thin bar for `value`'s part of `scale`, under a row. */
export function ShareBar({ value, scale }: { value: number; scale: number }) {
  return (
    <span
      aria-hidden
      className="bg-foreground/[0.07] block h-[3px] rounded-full"
    >
      <span
        className="bg-primary block h-full rounded-full"
        style={{ width: `${Math.max((value / Math.max(1, scale)) * 100, 1)}%` }}
      />
    </span>
  )
}

/**
 * Rows with a bar under each, as long as the row's part of `total`, or of
 * all the rows together without it, as the apps list them. A row ends
 * with its detail, or with `share` its percent, the detail going under
 * its name; leave `share` off when rows overlap, like genres, since their
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
  return (
    <ul className={cn(statsRows, className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] leading-6">
                {row.label}
              </span>
              {share && (
                <span className="text-muted-foreground truncate text-sm tabular-nums">
                  {row.detail}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[15px] leading-6 font-semibold tabular-nums">
              {share ? percent(row.value, total) : row.detail}
            </span>
          </div>
          <ShareBar value={row.value} scale={total} />
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
