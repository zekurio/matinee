import type { Title } from "@matinee/contracts"

import { tr } from "@/i18n"

import { useLibraryProvider } from "./library-provider"

/** Says when the provider found nothing, so a name in a folder isn't mistaken for a match. */
export function MatchNote({ title }: { title: Title }) {
  const provider = useLibraryProvider(title.libraryId)
  if (!provider || title.providerId) return null
  return (
    <p className="text-muted-foreground mt-4 text-sm">
      {title.provider
        ? tr("title.match.none", { provider: provider.name, path: title.path })
        : tr("title.match.waiting", { provider: provider.name })}
    </p>
  )
}
