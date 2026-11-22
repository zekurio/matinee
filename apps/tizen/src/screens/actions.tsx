import {
  Calendar,
  CalendarClock,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  type IconNode,
  Info,
  List,
  Play,
  RotateCcw,
  Tv,
} from "lucide"
import { useRef, useState } from "preact/hooks"

import type { ActionTarget, WatchedAsk } from "@/app/actions"
import { useApp } from "@/app/scope"
import { session } from "@/auth/session"
import { locale, tr } from "@/i18n"
import { Icon, Tap } from "@/kit/base"
import { ListItem } from "@/kit/buttons"
import { SidePanel } from "@/kit/panel"
import { useObserved } from "@/lib/observable"
import { episodeCode, isResuming, itemLabel, seasonName } from "@/model/format"
import type { WatchedWhen } from "@/model/viewer"

/** An entry in the panel. `leaves` for one that opens another page, so focus doesn't go back to the card. */
type Entry = {
  icon: IconNode
  filled?: boolean
  label: string
  leaves?: boolean
  run: () => void
}

/** What the panel shows: a menu, the watched question, or the day for it. */
type View =
  | { kind: "menu"; target: ActionTarget }
  | { kind: "watched"; ask: WatchedAsk }
  | { kind: "day"; ask: WatchedAsk }

/**
 * One part of the watched day, as a row: Left and Right step it one back
 * or forward, with arrows either side while focused.
 */
function DayField(props: {
  fid: string
  value: string
  onStep: (step: number) => void
}) {
  return (
    <Tap
      fid={props.fid}
      class="ctl item day-field"
      onKeyDown={(event) => {
        if (event.keyCode !== 37 && event.keyCode !== 39) return
        event.preventDefault()
        props.onStep(event.keyCode === 37 ? -1 : 1)
      }}
    >
      <Icon icon={ChevronLeft} size={20} class="arrow" />
      <span class="t-facts words" style={{ textAlign: "center" }}>
        {props.value}
      </span>
      <Icon icon={ChevronRight} size={20} class="arrow" />
    </Tap>
  )
}

/**
 * The panel at the right edge that shows what the phone's actions sheet
 * would, for the card that opened it by a held Select: play, the marks,
 * and its pages, without the phone's downloads and the admin's metadata
 * items. Marking something watched asks when first, as on the phone: now,
 * on release, a day to pick, or unknown.
 */
