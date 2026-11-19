import type { DiscoveredServer, SavedServer } from "@matinee/desktop-bridge"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { Field, FieldError, FieldLabel } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { List, ListItemButton } from "@matinee/ui/components/list"
import { Spinner } from "@matinee/ui/components/spinner"
import {
  ChevronRightIcon,
  RefreshCwIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react"
import { type ReactNode, useId, useRef, useState } from "react"

import { tr } from "@/i18n"
import { hostOf } from "@/lib/format"
import { type ProbeError, useApp } from "@/stores/app"

import { Initial, Page } from "./frame"

/**
 * Picking a server: the saved ones to open, an address to connect to, and
 * the servers that answered on the local network. With none saved on the
 * first run, it's the welcome.
 */
export function ServersScreen() {
  const reason = useApp((state) => state.reason)
  const saved = useApp((state) => state.saved)
  const servers = saved?.servers ?? []
  const current = saved?.current ?? null
  const welcome = reason === "welcome" && servers.length === 0
  // The one in use comes first, where the arrow keys start.
  const ordered = [...servers].sort(
    (a, b) => Number(b.id === current) - Number(a.id === current),
  )

  return (
    <Page
      title={welcome ? tr("servers.welcome.title") : tr("servers.title")}
      description={
        welcome ? tr("servers.welcome.description") : tr("servers.description")
      }
    >
      <div className="flex flex-col gap-10">
        {ordered.length > 0 && (
          <Section title={tr("servers.saved")}>
            <SavedServers servers={ordered} current={current} />
          </Section>
        )}
        <Section title={welcome ? null : tr("servers.add")}>
          <AddressForm primary={ordered.length === 0} />
        </Section>
        <Nearby saved={servers} />
      </div>
    </Page>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string | null
  action?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={title ? id : undefined}>
      {title && (
        <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
          <h2 id={id} className="text-muted-foreground text-13px font-medium">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const ROW =
  "flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

function SavedServers({
  servers,
  current,
}: {
  servers: SavedServer[]
  current: string | null
}) {
  const opening = useApp((state) => state.opening)
  const openFailed = useApp((state) => state.openFailed)
  const open = useApp((state) => state.open)
  const failed = servers.find((server) => server.id === openFailed)

  return (
    <>
      <List>
        {servers.map((server, index) => {
          const name = server.displayName ?? server.username
          return (
            <li
              key={server.id}
              data-slot="list-item"
              className="has-[>button:first-child:hover]:bg-foreground/[0.06] has-[>button:first-child:focus-visible]:bg-foreground/[0.06] relative flex items-center transition-colors"
            >
              <button
                type="button"
                className={ROW}
                // The arrow keys start on the server in use, or the first one.
                data-primary={index === 0 || undefined}
                aria-busy={opening === server.id}
                onClick={() => {
                  if (opening === null) void open(server.id)
                }}
              >
                <Initial name={name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm leading-5 font-medium">
                      {hostOf(server.url)}
                    </span>
                    {server.id === current && (
                      <Badge variant="secondary">{tr("servers.inUse")}</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground text-13px block truncate">
                    {tr("servers.signedInAs", { name })}
                  </span>
                </span>
                {opening === server.id ? (
                  <Spinner className="text-muted-foreground" />
                ) : (
                  <ChevronRightIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                )}
              </button>
              <RemoveServer server={server} />
            </li>
          )
        })}
      </List>
      {failed && (
        <FieldError className="mt-2">
          {tr("servers.openFailed", { host: hostOf(failed.url) })}
        </FieldError>
      )}
    </>
  )
}

/** The trash button on a saved server, and the question before removing it. */
function RemoveServer({ server }: { server: SavedServer }) {
  const remove = useApp((state) => state.remove)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const host = hostOf(server.url)

  const confirm = async () => {
    setPending(true)
    setFailed(false)
    try {
      await remove(server.id)
      setOpen(false)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground mr-3"
        aria-label={tr("servers.remove", { host })}
        onClick={() => {
          setFailed(false)
          setOpen(true)
        }}
      >
        <Trash2Icon />
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
      >
        <AlertDialogContent initialFocus={cancel}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("servers.removeTitle", { host })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr("servers.removeBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failed && (
            <FieldError>{tr("servers.removeFailed", { host })}</FieldError>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancel} disabled={pending}>
              {tr("ui.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending && <Spinner />}
              {tr("servers.removeConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function probeMessage(error: ProbeError): string {
  const { address } = error
  switch (error.reason) {
    case "empty":
      return tr("servers.empty")
    case "invalid":
      return tr("servers.invalid")
    case "unreachable":
      return tr("servers.unreachable", { address })
    case "not-matinee":
      return tr("servers.notMatinee", { address })
    case "error":
      return tr("servers.probeFailed")
  }
}

/** The address someone types, checked with the shell before signing in. */
function AddressForm({ primary }: { primary: boolean }) {
  const [address, setAddress] = useState("")
  const probing = useApp((state) => state.probing)
  const probeError = useApp((state) => state.probeError)
  const connect = useApp((state) => state.connect)
  const clearProbeError = useApp((state) => state.clearProbeError)
  const id = useId()
  const message = probeError ? probeMessage(probeError) : null

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!probing) void connect(address)
      }}
    >
      <Field data-invalid={message ? true : undefined}>
        <FieldLabel htmlFor={id}>{tr("servers.address")}</FieldLabel>
        <Input
          id={id}
          value={address}
          placeholder={tr("servers.addressPlaceholder")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          enterKeyHint="go"
          data-primary={primary || undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(event) => {
            setAddress(event.target.value)
            if (probeError) clearProbeError()
          }}
        />
        {message && <FieldError id={`${id}-error`}>{message}</FieldError>}
      </Field>
      {/* Not disabled while it checks, which would drop the focus. */}
      <Button type="submit" size="lg" aria-busy={probing}>
        {probing && <Spinner />}
        {tr("servers.connect")}
      </Button>
    </form>
  )
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return a === b
  }
}

/** Servers that answered on the local network, but for the saved ones. */
function Nearby({ saved }: { saved: SavedServer[] }) {
  const searching = useApp((state) => state.searching)
  const found = useApp((state) => state.found)
  const search = useApp((state) => state.search)
  const signInTo = useApp((state) => state.signInTo)
  const fresh = found.filter(
    (server) => !saved.some((known) => sameOrigin(known.url, server.url)),
  )

  return (
    <Section
      title={tr("servers.nearby")}
      action={
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          disabled={searching}
          onClick={() => void search()}
        >
          {searching ? <Spinner className="size-3" /> : <RefreshCwIcon />}
          {tr("servers.searchAgain")}
        </Button>
      }
    >
      {fresh.length > 0 ? (
        <List>
          {fresh.map((server) => (
            <NearbyServer
              key={server.url}
              server={server}
              onPick={() => signInTo(server.url)}
            />
          ))}
        </List>
      ) : (
        <p
          role="status"
          className="text-muted-foreground text-13px text-pretty"
        >
          {searching ? tr("servers.searching") : tr("servers.none")}
        </p>
      )}
    </Section>
  )
}

function NearbyServer({
  server,
  onPick,
}: {
  server: DiscoveredServer
  onPick: () => void
}) {
  return (
    <ListItemButton onClick={onPick}>
      <span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4">
        <ServerIcon aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-5 font-medium">
          {server.name}
        </span>
        <span className="text-muted-foreground text-13px block truncate">
          {hostOf(server.url)}
        </span>
      </span>
    </ListItemButton>
  )
}
