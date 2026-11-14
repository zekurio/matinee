import {
  type Party,
  type PartyEntry,
  type PartyMember,
  PartyName,
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
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CrownIcon,
  EllipsisIcon,
  ListPlusIcon,
  LogOutIcon,
  PencilIcon,
  PlayIcon,
  UserRoundPlusIcon,
  UserRoundXIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useRef, useState } from "react"

import { Picture, tone } from "@/components/picture"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { itemLabel, landscapeSources } from "@/lib/media"
import {
  partyInviteUrl,
  partyItemName,
  partyPosition,
  setParty,
  useParty,
  usePartyRole,
} from "@/lib/party"
import { client, errorMessage } from "@/lib/rpc"

function failed(cause: unknown) {
  toast.error(tr("party.failed"), { description: errorMessage(cause) })
}

/**
 * The bar's watch party button, with a dot while the account is in one,
 * and the panel it opens. The panel mounts when first opened.
 */
export function PartyButton({ className }: { className: string }) {
  const role = usePartyRole()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={tr("party.title")}
        title={tr("party.title")}
        onClick={() => setOpen(true)}
        className={cn(className, "relative")}
      >
        <UsersRoundIcon />
        {role && (
          <span
            aria-hidden
            className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"
          />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-md">
          <PartyPanel onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function PartyPanel({ onClose }: { onClose: () => void }) {
  const { party, offsetMs } = useParty()
  if (!party) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{tr("party.title")}</DialogTitle>
          <DialogDescription>{tr("party.intro")}</DialogDescription>
        </DialogHeader>
        <StartForm
          onSubmit={async (name) => {
            try {
              setParty(await client.party.create({ name }))
            } catch (cause) {
              toast.error(tr("party.startFailed"), {
                description: errorMessage(cause),
              })
            }
          }}
        />
      </>
    )
  }
  return <PartyDetails party={party} offsetMs={offsetMs} onClose={onClose} />
}

/**
 * The name to start a party with. Empty is fine: the party then goes by
 * its owner.
 */
function StartForm({
  onSubmit,
}: {
  onSubmit: (name: string) => Promise<void>
}) {
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: ({ value }) => onSubmit(PartyName.parse(value.name)),
  })
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="name" validators={{ onChange: PartyName }}>
        {(field) => (
          <field.TextField
            label={tr("party.name.optional")}
            placeholder={tr("party.name.placeholder")}
            maxLength={64}
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton icon={<UsersRoundIcon />}>
          {tr("party.start")}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}

/**
 * The party's name, which its owner edits in place: the title turns into
 * a field with a save button in it. Enter or leaving the field saves,
 * Escape puts the name back.
 */
function PartyTitle({ party }: { party: Party }) {
  const [editing, setEditing] = useState(false)
  const title = party.name ?? tr("party.title")
  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1 pr-8">
        <DialogTitle className="truncate py-1 text-lg">{title}</DialogTitle>
        {party.owner && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tr("party.rename")}
            title={tr("party.rename")}
            onClick={() => setEditing(true)}
            className="text-muted-foreground shrink-0"
          >
            <PencilIcon />
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center pr-8">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <RenameField name={party.name ?? ""} onDone={() => setEditing(false)} />
    </div>
  )
}

/**
 * Puts the cursor in a field the click that opened it asked for, with its
 * text selected to type over. Module-level so React calls it once, on
 * mount, and not again on every render.
 */
function focusAndSelect(node: HTMLInputElement | null) {
  node?.focus()
  node?.select()
}

