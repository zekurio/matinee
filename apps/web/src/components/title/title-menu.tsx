import type { Title } from "@matinee/contracts"
import { Show } from "solid-js"

import { tr } from "@/i18n"

import { useLibraryProvider } from "./library-provider"

/**
 * Says when the provider found nothing, so a name in a folder isn't
 * mistaken for a match. Its parent spaces it from the buttons above.
 */
export function MatchNote(props: { title: Title }) {
  // A matched title has nothing to say, so it doesn't ask.
  const provider = useLibraryProvider(
    () => props.title.libraryId,
    () => !props.title.providerId,
  )
  const note = () => {
    const found = provider()
    if (!found || props.title.providerId) return null
    return props.title.provider
      ? tr("title.match.none", {
          provider: found.name,
          path: props.title.path,
        })
      : tr("title.match.waiting", { provider: found.name })
  }
  return (
    <Show when={note()}>
      <p class="text-muted-foreground text-sm">{note()}</p>
    </Show>
  )
}