export function ActionsPanel() {
  const { nav, viewer, toasts, actions } = useApp()
  const { target, watched } = useObserved(actions)
  const [picking, setPicking] = useState<WatchedAsk | null>(null)
  const current: View | null = watched
    ? picking === watched
      ? { kind: "day", ask: watched }
      : { kind: "watched", ask: watched }
    : target
      ? { kind: "menu", target }
      : null
  // Kept through the slide out, after the state is cleared.
  const last = useRef<View | null>(null)
  if (current) last.current = current
  const view = last.current
  // An entry opened another page, so focus stays there when the panel closes.
  const leaving = useRef(false)
  const [day, setDay] = useState(() => new Date())

  const close = () => {
    setPicking(null)
    actions.close()
  }
  const mark = (ask: WatchedAsk, when: WatchedWhen) => {
    void toasts.showing(tr("mediaMarkWatchedFailed"), () => ask.mark(when))
    close()
  }
  const failing = (failure: string, work: () => Promise<void>) => () =>
    void toasts.showing(failure, work)

  const entries = (menu: ActionTarget): Entry[] => {
    switch (menu.kind) {
      case "item": {
        const { item } = menu
        const label = itemLabel(item)
        const isWatched = viewer.isItemWatched(item)
        const favorite = viewer.isItemFavorite(item)
        const resume = isResuming(item)
        const title = item.title
        return [
          {
            icon: Play,
            label: tr(resume ? "titleResume" : "titlePlay"),
            leaves: true,
            run: () => nav.play(item.id),
          },
          ...(resume
            ? [
                {
                  icon: RotateCcw,
                  label: tr("actionsPlayFromStart"),
                  leaves: true,
                  run: () => nav.play(item.id, 0),
                },
              ]
            : []),
          {
            icon: Check,
            label: tr(isWatched ? "mediaMarkUnwatched" : "mediaMarkWatched"),
            // Unwatched at once; watched asks when first.
            run: isWatched
              ? failing(tr("mediaMarkUnwatchedFailed"), () =>
                  viewer.setItemWatched(item, false),
                )
              : () =>
                  actions.askWatched(
                    episodeCode(item) ? label.title : label.showName,
                    (when) => viewer.setItemWatched(item, true, when),
                  ),
          },
          {
            icon: Heart,
            filled: favorite,
            label: tr(favorite ? "mediaRemoveFavorite" : "mediaAddFavorite"),
            run: failing(tr("mediaFavoriteFailed"), () =>
              viewer.setItemFavorite(item, !favorite),
            ),
          },
          ...(title?.kind === "show"
            ? [
                {
                  icon: Info,
                  label: tr("actionsEpisodeDetails"),
                  leaves: true,
                  run: () => nav.episode(item.id),
                },
                {
                  icon: Tv,
                  label: tr("actionsGoToShow", title.name),
                  leaves: true,
                  run: () => nav.titleUp(title.id),
                },
              ]
            : title
              ? [
                  {
                    icon: Info,
                    label: tr("mediaHeroDetails"),
                    leaves: true,
                    run: () => nav.titleUp(title.id),
                  },
                ]
              : []),
        ]
      }
      case "title": {
        const { title } = menu
        const isWatched = viewer.isWatched(title)
        const favorite = viewer.isFavorite(title)
        const show = title.kind === "show"
        return [
          {
            icon: Play,
            label: tr("titlePlay"),
            leaves: true,
            run: failing(tr("mediaPlayFailed", title.name), async () => {
              const { next } = await session.api.titles.get({ id: title.id })
              if (next) nav.play(next.id)
              else toasts.show(tr("mediaNoFiles", title.name))
            }),
          },
          {
            icon: Check,
            label: tr(
              show
                ? isWatched
                  ? "mediaMarkAllUnwatched"
                  : "mediaMarkAllWatched"
                : isWatched
                  ? "mediaMarkUnwatched"
                  : "mediaMarkWatched",
            ),
            run: isWatched
              ? failing(tr("mediaMarkUnwatchedFailed"), () =>
                  viewer.setWatched(title, false),
                )
              : () =>
                  actions.askWatched(title.name, (when) =>
                    viewer.setWatched(title, true, undefined, when),
                  ),
          },
          {
            icon: Heart,
            filled: favorite,
            label: tr(favorite ? "mediaRemoveFavorite" : "mediaAddFavorite"),
            run: failing(tr("mediaFavoriteFailed"), () =>
              viewer.setFavorite(title, !favorite),
            ),
          },
          {
            icon: Info,
            label: tr(show ? "mediaHeroEpisodes" : "mediaHeroDetails"),
            leaves: true,
            run: () => nav.titleUp(title.id),
          },
        ]
      }
      case "season": {
        const { title, season } = menu
        const favorite = viewer.isSeasonFavorite(title, season)
        const number = season.number
        return [
          // The files without a season number aren't a season to mark.
          ...(number === null
            ? []
            : [
                {
                  icon: Check,
                  label: tr(
                    season.itemCount > 0 &&
                      season.watchedCount >= season.itemCount
                      ? "mediaMarkUnwatched"
                      : "mediaMarkWatched",
                  ),
                  run:
                    season.itemCount > 0 &&
                    season.watchedCount >= season.itemCount
                      ? failing(tr("mediaMarkUnwatchedFailed"), () =>
                          viewer.setWatched(title, false, number),
                        )
                      : () =>
                          actions.askWatched(
                            tr("titleSeasonOf", title.name, seasonName(number)),
                            (when) =>
                              viewer.setWatched(title, true, number, when),
                          ),
                },
                {
                  icon: Heart,
                  filled: favorite,
                  label: tr(
                    favorite ? "mediaRemoveFavorite" : "mediaAddFavorite",
                  ),
                  run: failing(tr("mediaFavoriteFailed"), () =>
                    viewer.setSeasonFavorite(title, season, !favorite),
                  ),
                },
              ]),
          {
            icon: List,
            label: tr("mediaHeroEpisodes"),
            leaves: true,
            run: () => nav.season(title.id, number),
          },
        ]
      }
    }
  }

  const heading = (): [string | null, string | null] => {
    if (!view) return [null, null]
    if (view.kind === "watched") return [tr("mediaMarkWatched"), view.ask.name]
    if (view.kind === "day") return [tr("mediaWatchedDateTitle"), view.ask.name]
    const menu = view.target
    if (menu.kind === "title") {
      return [
        menu.title.name,
        menu.title.year === null ? null : String(menu.title.year),
      ]
    }
    if (menu.kind === "season")
      return [seasonName(menu.season.number), menu.title.name]
    const label = itemLabel(menu.item)
    return episodeCode(menu.item)
      ? [label.title, label.showName]
      : [label.showName, label.year]
  }
  const [title, description] = heading()
  const today = new Date()
  const step = (change: (date: Date) => void) => {
    const next = new Date(day)
    change(next)
    setDay(next > today ? today : next)
  }

  return (
    <SidePanel
      open={current !== null}
      title={title}
      description={description}
      // From the day, Back goes to the question it came from.
      onBack={() => (current?.kind === "day" ? setPicking(null) : close())}
      focusKey={view?.kind}
      returnFocus={leaving.current ? false : undefined}
    >
      {view?.kind === "menu" &&
        entries(view.target).map((entry, index) => (
          <ListItem
            key={entry.label}
            fid={`entry-${index}`}
            title={entry.label}
            leading={
              <Icon
                icon={entry.icon}
                size={24}
                class="lead"
                filled={entry.filled}
              />
            }
            quiet
            onPress={() => {
              leaving.current = entry.leaves ?? false
              actions.close()
              entry.run()
            }}
          />
        ))}
      {view?.kind === "watched" && (
        <>
          <ListItem
            fid="now"
            title={tr("mediaWatchedAtNow")}
            icon={Clock}
            quiet
            onPress={() => mark(view.ask, undefined)}
          />
          <ListItem
            fid="released"
            title={tr("mediaWatchedAtReleased")}
            icon={Calendar}
            quiet
            onPress={() => mark(view.ask, "released")}
          />
          <ListItem
            fid="other"
            title={tr("mediaWatchedAtOther")}
            icon={CalendarClock}
            quiet
            onPress={() => {
              setDay(new Date())
              setPicking(view.ask)
            }}
          />
          <ListItem
            fid="unknown"
            title={tr("mediaWatchedAtUnknown")}
            icon={CalendarOff}
            quiet
            onPress={() => mark(view.ask, "unknown")}
          />
        </>
      )}
      {view?.kind === "day" && (
        <>
          <DayField
            fid="day"
            value={String(day.getDate())}
            onStep={(by) => step((date) => date.setDate(date.getDate() + by))}
          />
          <DayField
            fid="month"
            value={day.toLocaleDateString(locale, { month: "long" })}
            onStep={(by) => step((date) => date.setMonth(date.getMonth() + by))}
          />
          <DayField
            fid="year"
            value={String(day.getFullYear())}
            onStep={(by) =>
              step((date) => date.setFullYear(date.getFullYear() + by))
            }
          />
          <div style={{ paddingTop: "12rem" }}>
            <ListItem
              fid="mark"
              title={tr("mediaMarkWatched")}
              icon={Check}
              quiet
              onPress={() =>
                mark(
                  view.ask,
                  new Date(
                    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
                  ),
                )
              }
            />
          </div>
        </>
      )}
    </SidePanel>
  )
}
