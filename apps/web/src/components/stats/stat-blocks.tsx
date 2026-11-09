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
// One grid for every row of a page's cards, so their edges line up, and
// one gap between them, the same both ways. A card that should be wider
// spans columns rather than bringing a grid of its own.
export const statsGrid = "grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3"

/** The surface statistics sit on: the card color, a rim, rounded. */
export const statsCard = "bg-card rounded-xl border"

/**
 * A titled block of statistics: a card, its name at the top over a line
 * across it, so the first row reads as a row and not part of the heading.
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
      className={cn(statsCard, "flex min-w-0 flex-col gap-4 p-4", className)}
    >
      <div className="-mx-4 flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 pb-3">
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
  /** The row's figure, at its end: "4h 10m", "12 plays", "1.2 TB". */
  detail: string
  /** A second fact under the name, like how many titles a library holds. */
  note?: string
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
// Pulled up to the line under the section's name, so the first row starts
// there, as the rest start at the line above them.
export const statsRows = "-mx-4 -mt-4 -mb-4 flex flex-col divide-y"

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
 * the biggest row without it, as the apps list them: the name, maybe a
 * note under it, and the figure at the end. No percents: a list cut to
 * its top rows, or of things that overlap like genres, has none that add
 * up.
 */
export function RankedBars({
  rows,
  total,
  className,
}: {
  rows: RankedRow[]
  total?: number
  className?: string
}) {
  const scale = total ?? Math.max(0, ...rows.map((row) => row.value))
  return (
    <ul className={cn(statsRows, className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] leading-6">
                {row.label}
              </span>
              {row.note && (
                <span className="text-muted-foreground truncate text-sm tabular-nums">
                  {row.note}
                </span>
              )}
            </span>
            <span className="shrink-0 text-[15px] leading-6 font-semibold tabular-nums">
              {row.detail}
            </span>
          </div>
          <ShareBar value={row.value} scale={scale} />
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
