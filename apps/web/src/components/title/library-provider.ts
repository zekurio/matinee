import type { MetadataProvider } from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"

import { orpc } from "@/lib/rpc"

/**
 * The library's metadata provider. Null when it has none, and undefined
 * while that's still loading, or with `enabled` off, as for a card a user
 * who isn't an admin sees.
 */
export function useLibraryProvider(
  libraryId: string,
  enabled = true,
): MetadataProvider | null | undefined {
  const library = useQuery({
    ...orpc.libraries.get.queryOptions({ input: { id: libraryId } }),
    enabled,
  })
  const providers = useQuery({
    ...orpc.metadata.providers.queryOptions(),
    enabled,
  })
  if (!library.data) return undefined
  const id = library.data.metadataProvider
  if (!id) return null
  if (!providers.data) return undefined
  return (
    providers.data.find((p) => p.id === id) ?? {
      id,
      name: id,
      plugin: { id, name: id },
      builtin: false,
      available: false,
      configured: false,
      setup: null,
      description: "",
      kinds: [],
      episodes: false,
    }
  )
}
