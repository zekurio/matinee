import {
  type Party,
  type PartyEntry,
  type PartyMember,
  PartyName,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useMutation } from "@tanstack/solid-query"
import { Link, useNavigate } from "@tanstack/solid-router"
import {
  ArrowDown,
  ArrowUp,
  Check,
  Crown,
  Ellipsis,
  ListPlus,
  LogOut,
  Pencil,
  Play,
  UserRoundPlus,
  UserRoundX,
  UsersRound,
  X,
} from "lucide"
import { createSignal, For, Show } from "solid-js"

import { Picture, tone } from "@/components/picture"
import { UserAvatar } from "@/components/user-avatar"
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
import { Button, buttonVariants } from "@/kit/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/kit/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { itemLabel, landscapeSources } from "@/lib/media"
import {
  partyInviteUrl,
  partyItemName,
  partyPosition,
  setParty,
  useParty,
} from "@/lib/party"
import { client, errorMessage } from "@/lib/rpc"
import { createMemberMenuStore } from "@/stores/party-member-menu"

function failed(cause: unknown) {
  toast.error(tr("party.failed"), { description: errorMessage(cause) })
}

export function PartyDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-md">
        <Show when={props.open}>
          <PartyPanel onClose={() => props.onOpenChange(false)} />
        </Show>
      </DialogContent>
    </Dialog>
  )
}

function PartyPanel(props: { onClose: () => void }) {
  const { party, offsetMs } = useParty()
  return (
    <Show
      when={party()}
      fallback={
        <>
          <DialogHeader>
            <DialogTitle>{tr("party.title")}</DialogTitle>
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
      }
    >
      {(current) => (
        <PartyDetails
          party={current()}
          offsetMs={offsetMs()}
          onClose={props.onClose}
        />
      )}
    </Show>
  )
}

/**
 * The name to start a party with. Empty is fine: the party then goes by
 * its owner.
 */
function StartForm(props: { onSubmit: (name: string) => Promise<void> }) {
  const form = createForm({
    defaultValues: { name: "" },
    checks: { name: PartyName },
    onSubmit: (values) => props.onSubmit(PartyName.parse(values.name)),
  })
  return (
    <form
      class="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.submit()
      }}
    >
      <TextField
        form={form}
        name="name"
        label={tr("party.name.optional")}
        placeholder={tr("party.name.placeholder")}
        maxlength={64}
        autocomplete="off"
      />
      <SubmitButton form={form} icon={<Icon icon={UsersRound} />}>
        {tr("party.start")}
      </SubmitButton>
    </form>
  )
}

/**
 * The party's name, which its owner edits in place: the title turns into
 * a field with a save button beside it. Enter or leaving the field saves,
 * Escape puts the name back. Both rows are 36px, and the field's 1px border
 * and 8px padding sit left of the column, so the text stays put.
 */
function PartyTitle(props: { party: Party }) {
  const [editing, setEditing] = createSignal(false)
  const title = () => props.party.name ?? tr("party.title")
  return (
    <Show
      when={editing()}
      fallback={
        <div class="flex h-9 min-w-0 items-center gap-1 pr-8">
          <DialogTitle class="truncate text-lg leading-7">
            {title()}
          </DialogTitle>
          <Show when={props.party.owner}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tr("party.rename")}
              title={tr("party.rename")}
              onClick={() => setEditing(true)}
              class="text-muted-foreground shrink-0"
            >
              <Icon icon={Pencil} />
            </Button>
          </Show>
        </div>
      }
    >
      <div class="flex h-9 min-w-0 items-center pr-8">
        <DialogTitle class="sr-only">{title()}</DialogTitle>
        <RenameField
          name={props.party.name ?? ""}
          onDone={() => setEditing(false)}
        />
      </div>
    </Show>
  )
}

