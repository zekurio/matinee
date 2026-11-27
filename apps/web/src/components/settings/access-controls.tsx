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
import { createUniqueId, For, Show } from "solid-js"

import { libraryIcons } from "@/components/app-shell"
import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Switch } from "@/kit/switch"

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
export function LibraryPicker(props: {
  libraries: readonly Library[] | undefined
  value: readonly string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <Show when={props.libraries}>
      {(libraries) => (
        <Show
          when={libraries().length > 0}
          fallback={
            <p class="text-muted-foreground text-13px leading-5">
              {tr("access.libraries.noneOnServer")}
            </p>
          }
        >
          <ul class="flex flex-col gap-2.5 pt-0.5">
            <For each={libraries()}>
              {(library) => (
                <li>
                  <label class="flex min-w-0 items-center gap-3 text-sm">
                    <Switch
                      checked={props.value.includes(library.id)}
                      onCheckedChange={(checked) =>
                        props.onChange(
                          // In the order of the list, whichever is switched first.
                          libraries()
                            .filter((entry) =>
                              entry.id === library.id
                                ? checked
                                : props.value.includes(entry.id),
                            )
                            .map((entry) => entry.id),
                        )
                      }
                    />
                    <Icon
                      icon={libraryIcons[library.kind]}
                      class="text-muted-foreground size-4 shrink-0"
                    />
                    <span class="truncate">{library.name}</span>
                  </label>
                </li>
              )}
            </For>
          </ul>
        </Show>
      )}
    </Show>
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
export function QuotaInputs(props: {
  value: RequestQuota
  onChange: (value: RequestQuota) => void
}) {
  const id = createUniqueId()
  const number = (text: string, max: number) =>
    Math.min(max, Math.max(0, Math.trunc(Number(text) || 0)))
  const change = (
    key: keyof RequestQuota,
    max: number,
    input: HTMLInputElement,
  ) => {
    const next = number(input.value, max)
    // A clamped value equal to the one held doesn't rewrite the field.
    const shown = next ? String(next) : ""
    if (input.value !== shown) input.value = shown
    props.onChange({ ...props.value, [key]: next })
  }
  // An emptied field holds 0 while it's typed into, and 1 once left.
  const atLeastOne = (key: keyof RequestQuota) => () => {
    if (props.value[key] < 1) props.onChange({ ...props.value, [key]: 1 })
  }
  return (
    // Each number keeps its words beside it when a narrow screen wraps.
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      <span class="inline-flex items-center gap-2">
        <Input
          id={`${id}-titles`}
          type="number"
          inputmode="numeric"
          min={1}
          max={10000}
          aria-label={tr("access.requestLimit.titlesField")}
          value={props.value.titles ? String(props.value.titles) : ""}
          class="w-16"
          onInput={(event) => change("titles", 10000, event.currentTarget)}
          onBlur={atLeastOne("titles")}
        />
        <span class="text-muted-foreground">
          {tr("access.requestLimit.titlesEvery")}
        </span>
      </span>
      <span class="inline-flex items-center gap-2">
        <Input
          id={`${id}-days`}
          type="number"
          inputmode="numeric"
          min={1}
          max={365}
          aria-label={tr("access.requestLimit.daysField")}
          value={props.value.days ? String(props.value.days) : ""}
          class="w-16"
          onInput={(event) => change("days", 365, event.currentTarget)}
          onBlur={atLeastOne("days")}
        />
        <span class="text-muted-foreground">
          {tr("access.requestLimit.days")}
        </span>
      </span>
    </div>
  )
}
