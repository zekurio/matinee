import { createFileRoute } from "@tanstack/react-router"

import { ApiReference } from "@/components/api-reference"

/**
 * The REST API's reference, open to anyone like the document it reads.
 * Requests tried from it carry the browser's session, if it has one.
 */
export const Route = createFileRoute("/api-docs")({
  component: ApiReference,
})
