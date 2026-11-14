import type { AccessPolicy, Library, RequestLimit } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  DownloadIcon,
  FilmIcon,
  GaugeIcon,
  InboxIcon,
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

/** "No limit", or "5 titles every 7 days". */
export function requestLimitLabel(limit: RequestLimit): string {
  if (limit === null) return tr("access.requestLimit.none")
  return tr("access.requestLimit.rate", {
    titles: tr("access.requestLimit.titles", { count: limit.titles }),
    period: tr("access.requestLimit.period", { count: limit.days }),
  })
}

/** "Requests need approval, 5 titles every 7 days", or "No requests". */
export function requestsFactLabel(
  policy: Pick<AccessPolicy, "requests" | "requestLimit">,
): string {
  const requests =
    policy.requests === "off"
      ? tr("access.requests.factOff")
      : policy.requests === "ask"
        ? tr("access.requests.factAsk")
        : tr("access.requests.factAdd")
  if (policy.requests === "off" || policy.requestLimit === null) return requests
  return tr("access.requests.factLimited", {
    requests,
    limit: requestLimitLabel(policy.requestLimit),
  })
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

/** A policy's libraries in a few words, like "All libraries" or "2 libraries". */
export function librariesLabel(
  access: AccessPolicy["libraries"],
  libraries: readonly Library[] | undefined,
): string {
  return librariesFact(access, libraries).label
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
 * encoding and download switches, its stream limit, and its requests.
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
      <Fact icon={<InboxIcon />}>{requestsFactLabel(policy)}</Fact>
    </p>
  )
}
