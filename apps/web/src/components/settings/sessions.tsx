import type { Session } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LogOutIcon } from "lucide-react"
import { useState } from "react"

import { PlatformIcon } from "@/components/device-card"
import { tr } from "@/i18n"
import { platformLabel, sessionLabel } from "@/lib/devices"
import { formatDate, formatRelative } from "@/lib/format"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { RowIcon, SettingsSubsection } from "./settings-panel"

// The server moves a session's last use at most hourly, so anything more
// recent only says "within the last hour".
const LAST_SEEN_STEP_MS = 60 * 60 * 1000

/** Browsers and apps signed in to the account, and signing them out. */
export function Sessions() {
  const queryClient = useQueryClient()
  const sessions = useQuery(orpc.account.sessions.list.queryOptions())
  const [revoking, setRevoking] = useState<Session | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.account.sessions.list.key(),
    })

  const revoke = useMutation({
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
  })
  const revokeOthers = useMutation({
    mutationFn: () => client.account.sessions.revokeOthers(),
    onSuccess: ({ revoked }) =>
      toast.success(tr("account.sessions.signedOutCount", { count: revoked })),
    onError: (error) =>
      toast.error(tr("account.sessions.signOutOthersFailed"), {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  })

  const others = sessions.data?.some((session) => !session.current) ?? false

  return (
    <SettingsSubsection
      id="sessions"
      title={tr("account.sessions.title")}
      action={
        others ? (
          <Button
            variant="outline"
            disabled={revokeOthers.isPending}
            onClick={() => setRevokingOthers(true)}
          >
            <LogOutIcon />
            {tr("account.sessions.signOutOthers")}
          </Button>
        ) : null
      }
    >
      {sessions.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : sessions.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("account.sessions.loadFailed", {
            reason: errorMessage(sessions.error),
          })}
        </p>
      ) : (
        <List>
          {sessions.data.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onSignOut={() => setRevoking(session)}
            />
          ))}
        </List>
      )}

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revoking
                ? tr("account.sessions.signOutTitle", {
                    session: sessionLabel(revoking),
                  })
                : tr("account.sessions.signOutTitleUnnamed")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("account.sessions.signOutDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (revoking) revoke.mutate(revoking)
                setRevoking(null)
              }}
            >
              {tr("account.sessions.signOut")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokingOthers} onOpenChange={setRevokingOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("account.sessions.signOutOthersTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("account.sessions.signOutOthersDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("account.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                revokeOthers.mutate()
                setRevokingOthers(false)
              }}
            >
              {tr("account.sessions.signOutOthersConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSubsection>
  )
}

function SessionRow({
  session,
  onSignOut,
}: {
  session: Session
  onSignOut: () => void
}) {
  const label = sessionLabel(session)
  const details = [
    // A named device still says what it is.
    session.platform && session.deviceName
      ? tr("account.device.app", { platform: platformLabel(session.platform) })
      : null,
    lastActive(session),
    tr("account.sessions.signedIn", { date: formatDate(session.createdAt) }),
  ]

  return (
    <ListItem className="pr-2">
      <RowIcon>
        <PlatformIcon platform={session.platform} />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm leading-5 font-medium">{label}</p>
          {session.current && (
            <Badge variant="secondary">
              {tr("account.sessions.thisDevice")}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground truncate text-[13px] leading-5">
          {details.filter(Boolean).join(" · ")}
        </p>
      </div>
      {!session.current && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive shrink-0"
          aria-label={tr("account.sessions.signOutNamed", { session: label })}
          onClick={onSignOut}
        >
          <LogOutIcon />
        </Button>
      )}
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
