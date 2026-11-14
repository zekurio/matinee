import { Skeleton } from "@matinee/ui/components/skeleton"

import { tr } from "@/i18n"
import { errorMessage } from "@/lib/rpc"

import { PosterGridSkeleton, useLibrary } from "./library-states"
import { libraryRoute } from "./list-params"
import { TitleGrid } from "./title-grid"

/** A library's movies or shows as a poster grid. */
export function LibraryPage() {
  const { libraryId } = libraryRoute.useParams()
  const library = useLibrary(libraryId)
  if (library.isPending) {
    return (
      <div>
        <Skeleton className="mb-6 h-10 w-48" />
        <PosterGridSkeleton />
      </div>
    )
  }
  if (library.isError) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          {tr("library.loadFailed")}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(library.error)}
        </p>
      </div>
    )
  }
  return <TitleGrid library={library.data} />
}
