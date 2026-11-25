import {
  audioFormatName,
  type LibraryStats,
  type QualityStat,
  type StatsRange,
  videoCodecName,
} from "@matinee/contracts"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import {
  Clock,
  Film,
  FolderPlus,
  HardDrive,
  TvMinimal,
  TvMinimalPlay,
} from "lucide"
import { Match, Show, Switch } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { formatBytes, formatCount, formatWatchTime } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import {
  browserTimeZone,
  dynamicRangeName,
  RESOLUTION_ORDER,
  resolutionName,
} from "@/lib/stats"

import { GrowthChart } from "./growth-chart"
import {
  RankedBars,
  StatFigures,
  StatsEmpty,
  StatsSection,
  statsGrid,
} from "./stat-blocks"
import { WatchStatsSkeleton } from "./watch-stats"

const TIME_ZONE = browserTimeZone()

const DYNAMIC_RANGE_ORDER = ["dolby-vision", "hdr10", "hlg", "sdr", "unknown"]

/** `order` first, in its order, then anything else. */
function inOrder(rows: QualityStat[], order: string[]): QualityStat[] {
  const place = (name: string) => {
    const index = order.indexOf(name)
    return index === -1 ? order.length : index
  }
  return [...rows].sort((a, b) => place(a.name) - place(b.name))
}

/** A trait's files, as bars: its size at the end, how many files under its name. */
function QualitySection(props: {
  title: string
  rows: QualityStat[]
  name: (value: string) => string
}) {
  return (
    <Show when={props.rows.length > 0}>
      <StatsSection title={props.title}>
        <RankedBars
          rows={props.rows.map((row) => ({
            key: row.name,
            label: props.name(row.name),
            value: row.files,
            detail: formatBytes(row.sizeBytes),
            note: tr("stats.files", { count: row.files }),
          }))}
        />
      </StatsSection>
    </Show>
  )
}

/** What the libraries hold, how they grew, and in what quality. */
export function LibraryView(props: { range: StatsRange; admin: boolean }) {
  const openSettings = useOpenSettings()
  const stats = useQuery(() => ({
    ...orpc.stats.library.queryOptions({
      input: { range: props.range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  }))
  return (
    <Switch
      fallback={
        <p class="text-muted-foreground text-sm">{errorMessage(stats.error)}</p>
      }
    >
      <Match when={stats.isPending}>
        <WatchStatsSkeleton />
      </Match>
      <Match when={stats.isSuccess && stats.data}>
        {(data) => (
          <Show
            when={data().totals.files > 0}
            fallback={
              <StatsEmpty
                icon={FolderPlus}
                title={tr("stats.library.empty")}
                description={
                  props.admin
                    ? tr("stats.library.emptyAdmin")
                    : tr("stats.library.emptyUser")
                }
                action={
                  props.admin ? (
                    <Button onClick={() => openSettings("libraries")}>
                      {tr("stats.library.add")}
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            <LibrarySections stats={data()} />
          </Show>
        )}
      </Match>
    </Switch>
  )
}

/** The growth chart's heading; the range only applies to it. */
function addedTitle(range: StatsRange): string {
  return tr(`stats.library.added.${range}`)
}

function LibrarySections(props: { stats: LibraryStats }) {
  const libraries = () =>
    [...props.stats.libraries].sort((a, b) => b.sizeBytes - a.sizeBytes)
  return (
    <div class="flex flex-col gap-4">
      <StatFigures
        figures={[
          {
            label: tr("stats.library.movies"),
            value: formatCount(props.stats.totals.movies),
            icon: Film,
          },
          {
            label: tr("stats.library.shows"),
            value: formatCount(props.stats.totals.shows),
            icon: TvMinimal,
          },
          {
            label: tr("stats.library.episodes"),
            value: formatCount(props.stats.totals.episodes),
            icon: TvMinimalPlay,
          },
          {
            label: tr("stats.library.size"),
            value: formatBytes(props.stats.totals.sizeBytes),
            icon: HardDrive,
          },
          {
            label: tr("stats.library.runningTime"),
            value: formatWatchTime(props.stats.totals.durationSeconds),
            icon: Clock,
          },
        ]}
      />
      <StatsSection title={addedTitle(props.stats.range)}>
        <GrowthChart buckets={props.stats.growth} unit={props.stats.unit} />
      </StatsSection>
      <div class={statsGrid}>
        <StatsSection title={tr("stats.library.libraries")}>
          <RankedBars
            rows={libraries().map((library) => ({
              key: library.id,
              label: (
                <Link
                  to="/libraries/$libraryId"
                  params={{ libraryId: library.id }}
                  class="inline-flex max-w-full items-center gap-1.5 underline-offset-2 hover:underline"
                >
                  <Icon
                    icon={library.kind === "movies" ? Film : TvMinimal}
                    class="text-muted-foreground size-3.5 shrink-0"
                  />
                  <span class="truncate">{library.name}</span>
                </Link>
              ),
              value: library.sizeBytes,
              detail: formatBytes(library.sizeBytes),
              note: tr(`stats.${library.kind}`, { count: library.titles }),
            }))}
          />
        </StatsSection>
        <QualitySection
          title={tr("stats.library.resolution")}
          rows={inOrder(props.stats.resolutions, RESOLUTION_ORDER)}
          name={resolutionName}
        />
        <QualitySection
          title={tr("stats.library.dynamicRange")}
          rows={inOrder(props.stats.dynamicRange, DYNAMIC_RANGE_ORDER)}
          name={dynamicRangeName}
        />
        <QualitySection
          title={tr("stats.library.videoCodecs")}
          rows={props.stats.videoCodecs}
          name={(codec) =>
            codec === "unknown" ? tr("stats.notRead") : videoCodecName(codec)
          }
        />
        <QualitySection
          title={tr("stats.library.audioCodecs")}
          rows={props.stats.audioCodecs}
          name={(codec) =>
            codec === "unknown" ? tr("stats.notRead") : audioFormatName(codec)
          }
        />
      </div>
    </div>
  )
}
