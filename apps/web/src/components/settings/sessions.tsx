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
      toast.success(`Signed out ${sessionLabel(session)}`),
    onError: (error) =>
      toast.error("Couldn't sign out that session", {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  })
  const revokeOthers = useMutation({
    mutationFn: () => client.account.sessions.revokeOthers(),
    onSuccess: ({ revoked }) =>
      toast.success(
        revoked === 1
          ? "Signed out 1 session"
          : `Signed out ${revoked} sessions`,
      ),
    onError: (error) =>
      toast.error("Couldn't sign out the other sessions", {
        description: errorMessage(error),
      }),
    onSettled: refresh,
  })

  const others = sessions.data?.some((session) => !session.current) ?? false

  return (
    <SettingsSubsection
      id="sessions"
      title="Sessions"
      description="Browsers and apps signed in to your account."
      action={
        others ? (
          <Button
            variant="outline"
            disabled={revokeOthers.isPending}
            onClick={() => setRevokingOthers(true)}
          >
            <LogOutIcon />
            Sign out other sessions
          </Button>
        ) : null
      }
    >
      {sessions.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : sessions.isError ? (
        <p className="text-muted-foreground text-sm">
          Couldn't load your sessions. {errorMessage(sessions.error)}
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
              Sign out {revoking ? sessionLabel(revoking) : "this session"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It has to sign in again to use Matinee.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (revoking) revoke.mutate(revoking)
                setRevoking(null)
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokingOthers} onOpenChange={setRevokingOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out every other session?</AlertDialogTitle>
            <AlertDialogDescription>
              Every browser and app but this one has to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                revokeOthers.mutate()
                setRevokingOthers(false)
              }}
            >
              Sign out others
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
      ? `${platformLabel(session.platform)} app`
      : null,
    lastActive(session),
    `Signed in ${formatDate(session.createdAt)}`,
  ]

  return (
    <ListItem className="pr-2">
      <RowIcon>
        <PlatformIcon platform={session.platform} />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm leading-5 font-medium">{label}</p>
          {session.current && <Badge variant="secondary">This device</Badge>}
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
          aria-label={`Sign out ${label}`}
          onClick={onSignOut}
        >
          <LogOutIcon />
        </Button>
      )}
    </ListItem>
  )
}

function lastActive(session: Session): string {
  if (session.current) return "Active now"
  if (Date.now() - session.lastSeenAt.getTime() < LAST_SEEN_STEP_MS) {
    return "Active in the last hour"
  }
  return `Active ${formatRelative(session.lastSeenAt)}`
}
