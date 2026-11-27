import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Lock } from "lucide"
import { createUniqueId, For, onSettled, Show } from "solid-js"

import { perLocale, tr } from "@/i18n"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon, type IconNode } from "@/kit/icon"

/** The gap between a page's cards, both ways: `gap-4`. */
const CARD_GAP = 16

type Placed = { card: HTMLElement; index: number; height: number }

/**
 * Deals a grid's cards into its columns so the columns come out as even
 * as they can: the tallest card first, each into the column that's
 * shortest so far. Each column keeps its cards in page order, and the
 * columns go by their first card, so the page still starts with its
 * first card.
 */
function balance(grid: HTMLElement) {
  const cards: Placed[] = []
  for (const card of grid.children) {
    if (!(card instanceof HTMLElement)) continue
    const height = Math.ceil(card.getBoundingClientRect().height) + CARD_GAP
    cards.push({ card, index: cards.length, height })
  }
  const count = getComputedStyle(grid).gridTemplateColumns.split(" ").length
  const columns = Array.from({ length: count }, () => ({
    cards: new Array<Placed>(),
    height: 0,
  }))
  const tallestFirst = cards.toSorted(
    (a, b) => b.height - a.height || a.index - b.index,
  )
  for (const card of tallestFirst) {
    const shortest = columns.reduce((low, column) =>
      column.height < low.height ? column : low,
    )
    shortest.cards.push(card)
    shortest.height += card.height
  }
  const first = (column: { cards: Placed[] }) =>
    Math.min(...column.cards.map((card) => card.index))
  columns.sort((a, b) => first(a) - first(b))
  columns.forEach((column, at) => {
    let line = 1
    for (const placed of column.cards.toSorted((a, b) => a.index - b.index)) {
      placed.card.style.gridColumn = String(at + 1)
      placed.card.style.gridRow = `${line} / span ${placed.height}`
      line += placed.height
    }
  })
}

/**
 * A page's blocks of statistics, in the same columns as `statsOverview`
 * above them, so their edges line up. The cards are dealt into the
 * columns by height (see `balance`), so no column runs on far past the
 * others, and they're dealt again whenever the window or a card changes
 * size, or a card comes or goes.
 */
// The grid's rows are a pixel each, and each card spans its own height
// plus the gap below it, which CSS can't know, so the observers set it.
// The cards keep their own height (`items-start`); stretched to their
// span, they would grow by the gap on every measure. The negative margin
// takes back the last card's gap.
export function StatsGrid(props: { children: JSX.Element }) {
  let grid!: HTMLDivElement
  onSettled(() => {
    const sizes = new ResizeObserver(() => balance(grid))
    const observe = (nodes: Iterable<Node>) => {
      for (const node of nodes) {
        if (node instanceof HTMLElement) sizes.observe(node)
      }
    }
    // The grid itself too, for a change in its number of columns.
    sizes.observe(grid)
    observe(grid.children)
    // Cards come and go with their data, like the standing on a profile.
    const cards = new MutationObserver((changes) => {
      for (const change of changes) {
        observe(change.addedNodes)
        for (const node of change.removedNodes) {
          if (node instanceof HTMLElement) sizes.unobserve(node)
        }
      }
      balance(grid)
    })
    cards.observe(grid, { childList: true })
    return () => {
      cards.disconnect()
      sizes.disconnect()
    }
  })
  return (
    <div
      ref={(el) => (grid = el)}
      class="-mb-4 grid auto-rows-[1px] grid-cols-1 items-start gap-x-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {props.children}
    </div>
  )
}

/**
 * The row at the top of a view: a card `statsWide` across, the headline
 * figures in the last column, which drop under it from `md` to `xl`.
 */
export const statsOverview = "grid gap-4 md:grid-cols-2 xl:grid-cols-3"

/** A card in `statsOverview` two columns wide. */
export const statsWide = "md:col-span-2"

/** The figures in `statsOverview`, beside the wide card or under it. */
export const statsAside = "md:col-span-2 xl:col-span-1"

/** The surface statistics sit on: the card color, a rim, rounded. */
export const statsCard = "bg-card rounded-xl border"

/**
 * A titled block of statistics: a card, its name at the top over a line
 * across it, so the first row reads as a row and not part of the heading.
 */
export function StatsSection(props: {
  title: string
  action?: JSX.Element
  class?: string
  children: JSX.Element
}) {
  const id = createUniqueId()
  return (
    <section
      aria-labelledby={id}
      class={cn(statsCard, "flex min-w-0 flex-col gap-4 p-4", props.class)}
    >
      <div class="-mx-4 flex min-h-6 flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 pb-3">
        <h2 id={id} class="text-15px leading-6 font-semibold">
          {props.title}
        </h2>
        <Show when={props.action}>
          {(action) => <div class="ml-auto">{action()}</div>}
        </Show>
      </div>
      {props.children}
    </section>
  )
}

