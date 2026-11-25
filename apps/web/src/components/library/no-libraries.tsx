import { Link } from "@tanstack/solid-router"
import { FolderPlus, Popcorn } from "lucide"
import { Show } from "solid-js"

import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { settingsLink } from "@/lib/settings"

/**
 * What Home and Media say when there's no library to show. An admin sees
 * every library, so none means none exist, and gets the way to add one.
 * Anyone else may be in no group that opens one.
 */
export function NoLibraries(props: { admin: boolean }) {
  return (
    <Empty class="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon={props.admin ? FolderPlus : Popcorn} />
        </EmptyMedia>
        <EmptyTitle>
          {props.admin
            ? tr("browse.home.noLibraries")
            : tr("browse.home.nothingYet")}
        </EmptyTitle>
        <EmptyDescription>
          {props.admin
            ? tr("browse.home.noLibrariesAdmin")
            : tr("browse.home.nothingYetDescription")}
        </EmptyDescription>
      </EmptyHeader>
      <Show when={props.admin}>
        <EmptyContent>
          <Link {...settingsLink("libraries")} class={buttonVariants()}>
            {tr("browse.home.addLibrary")}
          </Link>
        </EmptyContent>
      </Show>
    </Empty>
  )
}
