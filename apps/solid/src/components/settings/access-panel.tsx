import type { AccessGroup, Library, Permission } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useRouteContext } from "@tanstack/solid-router"
import {
  Ellipsis,
  Globe,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide"
import { For, Show } from "solid-js"

import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { can } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createSettingsAccessStore } from "@/stores/settings-access"

import { Fact, groupName, PolicyFacts } from "./access-facts"
import { GroupDialog } from "./group-dialog"
import {
  RowIcon,
  SettingNote,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"
import { ConfirmDialog } from "./user-dialogs"

/**
 * Access groups: what their members may open, and how the server streams
 * to them. The built-in group comes first and holds every account.
 */
export function AccessPanel() {
  const queryClient = useQueryClient()
  const context = useRouteContext({ from: "/_authed" })
  const groups = useQuery(() => orpc.admin.groups.list.queryOptions())
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const librariesData = () => (libraries.isSuccess ? libraries.data : undefined)
  const groupsData = () => (groups.isSuccess ? groups.data : undefined)
  const store = createSettingsAccessStore()
  const may = (permission: Permission) => can(context().user, permission)

  const remove = useMutation(() => ({
    mutationFn: (group: AccessGroup) =>
      client.admin.groups.remove({ id: group.id }),
    onSuccess: async (_result, group) => {
      store.closeDelete()
      toast.success(tr("access.group.deleted", { name: group.name }))
      // Accounts and invites name their groups.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.admin.groups.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() }),
      ])
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  return (
    <SettingsSections>
      <SettingsSubsection
        id="groups"
        title={tr("access.groups.title")}
        action={
          <Show when={may("group.create")}>
            <Button variant="outline" onClick={() => store.edit()}>
              <Icon icon={Plus} />
              {tr("access.groups.create")}
            </Button>
          </Show>
        }
      >
        <SettingNote>{tr("access.groups.intro")}</SettingNote>
        <Show
          when={groupsData()}
          fallback={
            <Show
              when={groups.isError}
              fallback={<Skeleton class="h-32 rounded-xl" />}
            >
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <p class="text-muted-foreground text-sm">
                  {tr("access.groups.loadFailed", {
                    error: errorMessage(groups.error),
                  })}
                </p>
                <Button variant="outline" onClick={() => void groups.refetch()}>
                  <Icon icon={RefreshCw} />
                  {tr("access.retry")}
                </Button>
              </div>
            </Show>
          }
        >
          {(list) => (
            <List>
              <For each={list()} keyed={(group) => group.id}>
                {(group) => (
                  <GroupRow
                    group={group()}
                    libraries={librariesData()}
                    onEdit={
                      may("group.update") ? () => store.edit(group()) : null
                    }
                    onDelete={
                      may("group.delete")
                        ? () => {
                            remove.reset()
                            store.askDelete(group())
                          }
                        : null
                    }
                  />
                )}
              </For>
            </List>
          )}
        </Show>
        <Show when={groupsData()?.length === 1}>
          <SettingNote>{tr("access.groups.onlyEveryone")}</SettingNote>
        </Show>
      </SettingsSubsection>

      <GroupDialog
        group={store.editing().group}
        open={store.editOpen()}
        onOpenChange={store.setEditOpen}
      />

      <ConfirmDialog
        open={store.deleteOpen()}
        title={
          store.deleting()
            ? tr("access.group.deleteTitle", {
                name: store.deleting()?.name ?? "",
              })
            : ""
        }
        description={deleteDescription(store.deleting())}
        confirmLabel={tr("access.group.delete")}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          const group = store.deleting()
          if (group) remove.mutate(group)
        }}
        onClose={store.closeDelete}
      />
    </SettingsSections>
  )
}

function deleteDescription(group: AccessGroup | null): string {
  if (!group) return ""
  return group.members > 0
    ? tr("access.group.deleteDescription", { count: group.members })
    : tr("access.group.deleteDescriptionEmpty")
}

function GroupRow(props: {
  group: AccessGroup
  libraries: readonly Library[] | undefined
  /** Null when the account may not; so is the menu without either. */
  onEdit: (() => void) | null
  onDelete: (() => void) | null
}) {
  const name = () => groupName(props.group)
  const mayDelete = () => props.onDelete !== null && !props.group.everyone
  return (
    <ListItem class="gap-3 py-2.5 pr-2">
      <div class="self-start">
        <RowIcon>
          <Icon icon={props.group.everyone ? Globe : Users} />
        </RowIcon>
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-sm leading-5 font-medium">
          <span class="truncate">{name()}</span>
          <span class="text-muted-foreground shrink-0 font-normal">
            {props.group.everyone
              ? tr("access.group.everyAccount")
              : tr("access.group.members", { count: props.group.members })}
          </span>
        </p>
        <Show when={props.group.providerGroup}>
          {(providerGroup) => (
            <p class="text-muted-foreground text-13px mt-0.5 flex leading-5">
              <Fact icon={<Icon icon={LogIn} />}>
                {tr("access.group.follows", { group: providerGroup() })}
              </Fact>
            </p>
          )}
        </Show>
        <PolicyFacts
          policy={props.group.policy}
          libraries={props.libraries}
          class="mt-0.5"
        />
      </div>
      <Show when={props.onEdit || mayDelete()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            class={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "text-muted-foreground hover:text-foreground data-open:text-foreground shrink-0",
            )}
            aria-label={tr("access.group.actions", { name: name() })}
          >
            <Icon icon={Ellipsis} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} class="min-w-48">
            <Show when={props.onEdit}>
              {(onEdit) => (
                <DropdownMenuItem onSelect={() => onEdit()()}>
                  <Icon icon={Pencil} />
                  {tr("access.group.edit")}
                </DropdownMenuItem>
              )}
            </Show>
            <Show when={mayDelete()}>
              <Show when={props.onEdit}>
                <DropdownMenuSeparator />
              </Show>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => props.onDelete?.()}
              >
                <Icon icon={Trash2} />
                {tr("access.group.delete")}
              </DropdownMenuItem>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
    </ListItem>
  )
}
