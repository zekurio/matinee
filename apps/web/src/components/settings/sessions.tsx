import type { Session } from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { LogOut } from "lucide"
import { For, Match, Show, Switch } from "solid-js"

import { PlatformIcon } from "@/components/device-card"
import { tr } from "@/i18n"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/kit/alert-dialog"
import { Badge } from "@/kit/badge"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { List, ListItem } from "@/kit/list"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { platformLabel, sessionLabel } from "@/lib/devices"
import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { createSettingsSessionsStore } from "@/stores/settings-sessions"

import { LinkDeviceButton } from "./link-device"
import { RowIcon, SettingsSubsection } from "./settings-panel"

// The server moves a session's last use at most hourly, so anything more
// recent only says "within the last hour".
const LAST_SEEN_STEP_MS = 60 * 60 * 1000

// A device signed in by its code gets its session on its next poll, up to
// the server's five seconds after the approval.
const DEVICE_POLL_MS = 6000

/**
 * Browsers and apps signed in to the account, signing them out, and
 * signing in a new one by its code.
 */
export function Sessions() {
  const queryClient = useQueryClient()
  const sessions = useQuery(() => orpc.account.sessions.list.queryOptions())
  const store = createSettingsSessionsStore()
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.account.sessions.list.key(),
    })

  const revoke = useMutation(() => ({
    mutationFn: (session: Session) =>
      client.account.sessions.revoke({ id: session.id }),
    onSuccess: (_, session) =>
      toast.success(
        tr("account.sessions.signedOut", { session: sessionLabel(session) }),
      ),
    onError: (error) =>
      toast.error(tr("account.sessions.signOutFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  }))
  const revokeOthers = useMutation(() => ({
    mutationFn: () => client.account.sessions.revokeOthers(),
    onSuccess: ({ revoked }) =>
      toast.success(tr("account.sessions.signedOutCount", { count: revoked })),
    onError: (error) =>
      toast.error(tr("account.sessions.signOutOthersFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  }))

  const others = () =>
    sessions.data?.some((session) => !session.current) ?? false

  return (
    <SettingsSubsection
      id="sessions"
      title={tr("account.sessions.title")}
      action={
        <div class="flex flex-col gap-2 @lg:flex-row">
          <LinkDeviceButton
            onClosed={() => {
              void refresh()
              setTimeout(() => void refresh(), DEVICE_POLL_MS)
            }}
          />
          <Show when={others()}>
            <Button
              variant="outline"
              disabled={revokeOthers.isPending}
              onClick={() => store.setRevokingOthers(true)}
            >
              <Icon icon={LogOut} />
              {tr("account.sessions.signOutOthers")}
            </Button>
          </Show>
        </div>
      }
    >
      <Switch>
        <Match when={sessions.isPending}>
          <Skeleton class="h-16 rounded-xl" />
        </Match>
        <Match when={sessions.isError}>
          <p class="text-muted-foreground text-sm">
            {tr("account.sessions.loadFailed", {
              reason: errorMessage(sessions.error),
            })}
          </p>
        </Match>
        <Match when={sessions.data}>
          {(list) => (
            <List>
              <For each={list()} keyed={(session) => session.id}>
                {(session) => (
                  <SessionRow
                    session={session()}
                    onSignOut={() => store.ask(session())}
                  />
                )}
              </For>
            </List>
          )}
        </Match>
      </Switch>

      <SignOutDialog
        open={store.open()}
        onOpenChange={(open) => {
          if (!open) store.close()
        }}
        title={(() => {
          const revoking = store.revoking()
          return revoking
            ? tr("account.sessions.signOutTitle", {
                session: sessionLabel(revoking),
              })
            : tr("account.sessions.signOutTitleUnnamed")
        })()}
        description={tr("account.sessions.signOutDescription")}
        confirmLabel={tr("account.sessions.signOut")}
        onConfirm={() => {
          const revoking = store.revoking()
          if (revoking) revoke.mutate(revoking)
          store.close()
        }}
      />

      <SignOutDialog
        open={store.revokingOthers()}
        onOpenChange={(open) => store.setRevokingOthers(open)}
        title={tr("account.sessions.signOutOthersTitle")}
        description={tr("account.sessions.signOutOthersDescription")}
        confirmLabel={tr("account.sessions.signOutOthersConfirm")}
        onConfirm={() => {
          revokeOthers.mutate()
          store.setRevokingOthers(false)
        }}
      />
    </SettingsSubsection>
  )
}

/** Asks before signing a session, or the others, out. */
function SignOutDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => props.onOpenChange(open)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SessionRow(props: { session: Session; onSignOut: () => void }) {
  const label = () => sessionLabel(props.session)
  const details = () =>
    [
      // A named device still says what it is.
      props.session.platform && props.session.deviceName
        ? tr("account.device.app", {
            platform: platformLabel(props.session.platform),
          })
        : null,
      lastActive(props.session),
      tr("account.sessions.signedIn", {
        date: formatDate(props.session.createdAt),
      }),
    ]
      .filter(Boolean)
      .join(" · ")

  return (
    <ListItem class="pr-2">
      <RowIcon>
        <PlatformIcon platform={props.session.platform} />
      </RowIcon>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-sm leading-5 font-medium">{label()}</p>
          <Show when={props.session.current}>
            <Badge variant="secondary">
              {tr("account.sessions.thisDevice")}
            </Badge>
          </Show>
        </div>
        <p class="text-muted-foreground text-13px truncate leading-5">
          {details()}
        </p>
      </div>
      <Show when={!props.session.current}>
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-destructive shrink-0"
          aria-label={tr("account.sessions.signOutNamed", { session: label() })}
          onClick={() => props.onSignOut()}
        >
          <Icon icon={LogOut} />
        </Button>
      </Show>
    </ListItem>
  )
}

function lastActive(session: Session): string {
  if (session.current) return tr("account.sessions.activeNow")
  if (Date.now() - session.lastSeenAt.getTime() < LAST_SEEN_STEP_MS) {
    return tr("account.sessions.activeLastHour")
  }
  return tr("account.sessions.active", {
    time: formatRelative(session.lastSeenAt),
  })
}