function RenameField({
  name,
  onDone,
}: {
  /** The name the party has now. */
  name: string
  onDone: () => void
}) {
  // Set once the field is on its way out, so the blur its removal can
  // cause doesn't save again, or save what Escape threw away.
  const closed = useRef(false)
  const close = () => {
    closed.current = true
    onDone()
  }
  const form = useAppForm({
    defaultValues: { name },
    onSubmit: async ({ value }) => {
      const next = PartyName.parse(value.name)
      if (next !== name) {
        try {
          await client.party.rename({ name: next })
        } catch (cause) {
          failed(cause)
          return
        }
      }
      close()
    },
  })
  const commit = () => {
    if (!closed.current && !form.state.isSubmitting) void form.handleSubmit()
  }
  return (
    <form
      className="relative -ml-2 min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
      onBlur={(event) => {
        // Focus moving to the save button stays in the field.
        if (!event.currentTarget.contains(event.relatedTarget)) commit()
      }}
    >
      <form.Field name="name" validators={{ onChange: PartyName }}>
        {(field) => (
          <Input
            ref={focusAndSelect}
            aria-label={tr("party.name")}
            placeholder={tr("party.name.placeholder")}
            maxLength={64}
            autoComplete="off"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onKeyDown={(event) => {
              // Escape leaves the field before it closes the dialog.
              if (event.key === "Escape") {
                event.stopPropagation()
                close()
              }
            }}
            className="h-9 pr-10 pl-2 text-lg font-medium md:h-9 md:text-lg"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <Button
            type="submit"
            size="icon-xs"
            disabled={submitting}
            aria-label={tr("party.rename.save")}
            title={tr("party.rename.save")}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            {submitting ? <Spinner /> : <CheckIcon />}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

/**
 * The party in the order someone reads it: who is here, what plays, what
 * comes after. Each row has one quiet "⋯" for what the viewer may do
 * with it, so the panel stays a list of names and not of buttons.
 */
function PartyDetails({
  party,
  offsetMs,
  onClose,
}: {
  party: Party
  offsetMs: number
  onClose: () => void
}) {
  const leave = useMutation({
    mutationFn: () => client.party.leave(),
    onSuccess: () => setParty(null),
    onError: failed,
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partyInviteUrl(party))
      toast.success(tr("party.inviteCopied"), {
        description: tr("party.inviteHint"),
      })
    } catch (cause) {
      toast.error(tr("party.inviteFailed"), {
        description: errorMessage(cause),
      })
    }
  }
  return (
    <>
      <DialogHeader>
        <PartyTitle party={party} />
      </DialogHeader>

      <ul className="-mx-2 grid">
        {party.members.map((member) => (
          <Row key={member.user.id}>
            <UserAvatar user={member.user} className="size-7 text-xs" />
            <span className="min-w-0 flex-1 truncate">
              {member.user.displayName ?? member.user.username}
            </span>
            {member.owner && (
              <span className="text-muted-foreground shrink-0 text-xs">
                {tr("party.owner")}
              </span>
            )}
            {party.owner && !member.owner && <MemberMenu member={member} />}
          </Row>
        ))}
        <li>
          <button
            type="button"
            onClick={() => void copy()}
            className={cn(rowLook, rowPress, "text-muted-foreground w-full")}
          >
            <span className="border-foreground/25 grid size-7 shrink-0 place-items-center rounded-full border border-dashed">
              <UserRoundPlusIcon className="size-3.5" />
            </span>
            {tr("party.invite")}
          </button>
        </li>
      </ul>

      <NowPlaying party={party} offsetMs={offsetMs} onClose={onClose} />

      <Queue party={party} onClose={onClose} />

      <Button
        variant="ghost"
        disabled={leave.isPending}
        onClick={() => leave.mutate()}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive -mx-2 justify-self-start px-2"
      >
        <LogOutIcon />
        {tr("party.leave")}
      </Button>
    </>
  )
}

// A row of the panel's lists: something round or numbered, a name, and
// the row's menu at the end.
const rowLook =
  "group/item flex min-h-10 items-center gap-3 rounded-lg px-2 text-left text-sm"
const rowPress =
  "outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring"

function Row({ children }: { children: ReactNode }) {
  return <li className={rowLook}>{children}</li>
}

/** A heading for one of the panel's lists, as quiet as its rows' details. */
function ListTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-muted-foreground px-2 pb-1 text-xs font-medium">
      {children}
    </h3>
  )
}

/**
 * A row's "⋯". Pointers that hover see it on hover and focus; touch
 * screens always do.
 */
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="text-muted-foreground shrink-0 opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100 [@media(pointer:coarse)]:size-10 [@media(pointer:coarse)]:opacity-100"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-max min-w-44 whitespace-nowrap"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** What the party watches, which is the one picture in the panel. */
function NowPlaying({
  party,
  offsetMs,
  onClose,
}: {
  party: Party
  offsetMs: number
  onClose: () => void
}) {
  const { item, playback } = party
  if (!item || !playback) {
    return (
      <p className="text-muted-foreground bg-foreground/[0.04] rounded-lg px-3 py-2.5">
        {party.restricted
          ? tr("party.restricted")
          : party.owner
            ? tr("party.nothing.owner")
            : tr("party.nothing.member")}
      </p>
    )
  }
  const label = itemLabel(item)
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: item.id }}
      // Where the party is now, in place of the resume point.
      search={{ start: Math.floor(partyPosition(playback, offsetMs)) }}
      onClick={onClose}
      className={cn(
        "group/now bg-foreground/[0.04] flex items-center gap-3 rounded-lg p-2",
        rowPress,
      )}
    >
      <span
        className={cn(
          "relative aspect-video w-28 shrink-0 overflow-hidden rounded-md",
          tone(label.showKey),
        )}
      >
        <Picture sources={landscapeSources(item)} sizes="112px" />
        <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
          <PlayIcon className="size-5 fill-current" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label.title}</span>
        {label.code && (
          <span className="text-muted-foreground block truncate text-xs">
            {label.showName} {label.code}
          </span>
        )}
        <span className="text-primary mt-1 block text-xs font-medium">
          {tr("party.watchAlong")}
        </span>
      </span>
    </Link>
  )
}

