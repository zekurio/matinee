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
import { Field, FieldLabel } from "@matinee/ui/components/field"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SearchIcon } from "lucide-react"
import { useState } from "react"

import { art } from "@/lib/media"
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
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-5 p-6 sm:max-w-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
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
  const [name, setName] = useState(title.name)
  const [year, setYear] = useState(title.year ? String(title.year) : "")
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
      toast.success(`Matched to ${updated.name}`)
      onDone()
    },
  })

  const search = () => {
    const parsedYear = Number(year)
    setSubmitted({
      query: name.trim() || title.name,
      year:
        year.trim() && Number.isInteger(parsedYear) ? parsedYear : undefined,
    })
  }

  const error = identify.error ?? results.error

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          Fix match
        </DialogTitle>
        <DialogDescription>
          Search {providerName} and pick the entry for{" "}
          <span className="text-foreground font-mono text-[13px] break-all">
            {title.path}
          </span>
          .
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          search()
        }}
      >
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="identify-name">Name</FieldLabel>
          <Input
            id="identify-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field className="w-20 shrink-0">
          <FieldLabel htmlFor="identify-year">Year</FieldLabel>
          <Input
            id="identify-year"
            inputMode="numeric"
            value={year}
            placeholder="Any"
            onChange={(event) => setYear(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" aria-label="Search">
          <SearchIcon />
          <span className="max-sm:hidden">Search</span>
        </Button>
      </form>

      {error && <FormAlert message={errorMessage(error)} />}

      <div className="-mx-6 min-h-40 flex-1 overflow-y-auto border-t px-3 pt-2">
        {results.isPending ? (
          <div className="grid h-40 place-items-center">
            <Spinner className="size-5" />
          </div>
        ) : results.data?.length === 0 ? (
          <p className="text-muted-foreground px-3 py-10 text-center text-sm">
            {providerName} found nothing for “{submitted.query}”. Try the
            original title, or leave the year empty.
          </p>
        ) : (
          <ul className="flex flex-col pb-2">
            {results.data?.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  disabled={identify.isPending}
                  onClick={() => identify.mutate(match)}
                  className="hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-ring flex w-full gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 disabled:opacity-60"
                >
                  <span
                    className={`relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded border ${tone(match.id)}`}
                  >
                    {match.poster && (
                      <Picture sources={[art(match.poster) ?? ""]} />
                    )}
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
                        <Badge variant="secondary">Current match</Badge>
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
