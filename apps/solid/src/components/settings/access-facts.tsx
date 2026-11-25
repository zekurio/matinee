import {
  type AccessLevel,
  type AccessPolicy,
  areaLevels,
  type Library,
  MANAGED_AREAS,
  type ManagedArea,
  type RequestLimit,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Download,
  Film,
  Gauge,
  Inbox,
  KeySquare,
  LibraryBig,
  MonitorPlay,
  ShieldCheck,
} from "lucide"
import { Show } from "solid-js"

import { formatBitrate } from "@/components/player-format"
import { perLocale, tr } from "@/i18n"
import { Icon } from "@/kit/icon"

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
  const choice = policy.requests
  const requests =
    choice === "off"
      ? tr("access.requests.factOff")
      : choice === "ask"
        ? tr("access.requests.factAsk")
        : tr("access.requests.factAdd")
  if (choice === "off" || policy.requestLimit === null) return requests
  return tr("access.requests.factLimited", {
    requests,
    limit: requestLimitLabel(policy.requestLimit),
  })
}

/** An area of running the server, like "Requests" or "Users". */
export function areaLabel(area: ManagedArea): string {
  return tr(`access.area.${area}`)
}

/** What an area covers, in a line. */
export function areaHint(area: ManagedArea): string {
  return tr(`access.area.${area}.hint`)
}

/**
 * A level of an area. An area that is all or nothing says "On" for
 * `manage`, as a switch would.
 */
export function levelLabel(area: ManagedArea, level: AccessLevel): string {
  if (areaLevels(area).length === 2) {
    return level === "none" ? tr("access.level.off") : tr("access.level.on")
  }
  return tr(`access.level.${level}`)
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
export function Fact(props: {
  icon: JSX.Element
  /** The whole of it, when the text is cut short. */
  title?: string
  children: JSX.Element
}) {
  return (
    <span
      class="inline-flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-80"
      title={props.title}
    >
      {props.icon}
      <span class="truncate">{props.children}</span>
    </span>
  )
}

/**
 * "Every permission" for an admin, or how many parts of running the
 * server a policy hands on. Null for none. The tooltip names them.
 */
function managesFact(
  policy: AccessPolicy,
  admin: boolean,
): { label: string; names: string } | null {
  if (admin) {
    return {
      label: tr("access.permissions.all"),
      names: tr("access.permissions.allHint"),
    }
  }
  const areas = MANAGED_AREAS.filter((area) => policy.manages[area] !== "none")
  if (areas.length === 0) return null
  return {
    label: tr("access.manages.count", { count: areas.length }),
    names: formatList(
      areas.map((area) =>
        tr("access.manages.area", {
          area: areaLabel(area),
          level: levelLabel(area, policy.manages[area]),
        }),
      ),
    ),
  }
}

/**
 * A line of what a policy allows: its libraries, its bit rate limit, the
 * encoding and download switches, its stream limit, its requests, API
 * tokens, and the parts of running the server it hands on.
 */
export function PolicyFacts(props: {
  policy: AccessPolicy
  /** An admin's, which has every permission whatever it says. */
  admin?: boolean
  /** Every library, for the names of those a list picks. */
  libraries: readonly Library[] | undefined
  class?: string
}) {
  const library = () => librariesFact(props.policy.libraries, props.libraries)
  const more = () => managesFact(props.policy, props.admin ?? false)
  return (
    <p
      class={cn(
        "text-muted-foreground text-13px flex flex-wrap items-center gap-x-3.5 gap-y-0.5 leading-5",
        props.class,
      )}
    >
      <Fact icon={<Icon icon={LibraryBig} />} title={library().names}>
        {library().label}
      </Fact>
      <Fact icon={<Icon icon={Gauge} />}>
        {bitrateLimitLabel(props.policy.maxBitrate)}
      </Fact>
      <Fact icon={<Icon icon={Film} />}>
        {props.policy.transcode
          ? tr("access.transcode.on")
          : tr("access.transcode.off")}
      </Fact>
      <Fact icon={<Icon icon={Download} />}>
        {props.policy.downloads
          ? tr("access.downloads.on")
          : tr("access.downloads.off")}
      </Fact>
      <Fact icon={<Icon icon={MonitorPlay} />}>
        {streamLimitLabel(props.policy.maxStreams)}
      </Fact>
      <Fact icon={<Icon icon={Inbox} />}>
        {requestsFactLabel(props.policy)}
      </Fact>
      <Show when={props.policy.apiTokens}>
        <Fact icon={<Icon icon={KeySquare} />}>
          {tr("access.apiTokens.on")}
        </Fact>
      </Show>
      <Show when={more()}>
        {(fact) => (
          <Fact icon={<Icon icon={ShieldCheck} />} title={fact().names}>
            {fact().label}
          </Fact>
        )}
      </Show>
    </p>
  )
}
