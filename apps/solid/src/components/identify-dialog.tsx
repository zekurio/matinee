import type { MetadataMatch, Title } from "@matinee/contracts"
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query"
import { Search } from "lucide"
import { createSignal, For, Match, Show, Switch, untrack } from "solid-js"

import { tr } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Badge } from "@/kit/badge"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { TextField } from "@/lib/form-fields"
import { art, present } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { Picture, tone } from "./picture"

/** Refetch everything that shows a title's name or art. */
export function invalidateTitleData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.titles.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.media.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
  ])
}

/**
 * Search the library's provider by hand and pick the right entry, for
 * titles the automatic match got wrong or missed.
 */
export function IdentifyDialog(props: {
  title: Title
  providerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex h-[min(36rem,calc(100dvh-2rem))] flex-col gap-5 p-6 sm:max-w-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        <Show when={props.title.id} keyed>
          {(_id) => (
            <IdentifyForm
              title={props.title}
              providerName={props.providerName}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </DialogContent>
    </Dialog>
  )
}

function IdentifyForm(props: {
  title: Title
  providerName: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  // The search runs on open with the current name, then on each submit.
  // The name and year seed it once, as a form's defaults do.
  const seed = untrack(() => ({
    name: props.title.name,
    year: props.title.year,
  }))
  const [submitted, setSubmitted] = createSignal({
    query: seed.name,
    year: seed.year ?? undefined,
  })
  const results = useQuery(() => ({
    ...orpc.titles.findMatches.queryOptions({
      input: { id: props.title.id, ...submitted() },
    }),
    staleTime: 5 * 60_000,
    retry: false,
  }))
  const matches = () => (results.isSuccess ? results.data : [])

  const identify = useMutation(() => ({
    mutationFn: (match: MetadataMatch) =>
      client.titles.identify({ id: props.title.id, providerId: match.id }),
    onSuccess: async (updated: Title) => {
      await invalidateTitleData(queryClient)
      toast.success(tr("title.identify.matched", { name: updated.name }))
      props.onDone()
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  const form = createForm({
    defaultValues: {
      name: seed.name,
      year: seed.year ? String(seed.year) : "",
    },
    onSubmit: ({ name, year }) => {
      const parsedYear = Number(year)
      setSubmitted({
        query: name.trim() || props.title.name,
        year:
          year.trim() && Number.isInteger(parsedYear) ? parsedYear : undefined,
      })
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("title.identify.title")}
        </DialogTitle>
        <DialogDescription>
          {trRich("title.identify.description", {
            provider: props.providerName,
            path: (
              <span class="text-foreground text-13px font-mono break-all">
                {props.title.path}
              </span>
            ),
          })}
        </DialogDescription>
      </DialogHeader>

      <form
        class="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.submit()
        }}
      >
        <div class="min-w-0 flex-1">
          <TextField
            form={form}
            name="name"
            id="identify-name"
            label={tr("title.identify.name")}
          />
        </div>
        <div class="w-20 shrink-0">
          <TextField
            form={form}
            name="year"
            id="identify-year"
            label={tr("title.identify.year")}
            inputmode="numeric"
            placeholder={tr("title.identify.anyYear")}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          aria-label={tr("title.identify.search")}
        >
          <Icon icon={Search} />
          <span class="max-sm:hidden">{tr("title.identify.search")}</span>
        </Button>
      </form>

      {/* The dialog has a fixed height, so this pane fills it whether it
          shows the spinner, a failed search, the empty state, or results. */}
      <div class="-mx-6 flex min-h-0 flex-1 flex-col overflow-y-auto border-t px-3 pt-2">
        <Switch>
          <Match when={results.isPending}>
            <div class="grid flex-1 place-items-center pb-2">
              <Spinner class="size-5" />
            </div>
          </Match>
          <Match when={results.isError}>
            <p class="text-muted-foreground grid flex-1 place-items-center px-3 pb-2 text-center text-sm">
              {errorMessage(results.error)}
            </p>
          </Match>
          <Match when={matches().length === 0}>
            <p class="text-muted-foreground grid flex-1 place-items-center px-3 pb-2 text-center text-sm">
              {tr("title.identify.empty", {
                provider: props.providerName,
                query: submitted().query,
              })}
            </p>
          </Match>
          <Match when={matches().length > 0}>
            <ul class="flex flex-col pb-2">
              <For each={matches()} keyed={(match) => match.id}>
                {(match) => (
                  <li>
                    <button
                      type="button"
                      disabled={identify.isPending}
                      onClick={() => identify.mutate(match())}
                      class="hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:ring-ring flex w-full gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 disabled:opacity-60"
                    >
                      <span
                        class={[
                          "relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded border",
                          tone(match().id),
                        ]}
                      >
                        <Picture sources={present(art(match().poster))} />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-baseline gap-x-2">
                          <span class="text-sm font-medium">
                            {match().name}
                          </span>
                          <Show when={match().year}>
                            <span class="text-muted-foreground text-sm tabular-nums">
                              {match().year}
                            </span>
                          </Show>
                          <Show when={match().id === props.title.providerId}>
                            <Badge variant="secondary">
                              {tr("title.identify.current")}
                            </Badge>
                          </Show>
                        </span>
                        <Show when={match().overview}>
                          <span class="text-muted-foreground text-13px mt-1 line-clamp-2 leading-5">
                            {match().overview}
                          </span>
                        </Show>
                      </span>
                      <Show
                        when={
                          identify.isPending &&
                          identify.variables?.id === match().id
                        }
                      >
                        <Spinner class="mt-1 size-4 shrink-0" />
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>
      </div>
    </>
  )
}
