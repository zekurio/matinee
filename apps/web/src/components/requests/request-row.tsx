import type { AdminRequestItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  BanIcon,
  CheckIcon,
  CircleOffIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  InfoIcon,
  LibraryBigIcon,
  PlayIcon,
  RotateCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ReactNode, type Ref, useId } from "react"

import { Picture, tone } from "@/components/picture"
import { UserAvatar } from "@/components/user-avatar"
import { tr, translateKnown } from "@/i18n"
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatSpan,
} from "@/lib/format"
import { art } from "@/lib/media"

import { type Answer, DeclinePopover } from "./decline-popover"
import { GoesToLibrary, useGoesTo } from "./goes-to"
import { KeyTip } from "./key-tip"
import {
  askers,
  formatNames,
  formatPercent,
  type QueueList,
  scopeLabel,
  titleLink,
} from "./request-queue"

/*
 * A request in the queue, on one row of a grid every row of a list
 * shares, so each fact sits in a column you can read down: the poster,
 * the title, who requested it and when, where it goes or how it stands,
 * and the actions. Each cell is a line and at most one more under it.
 */

/**
 * The columns. Waiting gives "Goes to" the room of the people beside it;
 * the other lists' state cell (a problem, progress, an outcome) reads
 * longer, so it takes twice that. Phones stack the cells beside the poster.
 */
export function rowColumns(list: QueueList): string {
  return list === "waiting"
    ? "sm:grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_auto]"
    : "sm:grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)_minmax(0,4fr)_auto]"
}

/** A button in a row: compact under a mouse, a full touch target on phones. */
const rowButton = "[@media(pointer:coarse)]:h-10"

/**
 * One request. Rows collapse in place when an action takes them out, and
 * are inert while they do.
 */