function RenameField(props: {
  /** The name the party has now. */
  name: string
  onDone: () => void
}) {
  // Set once the field is on its way out, so the blur its removal can
  // cause doesn't save again, or save what Escape threw away.
  let closed = false
  const close = () => {
    closed = true
    props.onDone()
  }
  const form = createForm({
    defaultValues: { name: props.name },
    checks: { name: PartyName },
    onSubmit: async (values) => {
      const next = PartyName.parse(values.name)
      if (next !== props.name) {
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
    if (!closed && !form.submitting()) void form.submit()
  }
  return (
    <form
      class="-ml-2.25 flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
      onFocusOut={(event) => {
        // Focus moving to the save button stays in the field.
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          commit()
        }
      }}
    >
      <Input
        // The click that opened it asked for the cursor here, with the text
        // selected to type over.
        ref={(el: HTMLInputElement) =>
          queueMicrotask(() => {
            el.focus()
            el.select()
          })
        }
        aria-label={tr("party.name")}
        placeholder={tr("party.name.placeholder")}
        maxlength={64}
        autocomplete="off"
        value={form.values().name}
        onValueChange={(value: string) => form.set("name", value)}
        onKeyDown={(event: KeyboardEvent) => {
          // Escape leaves the field before it closes the dialog.
          if (event.key === "Escape") {
            event.stopPropagation()
            close()
          }
        }}
        class="h-9 py-0 pr-2 pl-2 text-lg leading-7 font-medium md:h-9 md:text-lg [@media(pointer:coarse)]:h-9"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={form.submitting()}
        aria-label={tr("party.rename.save")}
        title={tr("party.rename.save")}
        class="text-muted-foreground shrink-0"
      >
        <Show when={form.submitting()} fallback={<Icon icon={Check} />}>
          <Spinner />
        </Show>
      </Button>
    </form>
  )
}

/**
 * The party in the order someone reads it: who is here, what plays, what
 * comes after. Each row has one quiet "⋯" for what the viewer may do
 * with it, so the panel stays a list of names and not of buttons.
 */
function PartyDetails(props: {
  party: Party
  offsetMs: number
  onClose: () => void
}) {
  const leave = useMutation(() => ({
    mutationFn: () => client.party.leave(),
    onSuccess: () => setParty(null),
    onError: failed,
  }))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partyInviteUrl(props.party))
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
        <PartyTitle party={props.party} />
      </DialogHeader>

      <ul class="-mx-2 grid">
        <For each={props.party.members} keyed={(member) => member.user.id}>
          {(member) => (
            <li class={rowLook}>
              <UserAvatar user={member().user} class="size-7 text-xs" />
              <span class="min-w-0 flex-1 truncate">
                {member().user.displayName ?? member().user.username}
              </span>
              <Show when={member().owner}>
                <span class="text-muted-foreground shrink-0 text-xs">
                  {tr("party.owner")}
                </span>
              </Show>
              <Show when={props.party.owner && !member().owner}>
                <MemberMenu member={member()} />
              </Show>
            </li>
          )}
        </For>
        <li>
          <button
            type="button"
            onClick={() => void copy()}
            class={cn(rowLook, rowPress, "text-muted-foreground w-full")}
          >
            <span class="border-foreground/25 grid size-7 shrink-0 place-items-center rounded-full border border-dashed">
              <Icon icon={UserRoundPlus} class="size-3.5" />
            </span>
            {tr("party.invite")}
          </button>
        </li>
      </ul>

      <NowPlaying
        party={props.party}
        offsetMs={props.offsetMs}
        onClose={props.onClose}
      />

      <Queue party={props.party} onClose={props.onClose} />

      <Button
        variant="ghost"
        disabled={leave.isPending}
        onClick={() => leave.mutate()}
        class="text-destructive hover:bg-destructive/10 hover:text-destructive -mx-2 justify-self-start px-2"
      >
        <Icon icon={LogOut} />
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

/** A heading for one of the panel's lists, as quiet as its rows' details. */
function ListTitle(props: { children: JSX.Element }) {
  return (
    <h3 class="text-muted-foreground px-2 pb-1 text-xs font-medium">
      {props.children}
    </h3>
  )
}

/**
 * A row's "⋯". Pointers that hover see it on hover and focus; touch
 * screens always do.
 */
function RowMenu(props: { label: string; children: JSX.Element }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={props.label}
        class={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "text-muted-foreground shrink-0 opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100 [@media(pointer:coarse)]:size-10 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        <Icon icon={Ellipsis} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        class="w-max min-w-44 whitespace-nowrap"
      >
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** What the party watches, which is the one picture in the panel. */
function NowPlaying(props: {
  party: Party
  offsetMs: number
  onClose: () => void
}) {
  const playing = () => {
    const { item, playback } = props.party
    return item && playback ? { item, playback } : null
  }
  return (
    <Show
      when={playing()}
      fallback={
        <p class="text-muted-foreground bg-foreground/[0.04] rounded-lg px-3 py-2.5">
          {props.party.restricted
            ? tr("party.restricted")
            : props.party.owner
              ? tr("party.nothing.owner")
              : tr("party.nothing.member")}
        </p>
      }
    >
      {(current) => {
        const label = () => itemLabel(current().item)
        return (
          <Link
            to="/watch/$itemId"
            params={{ itemId: current().item.id }}
            // Where the party is now, in place of the resume point.
            search={{
              start: Math.floor(
                partyPosition(current().playback, props.offsetMs),
              ),
            }}
            onClick={() => props.onClose()}
            class={cn(
              "group/now bg-foreground/[0.04] flex items-center gap-3 rounded-lg p-2",
              rowPress,
            )}
          >
            <span
              class={cn(
                "relative aspect-video w-28 shrink-0 overflow-hidden rounded-md",
                tone(label().showKey),
              )}
            >
              <Picture
                sources={landscapeSources(current().item)}
                sizes="112px"
              />
              <span class="absolute inset-0 grid place-items-center bg-black/30 text-white">
                <Icon icon={Play} class="size-5 fill-current" />
              </span>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{label().title}</span>
              <Show when={label().code}>
                <span class="text-muted-foreground block truncate text-xs">
                  {label().showName} {label().code}
                </span>
              </Show>
              <span class="text-primary mt-1 block text-xs font-medium">
                {tr("party.watchAlong")}
              </span>
            </span>
          </Link>
        )
      }}
    </Show>
  )
}

/** An entry's file: its name, and the show and episode under it. */
function EntryName(props: { entry: PartyEntry }) {
  const label = () => itemLabel(props.entry.item)
  return (
    <span class="min-w-0 flex-1">
      <span class="block truncate">{label().title}</span>
      <Show when={label().code}>
        <span class="text-muted-foreground block truncate text-xs">
          {label().showName} {label().code}
        </span>
      </Show>
    </span>
  )
}

/**
 * What plays next, numbered since the order is the point, and under it
 * what members suggested, each with who it came from.
 */
function Queue(props: { party: Party; onClose: () => void }) {
  return (
    <>
      <div class="-mx-2">
        <ListTitle>{tr("party.queue")}</ListTitle>
        <Show
          when={props.party.queue.length > 0}
          fallback={
            <p class="text-muted-foreground px-2">
              {props.party.owner
                ? tr("party.queue.owner")
                : tr("party.queue.member")}
            </p>
          }
        >
          <ol class="grid">
            <For each={props.party.queue} keyed={(entry) => entry.id}>
              {(entry, index) => (
                <li class={rowLook}>
                  <span class="text-muted-foreground w-7 shrink-0 text-center text-xs tabular-nums">
                    {index() + 1}
                  </span>
                  <EntryName entry={entry()} />
                  <Show when={props.party.owner}>
                    <QueueMenu
                      entry={entry()}
                      index={index()}
                      last={index() === props.party.queue.length - 1}
                      onClose={props.onClose}
                    />
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </div>
      <Show when={props.party.proposals.length > 0}>
        <div class="-mx-2">
          <ListTitle>{tr("party.proposals")}</ListTitle>
          <ul class="grid">
            <For each={props.party.proposals} keyed={(entry) => entry.id}>
              {(entry) => (
                <li class={rowLook}>
                  <Show
                    when={entry().by}
                    fallback={<span class="w-7 shrink-0" />}
                  >
                    {(by) => {
                      const proposedBy = () =>
                        tr("party.proposedBy", {
                          name: by().displayName ?? by().username,
                        })
                      return (
                        <span title={proposedBy()}>
                          <UserAvatar user={by()} class="size-7 text-xs" />
                          <span class="sr-only">{proposedBy()}</span>
                        </span>
                      )
                    }}
                  </Show>
                  <EntryName entry={entry()} />
                  <Show when={props.party.owner || entry().removable}>
                    <ProposalMenu entry={entry()} owner={props.party.owner} />
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </>
  )
}

function QueueMenu(props: {
  entry: PartyEntry
  index: number
  last: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const move = useMutation(() => ({
    mutationFn: (to: number) =>
      client.party.queue.move({ entryId: props.entry.id, index: to }),
    onError: failed,
  }))
  const remove = useMutation(() => ({
    mutationFn: () => client.party.queue.remove({ entryId: props.entry.id }),
    onError: failed,
  }))
  return (
    <RowMenu
      label={tr("party.entryActions", {
        name: partyItemName(props.entry.item),
      })}
    >
      {/* The owner's player is where the party's file comes from, so
          playing one is opening it. */}
      <DropdownMenuItem
        onSelect={() => {
          props.onClose()
          void navigate({
            to: "/watch/$itemId",
            params: { itemId: props.entry.item.id },
            search: { start: 0 },
          })
        }}
      >
        <Icon icon={Play} />
        {tr("party.playNow")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={props.index === 0}
        onSelect={() => move.mutate(props.index - 1)}
      >
        <Icon icon={ArrowUp} />
        {tr("party.moveUp")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={props.last}
        onSelect={() => move.mutate(props.index + 1)}
      >
        <Icon icon={ArrowDown} />
        {tr("party.moveDown")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => remove.mutate()}>
        <Icon icon={X} />
        {tr("party.remove")}
      </DropdownMenuItem>
    </RowMenu>
  )
}

function ProposalMenu(props: { entry: PartyEntry; owner: boolean }) {
  const accept = useMutation(() => ({
    mutationFn: () => client.party.queue.accept({ entryId: props.entry.id }),
    onError: failed,
  }))
  const remove = useMutation(() => ({
    mutationFn: () => client.party.queue.remove({ entryId: props.entry.id }),
    onError: failed,
  }))
  return (
    <RowMenu
      label={tr("party.entryActions", {
        name: partyItemName(props.entry.item),
      })}
    >
      <Show when={props.owner}>
        <DropdownMenuItem onSelect={() => accept.mutate()}>
          <Icon icon={ListPlus} />
          {tr("party.accept")}
        </DropdownMenuItem>
      </Show>
      <Show when={props.entry.removable}>
        <DropdownMenuItem onSelect={() => remove.mutate()}>
          <Icon icon={X} />
          {props.owner ? tr("party.dismiss") : tr("party.withdraw")}
        </DropdownMenuItem>
      </Show>
    </RowMenu>
  )
}

/** What the owner can do about another member, each after asking. */
function MemberMenu(props: { member: PartyMember }) {
  const name = () => props.member.user.displayName ?? props.member.user.username
  const menu = createMemberMenuStore()
  const transfer = useMutation(() => ({
    mutationFn: () => client.party.transfer({ userId: props.member.user.id }),
    onError: failed,
  }))
  const kick = useMutation(() => ({
    mutationFn: () => client.party.kick({ userId: props.member.user.id }),
    onError: failed,
  }))
  return (
    <>
      <RowMenu label={tr("party.memberActions", { name: name() })}>
        <DropdownMenuItem onSelect={() => menu.ask("owner")}>
          <Icon icon={Crown} />
          {tr("party.makeOwner")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => menu.ask("kick")}
        >
          <Icon icon={UserRoundX} />
          {tr("party.kick")}
        </DropdownMenuItem>
      </RowMenu>
      <AlertDialog
        open={menu.open()}
        onOpenChange={(next: boolean) => {
          if (!next) menu.close()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {menu.shown() === "owner"
                ? tr("party.makeOwner.title", { name: name() })
                : tr("party.kick.title", { name: name() })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {menu.shown() === "owner"
                ? tr("party.makeOwner.description", { name: name() })
                : tr("party.kick.description", { name: name() })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("party.cancel")}</AlertDialogCancel>
            <Show
              when={menu.shown() === "owner"}
              fallback={
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    kick.mutate()
                    menu.close()
                  }}
                >
                  {tr("party.kick.confirm")}
                </AlertDialogAction>
              }
            >
              <AlertDialogAction
                onClick={() => {
                  transfer.mutate()
                  menu.close()
                }}
              >
                {tr("party.makeOwner.confirm")}
              </AlertDialogAction>
            </Show>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
