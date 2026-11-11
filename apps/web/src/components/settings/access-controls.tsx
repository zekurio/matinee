import { BITRATE_LIMITS, type Library } from "@matinee/contracts"
import { Switch } from "@matinee/ui/components/switch"

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
      <p className="text-muted-foreground text-[13px] leading-5">
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
