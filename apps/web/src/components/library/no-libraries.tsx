import { buttonVariants } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Link } from "@tanstack/react-router"
import { FolderPlusIcon, PopcornIcon } from "lucide-react"

import { tr } from "@/i18n"
import { settingsLink } from "@/lib/settings"

/**
 * What Home and Media say when there's no library to show. An admin sees
 * every library, so none means none exist, and gets the way to add one.
 * Anyone else may be in no group that opens one.
 */
export function NoLibraries({ admin }: { admin: boolean }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {admin ? <FolderPlusIcon /> : <PopcornIcon />}
        </EmptyMedia>
        <EmptyTitle>
          {admin ? tr("browse.home.noLibraries") : tr("browse.home.nothingYet")}
        </EmptyTitle>
        <EmptyDescription>
          {admin
            ? tr("browse.home.noLibrariesAdmin")
            : tr("browse.home.nothingYetDescription")}
        </EmptyDescription>
      </EmptyHeader>
      {admin && (
        <EmptyContent>
          <Link {...settingsLink("libraries")} className={buttonVariants()}>
            {tr("browse.home.addLibrary")}
          </Link>
        </EmptyContent>
      )}
    </Empty>
  )
}
