import type { MetadataMatch, Title } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SearchIcon } from "lucide-react"
import { useState } from "react"

import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { useAppForm } from "@/lib/form"
import { art, present } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { FormAlert } from "./form-alert"
import { Picture, tone } from "./media-item"

/** Refetch everything that shows a title's name or art. */
export function invalidateTitleData(
  queryClient: ReturnType<typeof useQueryClient>,
) {
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
export function IdentifyDialog({
  title,
  providerName,
  open,
  onOpenChange,
}: {
  title: Title
  providerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(36rem,calc(100dvh-2rem))] flex-col gap-5 p-6 sm:max-w-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        {open && (
          <IdentifyForm
            title={title}
            providerName={providerName}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function IdentifyForm({
  title,
  providerName,
  onDone,
}: {
  title: Title
  providerName: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  // The search runs on open with the current name, then on each submit.
  const [submitted, setSubmitted] = useState({
    query: title.name,
    year: title.year ?? undefined,
  })
  const results = useQuery({
    ...orpc.titles.findMatches.queryOptions({
      input: { id: title.id, ...submitted },
    }),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const identify = useMutation({
    mutationFn: (match: MetadataMatch) =>
      client.titles.identify({ id: title.id, providerId: match.id }),
    onSuccess: async (updated) => {
      await invalidateTitleData(queryClient)
      toast.success(tr("title.identify.matched", { name: updated.name }))
      onDone()
    },
  })

  const form = useAppForm({
    defaultValues: {
      name: title.name,
      year: title.year ? String(title.year) : "",
    },
    onSubmit: ({ value: { name, year } }) => {
      const parsedYear = Number(year)
      setSubmitted({
        query: name.trim() || title.name,
        year:
          year.trim() && Number.isInteger(parsedYear) ? parsedYear : undefined,
      })
    },
  })

  const error = identify.error ?? results.error

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("title.identify.title")}
        </DialogTitle>
        <DialogDescription>
          {trRich("title.identify.description", {
            provider: providerName,
            path: (
              <span className="text-foreground font-mono text-[13px] break-all">
                {title.path}
              </span>
            ),
          })}
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="min-w-0 flex-1">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                id="identify-name"
                label={tr("title.identify.name")}
              />
            )}
          </form.AppField>
        </div>
        <div className="w-20 shrink-0">
          <form.AppField name="year">
            {(field) => (
              <field.TextField
                id="identify-year"
                label={tr("title.identify.year")}
                inputMode="numeric"
                placeholder={tr("title.identify.anyYear")}
              />
            )}
          </form.AppField>
        </div>
        <Button
          type="submit"
          variant="secondary"
          aria-label={tr("title.identify.search")}
        >
          <SearchIcon />
          <span className="max-sm:hidden">{tr("title.identify.search")}</span>
        </Button>
      </form>

      {error && <FormAlert message={errorMessage(error)} />}

      {/* The dialog has a fixed height, so this pane fills it whether it
          shows the spinner, the empty state, or results. */}
      <div className="-mx-6 flex min-h-0 flex-1 flex-col overflow-y-auto border-t px-3 pt-2">
        {results.isPending ? (
          <div className="grid flex-1 place-items-center pb-2">
            <Spinner className="size-5" />
          </div>
        ) : results.data?.length === 0 ? (
          <p className="text-muted-foreground grid flex-1 place-items-center px-3 pb-2 text-center text-sm">
            {tr("title.identify.empty", {
              provider: providerName,
              query: submitted.query,
            })}
          </p>
        ) : (
          <ul className="flex flex-col pb-2">
            {results.data?.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  disabled={identify.isPending}
                  onClick={() => identify.mutate(match)}
                  className="hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:ring-ring flex w-full gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 disabled:opacity-60"
                >
                  <span
                    className={`relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded border ${tone(match.id)}`}
                  >
                    <Picture sources={present(art(match.poster))} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{match.name}</span>
                      {match.year && (
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {match.year}
                        </span>
                      )}
                      {match.id === title.providerId && (
                        <Badge variant="secondary">
                          {tr("title.identify.current")}
                        </Badge>
                      )}
                    </span>
                    {match.overview && (
                      <span className="text-muted-foreground mt-1 line-clamp-2 text-[13px] leading-5">
                        {match.overview}
                      </span>
                    )}
                  </span>
                  {identify.isPending &&
                    identify.variables?.id === match.id && (
                      <Spinner className="mt-1 size-4 shrink-0" />
                    )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
