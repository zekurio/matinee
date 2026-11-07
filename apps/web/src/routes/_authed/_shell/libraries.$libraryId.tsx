import { t } from "@matinee/contracts/schema"
import { createFileRoute } from "@tanstack/react-router"

import { LibraryPage } from "@/components/library/library-page"
import type { Sort } from "@/components/library/list-params"

/** Title is the default sort, so the URL leaves it out. */
const LibrarySearch = t.object({
  q: t.string().min(1).optional().catch(undefined),
  show: t.string().min(1).optional().catch(undefined),
  sort: t.enum(["recent", "year"]).optional().catch(undefined) satisfies t.Type<
    Sort | undefined
  >,
  genre: t.string().min(1).optional().catch(undefined),
  studio: t.string().min(1).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/libraries/$libraryId")({
  validateSearch: LibrarySearch,
  component: LibraryPage,
})
