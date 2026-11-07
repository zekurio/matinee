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

import { formatBytes, formatCount, formatWatchTime, plural } from "@/lib/format"
import { errorMessage, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import {
  browserTimeZone,
  dynamicRangeName,
  RESOLUTION_ORDER,
  rangePhrase,
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
          detail: `${plural(row.files, "file")} · ${formatBytes(row.sizeBytes)}`,
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
        title="The libraries are empty"
        description={
          admin
            ? "Add a library to see how it grows."
            : "An admin hasn't added any videos yet."
        }
        action={
          admin ? (
            <Button onClick={() => openSettings("libraries")}>
              Add a library
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
  return range === "all" ? "Added over time" : `Added ${rangePhrase(range)}`
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
          { label: "Movies", value: formatCount(totals.movies) },
          { label: "Shows", value: formatCount(totals.shows) },
          { label: "Episodes", value: formatCount(totals.episodes) },
          { label: "Size", value: formatBytes(totals.sizeBytes) },
          {
            label: "Running time",
            value: formatWatchTime(totals.durationSeconds),
          },
        ]}
      />
      <StatsSection title={addedTitle(stats.range)}>
        <GrowthChart buckets={stats.growth} unit={stats.unit} />
      </StatsSection>
      <div className={statsGrid}>
        <StatsSection title="Libraries">
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
                detail: `${formatBytes(library.sizeBytes)} · ${plural(library.titles, library.kind === "movies" ? "movie" : "show")}`,
              }
            })}
          />
        </StatsSection>
        <QualitySection
          title="Resolution"
          rows={inOrder(stats.resolutions, RESOLUTION_ORDER)}
          name={resolutionName}
        />
        <QualitySection
          title="Dynamic range"
          rows={inOrder(stats.dynamicRange, DYNAMIC_RANGE_ORDER)}
          name={dynamicRangeName}
        />
        <QualitySection
          title="Video codecs"
          rows={stats.videoCodecs}
          name={(codec) =>
            codec === "unknown" ? "Not read yet" : videoCodecName(codec)
          }
        />
        <QualitySection
          title="Audio codecs"
          rows={stats.audioCodecs}
          name={(codec) =>
            codec === "unknown" ? "Not read yet" : audioFormatName(codec)
          }
        />
      </div>
    </div>
  )
}
