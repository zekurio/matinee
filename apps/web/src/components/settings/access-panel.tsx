import type { AccessGroup, Library } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  EllipsisIcon,
  GlobeIcon,
  LogInIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { useState } from "react"
import { useStore } from "zustand"

import { tr } from "@/i18n"
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
  const groups = useQuery(orpc.admin.groups.list.queryOptions())
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const [store] = useState(createSettingsAccessStore)
  const {
    editing,
    editOpen,
    deleting,
    deleteOpen,
    edit,
    setEditOpen,
    askDelete,
    closeDelete,
  } = useStore(store)

  const remove = useMutation({
    mutationFn: (group: AccessGroup) =>
      client.admin.groups.remove({ id: group.id }),
    onSuccess: async (_result, group) => {
      closeDelete()
      toast.success(tr("access.group.deleted", { name: group.name }))
      // Accounts and invites name their groups.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.admin.groups.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.admin.invites.key() }),
      ])
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSections>
      <SettingsSubsection
        id="groups"
        title={tr("access.groups.title")}
        action={
          <Button variant="outline" onClick={() => edit()}>
            <PlusIcon />
            {tr("access.groups.create")}
          </Button>
        }
      >
        <SettingNote>{tr("access.groups.intro")}</SettingNote>
        {groups.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : groups.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {tr("access.groups.loadFailed", {
                error: errorMessage(groups.error),
              })}
            </p>
            <Button variant="outline" onClick={() => void groups.refetch()}>
              <RefreshCwIcon />
              {tr("access.retry")}
            </Button>
          </div>
        ) : (
          <List>
            {groups.data.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                libraries={libraries.data}
                onEdit={() => edit(group)}
                onDelete={() => {
                  remove.reset()
                  askDelete(group)
                }}
              />
            ))}
          </List>
        )}
        {groups.data?.length === 1 && (
          <SettingNote>{tr("access.groups.onlyEveryone")}</SettingNote>
        )}
      </SettingsSubsection>

      <GroupDialog
        group={editing.group}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={
          deleting
            ? tr("access.group.deleteTitle", { name: deleting.name })
            : ""
        }
        description={
          deleting
            ? deleting.members > 0
              ? tr("access.group.deleteDescription", {
                  count: deleting.members,
                })
              : tr("access.group.deleteDescriptionEmpty")
            : ""
        }
        confirmLabel={tr("access.group.delete")}
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={closeDelete}
      />
    </SettingsSections>
  )
}

function GroupRow({
  group,
  libraries,
  onEdit,
  onDelete,
}: {
  group: AccessGroup
  libraries: readonly Library[] | undefined
  onEdit: () => void
  onDelete: () => void
}) {
  const name = groupName(group)
  return (
    <ListItem className="gap-3 py-2.5 pr-2">
      <div className="self-start">
        <RowIcon>{group.everyone ? <GlobeIcon /> : <UsersIcon />}</RowIcon>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm leading-5 font-medium">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground shrink-0 font-normal">
            {group.everyone
              ? tr("access.group.everyAccount")
              : tr("access.group.members", { count: group.members })}
          </span>
        </p>
        {group.providerGroup && (
          <p className="text-muted-foreground mt-0.5 flex text-[13px] leading-5">
            <Fact icon={<LogInIcon />}>
              {tr("access.group.follows", { group: group.providerGroup })}
            </Fact>
          </p>
        )}
        <PolicyFacts
          policy={group.policy}
          libraries={libraries}
          className="mt-0.5"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground shrink-0"
              aria-label={tr("access.group.actions", { name })}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            {tr("access.group.edit")}
          </DropdownMenuItem>
          {!group.everyone && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                {tr("access.group.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ListItem>
  )
}