export function RequestRow({
  item,
  list,
  collapsed,
  rowRef,
  focusable,
  reserveReopen,
  declineOpen,
  onDeclineOpenChange,
  declineFinalFocus,
  onDeclineClosed,
  onFocusRow,
  onAdd,
  onAnswer,
  onRetry,
  onReopen,
  onRemove,
}: {
  item: AdminRequestItem
  list: QueueList
  collapsed: boolean
  rowRef: Ref<HTMLElement>
  /** The row J and K landed on, which Tab enters the list at. */
  focusable: boolean
  /**
   * Done lists a declined request beside this one, so this row keeps the
   * room its buttons take, for the columns to line up.
   */
  reserveReopen: boolean
  /** The popover that declines it, or gives it up. */
  declineOpen: boolean
  onDeclineOpenChange: (open: boolean) => void
  declineFinalFocus?: () => HTMLElement | boolean
  onDeclineClosed?: () => void
  onFocusRow: () => void
  onAdd: () => void
  onAnswer: (answer: Answer) => void
  onRetry: () => void
  /** Lift a decline: allow requests again, or add it after all. */
  onReopen: (kind: "allowAgain" | "addAfterAll") => void
  onRemove: () => void
}) {
  const id = useId()
  const poster = art(item.title.poster, "small")
  const facts = [
    item.title.year === null ? null : String(item.title.year),
    tr(`requests.kind.${item.title.ref.kind}`),
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <article
          ref={rowRef}
          tabIndex={focusable ? 0 : -1}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-details`}
          onFocus={onFocusRow}
          className={cn(
            "relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 border-b py-2 pr-2 pl-4 outline-none sm:gap-x-4 sm:py-1.5",
            rowColumns(list),
            // The row J and K are on: a bar of the accent down its edge
            // while focus is in it.
            "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-transparent focus-within:before:bg-primary",
            "focus-visible:bg-foreground/[0.04]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "relative row-span-4 aspect-[2/3] w-10 self-start overflow-hidden rounded-[4px] border sm:row-span-1 sm:w-8 sm:self-center",
              tone(item.title.ref.providerId),
            )}
          >
            {poster && <Picture sources={[poster]} sizes="40px" />}
          </span>

          <Cell second={scopeLabel(item.scope)} className="max-sm:col-start-2">
            <h3
              id={`${id}-name`}
              className="flex min-w-0 items-baseline gap-2 text-sm"
            >
              <Link
                {...titleLink(item)}
                tabIndex={-1}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {item.title.name}
              </Link>
              <span className="text-muted-foreground shrink-0 text-[13px]">
                {facts}
              </span>
            </h3>
          </Cell>

          {/* Read with the name: who, then the state, in the order the
              columns show them. */}
          <div id={`${id}-details`} className="contents">
            <Who item={item} />
            {list === "waiting" && <GoesToCell item={item} />}
            {list === "needsAttention" && <ProblemCell item={item} />}
            {list === "onTheWay" && <ProgressCell item={item} />}
            {list === "done" && <OutcomeCell item={item} />}
          </div>

          <div className="flex items-center gap-1 max-sm:col-start-2 max-sm:pt-1 sm:justify-end">
            {list === "waiting" && (
              <>
                <DeclinePopover
                  item={item}
                  open={declineOpen}
                  onOpenChange={onDeclineOpenChange}
                  onAnswer={onAnswer}
                  finalFocus={declineFinalFocus}
                  onClosed={onDeclineClosed}
                  trigger={
                    <KeyTip label={tr("requests.decline")} keys="D">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-keyshortcuts="D"
                        aria-label={tr("requests.decline.title", {
                          name: item.title.name,
                        })}
                        className={cn(rowButton, "data-popup-open:bg-muted")}
                      >
                        {tr("requests.decline")}
                      </Button>
                    </KeyTip>
                  }
                />
                <KeyTip label={tr("requests.add")} keys="A">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-keyshortcuts="A"
                    aria-label={tr("requests.addNamed", {
                      name: item.title.name,
                    })}
                    className={rowButton}
                    onClick={onAdd}
                  >
                    <CheckIcon />
                    {tr("requests.add")}
                  </Button>
                </KeyTip>
              </>
            )}
            {(list === "needsAttention" || list === "onTheWay") && (
              <DeclinePopover
                item={item}
                giveUp
                open={declineOpen}
                onOpenChange={onDeclineOpenChange}
                onAnswer={onAnswer}
                finalFocus={declineFinalFocus}
                onClosed={onDeclineClosed}
                trigger={
                  <KeyTip label={tr("requests.giveUp")} keys="G">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-keyshortcuts="G"
                      aria-label={tr("requests.giveUpNamed", {
                        name: item.title.name,
                      })}
                      className={cn(rowButton, "data-popup-open:bg-muted")}
                    >
                      {tr("requests.giveUp")}
                    </Button>
                  </KeyTip>
                }
              />
            )}
            {list === "needsAttention" && (
              <KeyTip label={tr("requests.retry")} keys="R">
                <Button
                  variant="outline"
                  size="sm"
                  aria-keyshortcuts="R"
                  aria-label={tr("requests.retryNamed", {
                    name: item.title.name,
                  })}
                  className={rowButton}
                  onClick={onRetry}
                >
                  <RotateCwIcon />
                  {tr("requests.retry")}
                </Button>
              </KeyTip>
            )}
            {list === "done" &&
              (item.status === "declined" ? (
                <ReopenButtons item={item} onReopen={onReopen} />
              ) : (
                reserveReopen && (
                  // The same buttons, unseen, holding their room.
                  <span aria-hidden inert className="invisible flex gap-1">
                    <ReopenButtons item={item} onReopen={onReopen} />
                  </span>
                )
              ))}
            <RowMenu item={item} onRemove={onRemove} />
          </div>
        </article>
      </div>
    </li>
  )
}

/**
 * What lifts a decline, on a declined request in Done: "Allow requests
 * again", which removes it so anyone may request the title afresh, and
 * "Add after all", which accepts it as it was and sends it.
 */
function ReopenButtons({
  item,
  onReopen,
}: {
  item: AdminRequestItem
  onReopen: (kind: "allowAgain" | "addAfterAll") => void
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={tr("requests.allowAgainNamed", { name: item.title.name })}
        className={rowButton}
        onClick={() => onReopen("allowAgain")}
      >
        {tr("requests.allowAgain")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={tr("requests.addAfterAllNamed", { name: item.title.name })}
        className={rowButton}
        onClick={() => onReopen("addAfterAll")}
      >
        <CheckIcon />
        {tr("requests.addAfterAll")}
      </Button>
    </>
  )
}

/** A cell: its line, and under it at most one more in muted type. */
function Cell({
  children,
  second,
  className,
}: {
  children: ReactNode
  second?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center text-[13px] leading-5",
        className,
      )}
    >
      {children}
      {second && <p className="text-muted-foreground truncate">{second}</p>}
    </div>
  )
}

/** Who requested it first and when; anyone else after a count. */
function Who({ item }: { item: AdminRequestItem }) {
  const { first, rest } = askers(item)
  if (!first) return <span aria-hidden className="max-sm:hidden" />
  const others = rest.map((entry) => entry.name)
  return (
    <div className="flex min-w-0 items-center gap-2.5 max-sm:col-start-2">
      <UserAvatar
        user={{
          avatarId: first.avatarId,
          displayName: first.name,
          username: first.name,
        }}
        className="size-7 shrink-0 text-[11px] max-sm:hidden"
      />
      <Cell
        second={
          <span title={formatDateTime(first.createdAt)}>
            {formatRelative(first.createdAt)}
          </span>
        }
      >
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-foreground/85 truncate">{first.name}</span>
          {others.length > 0 && (
            <span
              className="text-muted-foreground shrink-0 tabular-nums"
              title={tr("requests.alsoRequested", {
                names: formatNames(others),
              })}
            >
              <span aria-hidden>
                {tr("requests.othersCount", { count: others.length })}
              </span>
              <span className="sr-only">
                {tr("requests.alsoRequested", { names: formatNames(others) })}
              </span>
            </span>
          )}
        </p>
      </Cell>
    </div>
  )
}

/** The connection under the library, or that nothing fills it. */
function ConnectionLine({ connection }: { connection: string | null }) {
  if (connection) return connection
  return <span className="text-warning">{tr("requests.noConnection")}</span>
}

/** Where a waiting request goes, which it can change before Add. */
function GoesToCell({ item }: { item: AdminRequestItem }) {
  const { connection } = useGoesTo(item)
  return (
    <Cell
      second={<ConnectionLine connection={connection} />}
      className="max-sm:col-start-2"
    >
      <p className="text-foreground/85 flex min-w-0 items-center gap-1.5">
        <LibraryBigIcon
          aria-hidden
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <span className="sr-only">{tr("requests.goesTo.label")} </span>
        <GoesToLibrary item={item} />
      </p>
    </Cell>
  )
}

/** "Films · Radarr": where a request went, under its state. */
function whereLine(item: AdminRequestItem): string {
  return [item.library.name, item.connection?.name].filter(Boolean).join(" · ")
}

/** What went wrong sending it. */
function ProblemCell({ item }: { item: AdminRequestItem }) {
  const error = item.error
    ? translateKnown(item.error)
    : tr("requests.attention.unknown")
  return (
    <Cell second={whereLine(item)} className="max-sm:col-start-2">
      <p className="flex min-w-0 items-center gap-1.5" title={error}>
        <TriangleAlertIcon
          aria-hidden
          className="text-warning size-3.5 shrink-0"
        />
        <span className="truncate">{error}</span>
      </p>
    </Cell>
  )
}

/** How far along a request on its way is. */
function ProgressCell({ item }: { item: AdminRequestItem }) {
  const { availability } = item
  let status: string
  if (availability.state === "release") {
    status = availability.releaseDate
      ? tr("requests.progress.release", {
          date: formatDate(new Date(availability.releaseDate)),
        })
      : tr("requests.progress.notOut")
  } else if (availability.progress !== null) {
    status = [
      formatPercent(availability.progress),
      availability.etaSeconds === null
        ? null
        : tr("requests.progress.left", {
            time: formatSpan(availability.etaSeconds),
          }),
    ]
      .filter(Boolean)
      .join(" · ")
  } else if (availability.stillLooking) {
    status = tr("requests.progress.looking")
  } else if (item.fulfilmentState === "queued") {
    status = tr("requests.progress.queued")
  } else if (item.connection && !item.connection.reportsProgress) {
    status = tr("requests.progress.byHand")
  } else {
    status = tr("requests.progress.sent")
  }
  const percent =
    availability.progress === null
      ? null
      : Math.round(availability.progress * 100)

  return (
    <Cell second={whereLine(item)} className="max-sm:col-start-2">
      <p className="flex min-w-0 items-center gap-2.5">
        {percent !== null && (
          <span
            role="progressbar"
            aria-label={tr("requests.progress.label", {
              name: item.title.name,
            })}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-secondary h-1 w-24 shrink-0 overflow-hidden rounded-full"
          >
            <span
              className="bg-primary block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
        <span className="text-foreground/85 truncate tabular-nums">
          {status}
        </span>
      </p>
    </Cell>
  )
}

/**
 * What became of a done request, with the note an admin left: arrived,
 * declined with its reason, or given up on for want of a copy.
 */
function OutcomeCell({ item }: { item: AdminRequestItem }) {
  if (item.status === "declined") {
    const when = item.declinedAt
    const gaveUp = item.reason === "notFound"
    const Icon = gaveUp ? CircleOffIcon : BanIcon
    const outcome = [
      when
        ? tr(gaveUp ? "requests.done.gaveUp" : "requests.done.declined", {
            when: formatRelative(when),
          })
        : tr(
            gaveUp
              ? "requests.done.gaveUpUndated"
              : "requests.done.declinedUndated",
          ),
      item.reason ? tr(`requests.reason.${item.reason}`) : null,
    ]
      .filter(Boolean)
      .join(" · ")
    return (
      <Cell
        second={
          item.note ? (
            <span className="italic" title={item.note}>
              {item.note}
            </span>
          ) : (
            item.library.name
          )
        }
        className="max-sm:col-start-2"
      >
        <p
          className="flex min-w-0 items-center gap-1.5"
          title={when ? formatDateTime(when) : undefined}
        >
          <Icon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <span className="text-foreground/85 truncate">{outcome}</span>
        </p>
      </Cell>
    )
  }
  return (
    <Cell second={whereLine(item)} className="max-sm:col-start-2">
      {item.arrivedAt && (
        <p
          className="flex min-w-0 items-center gap-1.5"
          title={formatDateTime(item.arrivedAt)}
        >
          <CheckIcon aria-hidden className="text-success size-3.5 shrink-0" />
          <span className="text-foreground/85 truncate">
            {tr("requests.done.arrived", {
              when: formatRelative(item.arrivedAt),
            })}
          </span>
        </p>
      )}
    </Cell>
  )
}

function RowMenu({
  item,
  onRemove,
}: {
  item: AdminRequestItem
  onRemove: () => void
}) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tr("requests.more", { name: item.title.name })}
            className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground max-sm:ml-auto [@media(pointer:coarse)]:size-10"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
        <DropdownMenuItem onClick={() => void navigate(titleLink(item))}>
          {item.availability.libraryTitleId ? <PlayIcon /> : <InfoIcon />}
          {tr("requests.openTitle")}
        </DropdownMenuItem>
        {item.remoteUrl && item.connection && (
          <DropdownMenuItem
            render={
              <a href={item.remoteUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLinkIcon />
            {tr("requests.openRemote", { connection: item.connection.name })}
          </DropdownMenuItem>
        )}
        {/* A declined request's removal is "Allow requests again",
            beside the menu. */}
        {item.status !== "declined" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2Icon />
              {tr("requests.remove")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