/** An entry's file: its name, and the show and episode under it. */
function EntryName({ entry }: { entry: PartyEntry }) {
  const label = itemLabel(entry.item)
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label.title}</span>
      {label.code && (
        <span className="text-muted-foreground block truncate text-xs">
          {label.showName} {label.code}
        </span>
      )}
    </span>
  )
}

/**
 * What plays next, numbered since the order is the point, and under it
 * what members suggested, each with who it came from.
 */
function Queue({ party, onClose }: { party: Party; onClose: () => void }) {
  const { queue, proposals } = party
  return (
    <>
      <div className="-mx-2">
        <ListTitle>{tr("party.queue")}</ListTitle>
        {queue.length === 0 ? (
          <p className="text-muted-foreground px-2">
            {party.owner ? tr("party.queue.owner") : tr("party.queue.member")}
          </p>
        ) : (
          <ol className="grid">
            {queue.map((entry, index) => (
              <Row key={entry.id}>
                <span className="text-muted-foreground w-7 shrink-0 text-center text-xs tabular-nums">
                  {index + 1}
                </span>
                <EntryName entry={entry} />
                {party.owner && (
                  <QueueMenu
                    entry={entry}
                    index={index}
                    last={index === queue.length - 1}
                    onClose={onClose}
                  />
                )}
              </Row>
            ))}
          </ol>
        )}
      </div>
      {proposals.length > 0 && (
        <div className="-mx-2">
          <ListTitle>{tr("party.proposals")}</ListTitle>
          <ul className="grid">
            {proposals.map((entry) => (
              <Row key={entry.id}>
                {entry.by ? (
                  <span
                    title={tr("party.proposedBy", {
                      name: entry.by.displayName ?? entry.by.username,
                    })}
                  >
                    <UserAvatar user={entry.by} className="size-7 text-xs" />
                    <span className="sr-only">
                      {tr("party.proposedBy", {
                        name: entry.by.displayName ?? entry.by.username,
                      })}
                    </span>
                  </span>
                ) : (
                  <span className="w-7 shrink-0" />
                )}
                <EntryName entry={entry} />
                {(party.owner || entry.removable) && (
                  <ProposalMenu entry={entry} owner={party.owner} />
                )}
              </Row>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function QueueMenu({
  entry,
  index,
  last,
  onClose,
}: {
  entry: PartyEntry
  index: number
  last: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const name = partyItemName(entry.item)
  const move = useMutation({
    mutationFn: (to: number) =>
      client.party.queue.move({ entryId: entry.id, index: to }),
    onError: failed,
  })
  const remove = useMutation({
    mutationFn: () => client.party.queue.remove({ entryId: entry.id }),
    onError: failed,
  })
  return (
    <RowMenu label={tr("party.entryActions", { name })}>
      {/* The owner's player is where the party's file comes from, so
          playing one is opening it. */}
      <DropdownMenuItem
        onClick={() => {
          onClose()
          void navigate({
            to: "/watch/$itemId",
            params: { itemId: entry.item.id },
            search: { start: 0 },
          })
        }}
      >
        <PlayIcon />
        {tr("party.playNow")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={index === 0}
        onClick={() => move.mutate(index - 1)}
      >
        <ArrowUpIcon />
        {tr("party.moveUp")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={last} onClick={() => move.mutate(index + 1)}>
        <ArrowDownIcon />
        {tr("party.moveDown")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => remove.mutate()}>
        <XIcon />
        {tr("party.remove")}
      </DropdownMenuItem>
    </RowMenu>
  )
}

function ProposalMenu({ entry, owner }: { entry: PartyEntry; owner: boolean }) {
  const name = partyItemName(entry.item)
  const accept = useMutation({
    mutationFn: () => client.party.queue.accept({ entryId: entry.id }),
    onError: failed,
  })
  const remove = useMutation({
    mutationFn: () => client.party.queue.remove({ entryId: entry.id }),
    onError: failed,
  })
  return (
    <RowMenu label={tr("party.entryActions", { name })}>
      {owner && (
        <DropdownMenuItem onClick={() => accept.mutate()}>
          <ListPlusIcon />
          {tr("party.accept")}
        </DropdownMenuItem>
      )}
      {entry.removable && (
        <DropdownMenuItem onClick={() => remove.mutate()}>
          <XIcon />
          {owner ? tr("party.dismiss") : tr("party.withdraw")}
        </DropdownMenuItem>
      )}
    </RowMenu>
  )
}

/** What the owner can do about another member, each after asking. */
function MemberMenu({ member }: { member: PartyMember }) {
  const name = member.user.displayName ?? member.user.username
  const userId = member.user.id
  const [asking, setAsking] = useState<"owner" | "kick" | null>(null)
  // The last question, kept while its dialog closes.
  const [shown, setShown] = useState<"owner" | "kick">("kick")
  const ask = (what: "owner" | "kick") => {
    setShown(what)
    setAsking(what)
  }
  const transfer = useMutation({
    mutationFn: () => client.party.transfer({ userId }),
    onError: failed,
  })
  const kick = useMutation({
    mutationFn: () => client.party.kick({ userId }),
    onError: failed,
  })
  return (
    <>
      <RowMenu label={tr("party.memberActions", { name })}>
        <DropdownMenuItem onClick={() => ask("owner")}>
          <CrownIcon />
          {tr("party.makeOwner")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => ask("kick")}>
          <UserRoundXIcon />
          {tr("party.kick")}
        </DropdownMenuItem>
      </RowMenu>
      <AlertDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {shown === "owner"
                ? tr("party.makeOwner.title", { name })
                : tr("party.kick.title", { name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {shown === "owner"
                ? tr("party.makeOwner.description", { name })
                : tr("party.kick.description", { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("party.cancel")}</AlertDialogCancel>
            {shown === "owner" ? (
              <AlertDialogAction onClick={() => transfer.mutate()}>
                {tr("party.makeOwner.confirm")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                variant="destructive"
                onClick={() => kick.mutate()}
              >
                {tr("party.kick.confirm")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
