import type { MetadataProvider } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"

import { orpc } from "@/lib/rpc"

/**
 * The library's metadata provider. Null when it has none, and undefined
 * while that's still loading, or with `enabled` off, as for a card a user
 * who isn't an admin sees.
 */
// Returns an accessor.
export function useLibraryProvider(
  libraryId: () => string,
  enabled: () => boolean = () => true,
): () => MetadataProvider | null | undefined {
  const library = useQuery(() => ({
    ...orpc.libraries.get.queryOptions({ input: { id: libraryId() } }),
    enabled: enabled(),
  }))
  const providers = useQuery(() => ({
    ...orpc.metadata.providers.queryOptions(),
    enabled: enabled(),
  }))
  return () => {
    if (!library.isSuccess) return undefined
    const id = library.data.metadataProvider
    if (!id) return null
    if (!providers.isSuccess) return undefined
    return providers.data.find((provider) => provider.id === id) ?? null
  }
}
