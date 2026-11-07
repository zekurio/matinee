import type { Title, WatchedAt } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getRouteApi } from "@tanstack/react-router"
import { EllipsisIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import {
  IdentifyDialog,
  invalidateTitleData,
} from "@/components/identify-dialog"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { useSetTitleWatched, WatchedMenuItems } from "@/components/watched-menu"
import { client, errorMessage, orpc } from "@/lib/rpc"

const route = getRouteApi("/_authed/_shell/titles/$titleId")

export function useLibraryProvider(libraryId: string) {
  const library = useQuery(
    orpc.libraries.get.queryOptions({ input: { id: libraryId } }),
  )
  const providers = useQuery(orpc.metadata.providers.queryOptions())
  const id = library.data?.metadataProvider
  return id ? (providers.data?.find((p) => p.id === id) ?? null) : null
}

/**
 * How many of the title's files are watched, and whether any is watched or
 * in progress. Shows count by season; movies and folders load their files,
 * which the page lists anyway.
 */
function useTitleProgress(title: Title) {
  const items = useQuery({
    ...orpc.titles.items.queryOptions({ input: { id: title.id } }),
    enabled: title.kind !== "show",
  })
  if (title.kind === "show") {
    const watched = title.seasons.reduce((n, s) => n + s.watchedCount, 0)
    // Next is the file in progress, if there is one.
    return { watched, started: watched > 0 || title.next?.progress != null }
  }
  const files = items.data ?? []
  return {
    watched: files.filter((item) => item.progress?.completed).length,
    started: files.some((item) => item.progress !== null),
  }
}

/**
 * Mark watched for everyone. Admins in libraries with a provider also get
 * fix match and refresh.
 */
export function TitleMenu({ title }: { title: Title }) {
  const { user } = route.useRouteContext()
  const queryClient = useQueryClient()
  const provider = useLibraryProvider(title.libraryId)
  const progress = useTitleProgress(title)
  const setWatched = useSetTitleWatched()
  const [identifying, setIdentifying] = useState(false)
  const [picking, setPicking] = useState(false)
  const mark = (watched: boolean, watchedAt?: WatchedAt) =>
    setWatched.mutate({ titleId: title.id, watched, watchedAt })
  const refresh = useMutation({
    mutationFn: () => client.titles.refresh({ id: title.id }),
    onSuccess: async () => {
      await invalidateTitleData(queryClient)
      toast.success(`Updated ${title.name}`, {
        description: `Fetched again from ${provider?.name}.`,
      })
    },
    onError: (error) =>
      toast.error("Couldn't fetch metadata", {
        description: errorMessage(error),
      }),
  })
  // Set when the user can fix the match and refresh.
  const adminProvider = user.role === "admin" ? provider : null
  const hasFiles = title.itemCount > 0
  if (!hasFiles && !adminProvider) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-lg"
              aria-label="More actions"
              className="border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-52">
          {hasFiles && (
            <WatchedMenuItems
              scope={title.itemCount > 1 ? "all" : "as"}
              watched={progress.watched >= title.itemCount}
              started={progress.started}
              onSelect={mark}
              onPickDate={() => setPicking(true)}
            />
          )}
          {hasFiles && adminProvider && <DropdownMenuSeparator />}
          {adminProvider && (
            <>
              <DropdownMenuItem onClick={() => setIdentifying(true)}>
                <SearchIcon />
                Fix match…
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                <RefreshCwIcon />
                Refresh metadata
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {hasFiles && (
        <WatchedDateDialog
          open={picking}
          onOpenChange={setPicking}
          onPick={(watchedAt) => mark(true, watchedAt)}
        />
      )}
      {adminProvider && (
        <IdentifyDialog
          title={title}
          providerName={adminProvider.name}
          open={identifying}
          onOpenChange={setIdentifying}
        />
      )}
    </>
  )
}

/** Says when the provider found nothing, so a name in a folder isn't mistaken for a match. */
export function MatchNote({ title }: { title: Title }) {
  const provider = useLibraryProvider(title.libraryId)
  if (!provider || title.providerId) return null
  return (
    <p className="text-muted-foreground mt-4 text-sm">
      {title.provider
        ? `${provider.name} had no match for “${title.path}”, so the name comes from the folder.`
        : `Waiting for ${provider.name}. The name comes from the folder for now.`}
    </p>
  )
}
