import {
  BITRATE_LIMITS,
  type Capabilities,
  type Library,
  type ManagedArea,
  MANAGES_NOTHING,
  type Permission,
  permissionsOf,
  type RequestMode,
  type RequestQuota,
} from "@matinee/contracts"
import { Input } from "@matinee/ui/components/input"
import { Switch } from "@matinee/ui/components/switch"
import { useId } from "react"

import { libraryIcons } from "@/components/app-shell"
import { tr } from "@/i18n"

import { bitrateLimitLabel, streamLimitLabel } from "./access-facts"

/*
 * The controls the group editor and a user's access dialog share. Selects
 * hold strings, so a limit is its number as text, or `NO_LIMIT`.
 */

export const NO_LIMIT = "none"

/** How many devices a form offers to let play at once. */
const STREAM_LIMITS: readonly number[] = [1, 2, 3, 4, 5, 10]

/** A limit as a select holds it. */
export function limitValue(limit: number | null): string {
  return limit === null ? NO_LIMIT : String(limit)
}

/** A select's value as a limit. */
export function limitOf(value: string): number | null {
  return value === NO_LIMIT ? null : Number(value)
}

/**
 * No limit, then `choices`, with `current` too when it isn't one of them,
 * as a limit the provider's policy claim set can be.
 */
function limitOptions(
  choices: readonly number[],
  current: string,
  descending: boolean,
): string[] {
  const values = [...choices]
  const own = current === NO_LIMIT ? null : Number(current)
  if (own !== null && Number.isFinite(own) && !values.includes(own)) {
    values.push(own)
  }
  values.sort((a, b) => (descending ? b - a : a - b))
  return [NO_LIMIT, ...values.map(String)]
}

export function bitrateOptions(current: string): string[] {
  return limitOptions(BITRATE_LIMITS, current, true)
}

export function streamOptions(current: string): string[] {
  return limitOptions(STREAM_LIMITS, current, false)
}

export function bitrateLabel(value: string): string {
  return bitrateLimitLabel(limitOf(value))
}

export function streamLabel(value: string): string {
  return streamLimitLabel(limitOf(value))
}

/** A switch per library, for a policy that lists the libraries it opens. */
export function LibraryPicker({
  libraries,
  value,
  onChange,
}: {
  libraries: readonly Library[] | undefined
  value: readonly string[]
  onChange: (ids: string[]) => void
}) {
  if (!libraries) return null
  if (libraries.length === 0) {
    return (
      <p className="text-muted-foreground text-13px leading-5">
        {tr("access.libraries.noneOnServer")}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2.5 pt-0.5">
      {libraries.map((library) => {
        const Icon = libraryIcons[library.kind]
        const on = value.includes(library.id)
        return (
          <li key={library.id}>
            <label className="flex min-w-0 items-center gap-3 text-sm">
              <Switch
                checked={on}
                onCheckedChange={(checked) =>
                  onChange(
                    // In the order of the list, whichever is switched first.
                    libraries
                      .filter((entry) =>
                        entry.id === library.id
                          ? checked
                          : value.includes(entry.id),
                      )
                      .map((entry) => entry.id),
                  )
                }
              />
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{library.name}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export function requestsLabel(value: RequestMode): string {
  return tr(`access.requests.${value}`)
}

/** What a policy's capabilities stand for, one at a time. */
export type Capability = "downloads" | "requests" | "apiTokens" | ManagedArea

/**
 * Every permission `capability` can grant. Whoever edits it needs them
 * all, since the server refuses a change to one they don't hold.
 */
export function capabilityPermissions(capability: Capability): Permission[] {
  const none: Capabilities = {
    downloads: false,
    requests: "off",
    apiTokens: false,
    manages: MANAGES_NOTHING,
  }
  switch (capability) {
    case "downloads":
      return permissionsOf({ ...none, downloads: true })
    case "requests":
      return permissionsOf({ ...none, requests: "add" })
    case "apiTokens":
      return permissionsOf({ ...none, apiTokens: true })
    default:
      return permissionsOf({
        ...none,
        manages: { ...MANAGES_NOTHING, [capability]: "manage" },
      })
  }
}

/** A request limit as its select holds it: none, or a number per days. */
export type LimitChoice = typeof NO_LIMIT | "some"
export const LIMIT_CHOICES: readonly LimitChoice[] = [NO_LIMIT, "some"]

/** What "Limited" starts at. */
export const DEFAULT_QUOTA: RequestQuota = { titles: 5, days: 7 }

export function limitChoiceLabel(choice: LimitChoice): string {
  return choice === NO_LIMIT
    ? tr("access.requestLimit.none")
    : tr("access.requestLimit.some")
}

export function limitChoiceOf(limit: RequestQuota | null): LimitChoice {
  return limit === null ? NO_LIMIT : "some"
}

/** "[5] titles every [7] days", under a limit that's set. */
export function QuotaInputs({
  value,
  onChange,
}: {
  value: RequestQuota
  onChange: (value: RequestQuota) => void
}) {
  const id = useId()
  const number = (text: string, max: number) =>
    Math.min(max, Math.max(0, Math.trunc(Number(text) || 0)))
  // An emptied field holds 0 while it's typed into, and 1 once left.
  const atLeastOne = (key: keyof RequestQuota) => () => {
    if (value[key] < 1) onChange({ ...value, [key]: 1 })
  }
  return (
    // Each number keeps its words beside it when a narrow screen wraps.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-2">
        <Input
          id={`${id}-titles`}
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          aria-label={tr("access.requestLimit.titlesField")}
          value={value.titles || ""}
          className="w-16 tabular-nums"
          onChange={(event) =>
            onChange({ ...value, titles: number(event.target.value, 10000) })
          }
          onBlur={atLeastOne("titles")}
        />
        <span className="text-muted-foreground">
          {tr("access.requestLimit.titlesEvery")}
        </span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Input
          id={`${id}-days`}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          aria-label={tr("access.requestLimit.daysField")}
          value={value.days || ""}
          className="w-16 tabular-nums"
          onChange={(event) =>
            onChange({ ...value, days: number(event.target.value, 365) })
          }
          onBlur={atLeastOne("days")}
        />
        <span className="text-muted-foreground">
          {tr("access.requestLimit.days")}
        </span>
      </span>
    </div>
  )
}