/** A page section's heading, the size of Home's rows. */
export function SectionHeading(props: {
  title: string
  /** Inline after the title, like a count or a privacy note. */
  children?: JSX.Element
  action?: JSX.Element
}) {
  return (
    <div class="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <h2 class="text-xl font-semibold tracking-tight">{props.title}</h2>
      {props.children}
      <Show when={props.action}>
        {(action) => <div class="ml-auto max-w-full">{action()}</div>}
      </Show>
    </div>
  )
}

/** Says a part of a profile is hidden from everyone else. */
export function PrivateNote() {
  return (
    <span
      title={tr("stats.private.hint")}
      class="text-muted-foreground bg-foreground/[0.06] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
    >
      <Icon icon={Lock} class="size-3" />
      {tr("stats.private.note")}
    </span>
  )
}

export type StatFigure = {
  label: string
  value: string
  icon: IconNode
  /** A line under the label, like "8 on the GPU". */
  detail?: string
}

/**
 * The headline figures as a card of rows, as Settings lists its rows: an
 * icon, what the figure counts, and the figure at the end, so it reads as
 * a sentence rather than a wall of numbers. With a title, it's a section
 * like the cards around it, and stretches to the height of its row.
 */
export function StatFigures(props: {
  figures: StatFigure[]
  title?: string
  class?: string
}) {
  return (
    <Show
      when={props.title}
      fallback={
        <FigureRows
          figures={props.figures}
          class={cn(statsCard, "divide-y self-start", props.class)}
        />
      }
    >
      {(title) => (
        <StatsSection title={title()} class={props.class}>
          <FigureRows figures={props.figures} class={statsRows} />
        </StatsSection>
      )}
    </Show>
  )
}

function FigureRows(props: { figures: StatFigure[]; class: string }) {
  return (
    <ul class={props.class}>
      <For each={props.figures} keyed={(figure) => figure.label}>
        {(figure) => (
          <li class="flex min-w-0 items-center gap-3.5 px-4 py-3">
            <Icon
              icon={figure().icon}
              class="text-muted-foreground size-5 shrink-0"
            />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-15px truncate leading-6">{figure().label}</span>
              <Show when={figure().detail}>
                <span class="text-muted-foreground truncate text-xs">
                  {figure().detail}
                </span>
              </Show>
            </span>
            <span class="text-15px shrink-0 leading-6 font-semibold">
              {figure().value}
            </span>
          </li>
        )}
      </For>
    </ul>
  )
}

export type RankedRow = {
  key: string
  label: JSX.Element
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

/**
 * Rows as the apps list them: the name, maybe a note under it, and the
 * figure at the end. No bars or percents: a list cut to its top rows, or
 * of things that overlap like genres, has no whole to measure them by.
 */
export function RankedBars(props: { rows: RankedRow[]; class?: string }) {
  return (
    <ul class={cn(statsRows, props.class)}>
      <For each={props.rows} keyed={(row) => row.key}>
        {(row) => (
          <li class="flex items-center justify-between gap-4 px-4 py-3">
            <span class="flex min-w-0 flex-col">
              <span class="text-15px truncate leading-6">{row().label}</span>
              <Show when={row().note}>
                <span class="text-muted-foreground truncate text-sm">
                  {row().note}
                </span>
              </Show>
            </span>
            <span class="text-15px shrink-0 leading-6 font-semibold">
              {row().detail}
            </span>
          </li>
        )}
      </For>
    </ul>
  )
}

/**
 * Nothing to show yet: an icon, what will appear, and a way on, like the
 * library page's empty state. `compact` for a part of a page.
 */
export function StatsEmpty(props: {
  icon: IconNode
  title: string
  description?: JSX.Element
  action?: JSX.Element
  compact?: boolean
  class?: string
}) {
  return (
    <Empty class={cn(props.compact ? "py-8" : "py-14", props.class)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" class="mb-3 size-9 [&_svg]:size-5">
          <Icon icon={props.icon} />
        </EmptyMedia>
        <EmptyTitle
          role="heading"
          aria-level={3}
          class="text-base font-semibold"
        >
          {props.title}
        </EmptyTitle>
        <Show when={props.description}>
          {(description) => (
            <EmptyDescription>{description()}</EmptyDescription>
          )}
        </Show>
      </EmptyHeader>
      <Show when={props.action}>
        {(action) => <EmptyContent>{action()}</EmptyContent>}
      </Show>
    </Empty>
  )
}
