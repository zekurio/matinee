import {
  type Permission,
  type PermissionResource,
  permissionResource,
} from "@matinee/contracts"
import { createMemo, createSignal, For, Show } from "solid-js"

import { tr } from "@/i18n"
import { Checkbox } from "@/kit/checkbox"
import { FieldLegend, FieldSet } from "@/kit/field"
import { Input } from "@/kit/input"
import { Switch } from "@/kit/switch"
import { withPermissions } from "@/lib/permissions"

/**
 * Permissions by resource, as their names spell it: `library.scan` is
 * `scan` under `library`. They show as the API names them, since a token
 * is written against that API, with a line under each resource saying
 * what it covers.
 */
function groupByResource(permissions: readonly Permission[]) {
  const groups = new Map<PermissionResource, Permission[]>()
  for (const permission of permissions) {
    if (permission === "all") continue
    const resource = permissionResource(permission)
    groups.set(resource, [...(groups.get(resource) ?? []), permission])
  }
  return [...groups].map(([resource, members]) => ({
    resource,
    permissions: members,
  }))
}

/**
 * An API token's permissions to pick, by resource in columns, with a box
 * per resource that takes all of its permissions, or those the search
 * shows. `value` may hold permissions that aren't offered; they stay as
 * they are.
 */
export function PermissionPicker(props: {
  legend: string
  /** The permissions to pick from. `all` among them is left out. */
  offered: readonly Permission[]
  /**
   * Offer `all` as a switch above the list, with what it says. On, it
   * stands alone and the list hides.
   */
  all?: { label: string; hint: string }
  value: readonly Permission[]
  error?: string | undefined
  onChange: (value: Permission[]) => void
}) {
  const [search, setSearch] = createSignal("")
  // What was picked before `all` went on, for when it goes off again.
  let picked: Permission[] = []
  const everything = () =>
    props.all !== undefined && props.value.includes("all")
  const groups = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return groupByResource(props.offered)
      .map((group) => ({
        ...group,
        shown: group.permissions.filter(
          (permission) =>
            permission.toLowerCase().includes(needle) ||
            tr(`access.permission.${group.resource}`)
              .toLowerCase()
              .includes(needle),
        ),
      }))
      .filter((group) => group.shown.length > 0)
  })

  return (
    <FieldSet>
      <FieldLegend variant="label">{props.legend}</FieldLegend>
      <Show when={props.all}>
        {(all) => (
          <label class="-mt-1 flex min-w-0 items-start gap-3">
            <Switch
              class="mt-0.5"
              checked={everything()}
              // `all` stands alone: picked permissions would mean nothing beside it.
              onCheckedChange={(on) => {
                if (on) picked = [...props.value]
                props.onChange(on ? ["all"] : picked)
              }}
            />
            <span class="min-w-0">
              <span class="block text-sm leading-5">{all().label}</span>
              <span class="text-muted-foreground text-13px block leading-5">
                {all().hint}
              </span>
            </span>
          </label>
        )}
      </Show>
      <Show when={!everything()}>
        <Input
          type="search"
          value={search()}
          placeholder={tr("access.permissions.search")}
          aria-label={tr("access.permissions.search")}
          class="md:max-w-md"
          onValueChange={setSearch}
        />
        <Show when={groups().length === 0}>
          <p class="text-muted-foreground text-13px">
            {tr("access.permissions.noMatch")}
          </p>
        </Show>
        {/* Columns by the dialog's width rather than the screen's. */}
        <div class="@container">
          <ul class="grid gap-x-8 gap-y-4 py-0.5 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
            <For each={groups()} keyed={(group) => group.resource}>
              {(group) => (
                <li class="flex min-w-0 flex-col gap-1.5">
                  <label class="flex items-start gap-2.5">
                    <Checkbox
                      class="mt-0.5"
                      checked={group().shown.every((permission) =>
                        props.value.includes(permission),
                      )}
                      onCheckedChange={(on) =>
                        props.onChange(
                          withPermissions(
                            props.value,
                            group().shown,
                            on === true,
                          ),
                        )
                      }
                    />
                    <span class="min-w-0">
                      <code class="block text-sm leading-5 font-medium">
                        {group().resource}
                      </code>
                      <span class="text-muted-foreground text-13px block leading-5">
                        {tr(`access.permission.${group().resource}`)}
                      </span>
                    </span>
                  </label>
                  <ul class="flex flex-wrap gap-x-4 gap-y-1.5 pl-7">
                    <For each={group().shown}>
                      {(permission) => (
                        <li>
                          <label class="text-13px flex items-center gap-2">
                            <Checkbox
                              checked={props.value.includes(permission)}
                              onCheckedChange={(on) =>
                                props.onChange(
                                  withPermissions(
                                    props.value,
                                    [permission],
                                    on === true,
                                  ),
                                )
                              }
                            />
                            <code>{permission}</code>
                          </label>
                        </li>
                      )}
                    </For>
                  </ul>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.error}>
        <p role="alert" class="text-destructive text-xs">
          {props.error}
        </p>
      </Show>
    </FieldSet>
  )
}
