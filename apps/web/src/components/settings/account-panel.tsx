import {
  AUTH_ERROR_QUERY_KEY,
  oidcStartPath,
  type Passkey,
} from "@matinee/contracts"
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
import { Button, buttonVariants } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { Label } from "@matinee/ui/components/label"
import { List, ListItem } from "@matinee/ui/components/list"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { KeyRoundIcon, LinkIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { type ReactNode, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { formatDate, formatRelative } from "@/lib/format"
import { addPasskey } from "@/lib/passkey"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SettingsSections, SettingsSubsection } from "./settings-panel"

/** Where an OIDC link round trip lands, success or failure. */
const LINK_RETURN = "/?settings=account"

export function AccountPanel() {
  const search = useSearch({ from: "/_authed/_shell" })
  const config = useQuery(orpc.auth.config.queryOptions())
  const oidc = config.data?.oidc ?? null
  const authError = search[AUTH_ERROR_QUERY_KEY]

  return (
    <SettingsSections>
      {authError ? <FormAlert message={authError} /> : null}
      <Passkeys oidcEnabled={oidc !== null} />
      {oidc ? <LinkedAccounts displayName={oidc.displayName} /> : null}
    </SettingsSections>
  )
}

function Passkeys({ oidcEnabled }: { oidcEnabled: boolean }) {
  const queryClient = useQueryClient()
  const passkeys = useQuery(orpc.account.passkeys.list.queryOptions())
  const accounts = useQuery({
    ...orpc.account.oidc.list.queryOptions(),
    enabled: oidcEnabled,
  })
  // The server refuses to remove the last way to sign in, so say so here.
  const methods =
    (passkeys.data?.length ?? 0) +
    (oidcEnabled ? (accounts.data?.length ?? 0) : 0)
  const isLast = passkeys.isSuccess && methods <= 1
  const [removing, setRemoving] = useState<Passkey | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => client.account.passkeys.remove({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success("Removed passkey")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSubsection
      id="passkeys"
      title="Passkeys"
      description="Sign in with your device's screen lock or a security key."
      action={<AddPasskey />}
    >
      {passkeys.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : passkeys.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">No passkeys yet.</p>
      ) : (
        <List>
          {passkeys.data?.map((passkey) => (
            <ListItem key={passkey.id} className="pr-2">
              <RowIcon>
                <KeyRoundIcon />
              </RowIcon>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {passkey.name ?? "Unnamed passkey"}
                  {passkey.backedUp && (
                    <Badge variant="secondary">Synced</Badge>
                  )}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  Added {formatDate(passkey.createdAt)}
                  {passkey.lastUsedAt &&
                    `, last used ${formatRelative(passkey.lastUsedAt)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                aria-label={`Remove ${passkey.name ?? "unnamed passkey"}`}
                aria-describedby={isLast ? "last-passkey-note" : undefined}
                disabled={isLast}
                onClick={() => setRemoving(passkey)}
              >
                <Trash2Icon />
              </Button>
            </ListItem>
          ))}
        </List>
      )}
      {isLast && (
        <p id="last-passkey-note" className="text-muted-foreground text-[13px]">
          Add another passkey before removing this one. It's your only way to
          sign in.
        </p>
      )}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name ?? "this passkey"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to sign in with it again. Matinee keeps at least
              one way for you to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => removing && remove.mutate(removing.id)}
            >
              Remove passkey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSubsection>
  )
}

/** The section's add button and the dialog that names the new passkey. */
function AddPasskey() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  // Lives outside the dialog content, so closing it while the browser prompt
  // is up still records the new passkey.
  const add = useMutation({
    mutationFn: () => addPasskey(name.trim() || null),
    onSuccess: async () => {
      setOpen(false)
      setName("")
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success("Added passkey")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add passkey
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              if (!add.isPending) add.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a passkey</DialogTitle>
              <DialogDescription>
                Your browser will ask for your screen lock, Touch ID, Windows
                Hello, or a security key.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="passkey-name">Name (optional)</Label>
              <Input
                id="passkey-name"
                placeholder="Work laptop"
                maxLength={64}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={add.isPending}>
                {add.isPending && <Spinner />}
                {add.isPending ? "Waiting for your device…" : "Add passkey"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LinkedAccounts({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient()
  const accounts = useQuery(orpc.account.oidc.list.queryOptions())
  const unlink = useMutation({
    mutationFn: (id: string) => client.account.oidc.unlink({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.account.key() })
      toast.success(`Unlinked ${displayName}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSubsection
      id="single-sign-on"
      title={displayName}
      description="Sign in through your identity provider instead of a passkey."
      action={
        <a
          href={oidcStartPath("link", LINK_RETURN)}
          className={buttonVariants({ variant: "outline" })}
        >
          <LinkIcon />
          Link {displayName}
        </a>
      }
    >
      {accounts.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : accounts.data?.length ? (
        <List>
          {accounts.data.map((account) => (
            <ListItem key={account.id} className="pr-2">
              <RowIcon>
                <LinkIcon />
              </RowIcon>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {account.label ?? displayName}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  Linked {formatDate(account.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                className="shrink-0"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(account.id)}
              >
                Unlink
              </Button>
            </ListItem>
          ))}
        </List>
      ) : (
        <p className="text-muted-foreground text-sm">
          No {displayName} account linked.
        </p>
      )}
    </SettingsSubsection>
  )
}

/** The icon tile at the start of a settings row. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4">
      {children}
    </span>
  )
}
