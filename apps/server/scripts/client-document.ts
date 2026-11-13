import type { Document } from "./kotlin-client"

export async function clientDocument(): Promise<Document> {
  // env.ts wants a database to start, though the document never opens one.
  process.env.DATABASE_URL ??= "postgres://localhost/matinee"
  const { openapiSpec } = await import("../src/rpc/openapi")
  // SAFETY: The converter writes these schemas and oRPC wraps the event streams;
  // Document names the parts of that document the native generators read.
  return (await openapiSpec()) as Document
}
