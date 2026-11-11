import type { AccessPolicy, Library } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  DownloadIcon,
  FilmIcon,
  GaugeIcon,
  LibraryBigIcon,
  MonitorPlayIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { formatBitrate } from "@/components/player-format"
import { perLocale, tr } from "@/i18n"

/*
 * What an access policy allows, in the words the access panel, the group
 * editor, and a user's access dialog share.
 */

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** "Ana, Ben, and Cleo". */
export function formatList(items: readonly string[]): string {
  return lists().format(items)
}

/** The built-in group goes by the app's word for it, not its stored name. */
export function groupName(group: { name: string; everyone?: boolean }) {
  return group.everyone ? tr("access.everyone") : group.name
}

export function bitrateLimitLabel(limit: number | null): string {
  return limit === null
    ? tr("access.bitrate.none")
    : tr("access.bitrate.upTo", { rate: formatBitrate(limit) })
}

export function streamLimitLabel(limit: number | null): string {
  return limit === null
    ? tr("access.streams.none")
    : tr("access.streams.count", { count: limit })
}

/** How a policy's libraries read in a line of facts. */
type LibrariesFact = {
  label: string
  /** The picked libraries' names, for a tooltip. */
  names: string | undefined
}

/** "All libraries", "No libraries", or how many, with their names. */
function librariesFact(
  access: AccessPolicy["libraries"],
  libraries: readonly Library[] | undefined,
): LibrariesFact {
  if (access.all) return { label: tr("access.libraries.all"), names: undefined }
  // Ids of libraries that were removed since mean nothing any more.
  const picked = libraries
    ? libraries.filter((library) => access.ids.includes(library.id))
    : null
  const count = picked ? picked.length : access.ids.length
  if (count === 0) {
    return { label: tr("access.libraries.none"), names: undefined }
  }
  return {
    label: tr("access.libraries.count", { count }),
    names: picked
      ? formatList(picked.map((library) => library.name))
      : undefined,
  }
}

/** A fact with its glyph, sized to read in a line of them. */
export function Fact({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  /** The whole of it, when the text is cut short. */
  title?: string
  children: ReactNode
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-80"
      title={title}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * A line of what a policy allows: its libraries, its bit rate limit, the
 * encoding and download switches, and its stream limit.
 */
export function PolicyFacts({
  policy,
  libraries,
  className,
}: {
  policy: AccessPolicy
  /** Every library, for the names of those a list picks. */
  libraries: readonly Library[] | undefined
  className?: string
}) {
  const library = librariesFact(policy.libraries, libraries)
  return (
    <p
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[13px] leading-5",
        className,
      )}
    >
      <Fact icon={<LibraryBigIcon />} title={library.names}>
        {library.label}
      </Fact>
      <Fact icon={<GaugeIcon />}>{bitrateLimitLabel(policy.maxBitrate)}</Fact>
      <Fact icon={<FilmIcon />}>
        {policy.transcode
          ? tr("access.transcode.on")
          : tr("access.transcode.off")}
      </Fact>
      <Fact icon={<DownloadIcon />}>
        {policy.downloads
          ? tr("access.downloads.on")
          : tr("access.downloads.off")}
      </Fact>
      <Fact icon={<MonitorPlayIcon />}>
        {streamLimitLabel(policy.maxStreams)}
      </Fact>
    </p>
  )
}
