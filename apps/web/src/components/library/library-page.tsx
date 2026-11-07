import { Skeleton } from "@matinee/ui/components/skeleton"

import { FolderList } from "./folder-list"
import { PosterGridSkeleton, useLibrary } from "./library-states"
import { libraryRoute } from "./list-params"
import { TitleGrid } from "./title-grid"

/**
 * Movies and shows as a poster grid. Links into one show's folder list
 * its files instead.
 */
export function LibraryPage() {
  const { libraryId } = libraryRoute.useParams()
  const { show } = libraryRoute.useSearch()
  const library = useLibrary(libraryId)
  if (library.isPending) {
    return (
      <div>
        <Skeleton className="mb-6 h-10 w-48" />
        <PosterGridSkeleton />
      </div>
    )
  }
  if (library.data && !show) {
    return <TitleGrid library={library.data} />
  }
  return <FolderList />
}
