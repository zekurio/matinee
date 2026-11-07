import {
  audioFormatName,
  type LibraryStats,
  type QualityStat,
  type StatsRange,
  videoCodecName,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FilmIcon, FolderPlusIcon, TvIcon } from "lucide-react"

import { tr } from "@/i18n"
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

/** A trait's share of the files, as bars: "231 files · 853 GB · 35%". */
function QualitySection({
  title,
  rows,
  name,
}: {
  title: string
  rows: QualityStat[]
  name: (value: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <StatsSection title={title}>
      <RankedBars
        share
        rows={rows.map((row) => ({
          key: row.name,
          label: name(row.name),
          value: row.files,
          detail: `${tr("stats.files", { count: row.files })} · ${formatBytes(row.sizeBytes)}`,
        }))}
      />
    </StatsSection>
  )
}

/** What the libraries hold, how they grew, and in what quality. */
export function LibraryView({
  range,
  admin,
}: {
  range: StatsRange
  admin: boolean
}) {
  const openSettings = useOpenSettings()
  const stats = useQuery({
    ...orpc.stats.library.queryOptions({
      input: { range, timeZone: TIME_ZONE },
    }),
    placeholderData: keepPreviousData,
  })
  if (stats.isPending) return <WatchStatsSkeleton />
  if (!stats.data) {
    return (
      <p className="text-muted-foreground text-sm">
        {errorMessage(stats.error)}
      </p>
    )
  }
  if (stats.data.totals.files === 0) {
    return (
      <StatsEmpty
        icon={FolderPlusIcon}
        title={tr("stats.library.empty")}
        description={
          admin ? tr("stats.library.emptyAdmin") : tr("stats.library.emptyUser")
        }
        action={
          admin ? (
            <Button onClick={() => openSettings("libraries")}>
              {tr("stats.library.add")}
            </Button>
          ) : undefined
        }
      />
    )
  }
  return <LibrarySections stats={stats.data} />
}

/** The growth chart's heading; the range only applies to it. */
function addedTitle(range: StatsRange): string {
  return tr(`stats.library.added.${range}`)
}

function LibrarySections({ stats }: { stats: LibraryStats }) {
  const { totals } = stats
  const libraries = [...stats.libraries].sort(
    (a, b) => b.sizeBytes - a.sizeBytes,
  )
  return (
    <div className="flex flex-col gap-10">
      <StatFigures
        figures={[
          {
            label: tr("stats.library.movies"),
            value: formatCount(totals.movies),
          },
          {
            label: tr("stats.library.shows"),
            value: formatCount(totals.shows),
          },
          {
            label: tr("stats.library.episodes"),
            value: formatCount(totals.episodes),
          },
          {
            label: tr("stats.library.size"),
            value: formatBytes(totals.sizeBytes),
          },
          {
            label: tr("stats.library.runningTime"),
            value: formatWatchTime(totals.durationSeconds),
          },
        ]}
      />
      <StatsSection title={addedTitle(stats.range)}>
        <GrowthChart buckets={stats.growth} unit={stats.unit} />
      </StatsSection>
      <div className={statsGrid}>
        <StatsSection title={tr("stats.library.libraries")}>
          <RankedBars
            share
            rows={libraries.map((library) => {
              const Icon = library.kind === "movies" ? FilmIcon : TvIcon
              return {
                key: library.id,
                label: (
                  <Link
                    to="/libraries/$libraryId"
                    params={{ libraryId: library.id }}
                    className="inline-flex max-w-full items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <Icon
                      aria-hidden
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                    <span className="truncate">{library.name}</span>
                  </Link>
                ),
                value: library.sizeBytes,
                detail: `${formatBytes(library.sizeBytes)} · ${tr(`stats.${library.kind}`, { count: library.titles })}`,
              }
            })}
          />
        </StatsSection>
        <QualitySection
          title={tr("stats.library.resolution")}
          rows={inOrder(stats.resolutions, RESOLUTION_ORDER)}
          name={resolutionName}
        />
        <QualitySection
          title={tr("stats.library.dynamicRange")}
          rows={inOrder(stats.dynamicRange, DYNAMIC_RANGE_ORDER)}
          name={dynamicRangeName}
        />
        <QualitySection
          title={tr("stats.library.videoCodecs")}
          rows={stats.videoCodecs}
          name={(codec) =>
            codec === "unknown" ? tr("stats.notRead") : videoCodecName(codec)
          }
        />
        <QualitySection
          title={tr("stats.library.audioCodecs")}
          rows={stats.audioCodecs}
          name={(codec) =>
            codec === "unknown" ? tr("stats.notRead") : audioFormatName(codec)
          }
        />
      </div>
    </div>
  )
}
