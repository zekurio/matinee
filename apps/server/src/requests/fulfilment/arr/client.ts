import { type SchemaBoundaryInput, t } from "@matinee/contracts/schema"
import { ORPCError } from "@orpc/server"

import { BodyTooLarge, readJsonBody } from "../../../json-body"
import { log } from "../../../log"
import { type FulfilmentConnection, UNREACHABLE } from "../types"

const settings = t.object({ baseUrl: t.string().url() })
// Matinee asks Radarr and Sonarr for single records, lookups, and one
// series' episodes, a few megabytes at most even for long-running shows.
const MAX_BODY_BYTES = 16 * 1024 * 1024

export async function call<T>(
  connection: FulfilmentConnection,
  path: string,
  schema: { parse: (value: SchemaBoundaryInput) => T },
  method = "GET",
  body?: t.infer<ReturnType<typeof t.record>>,
  missing = false,
): Promise<T | null> {
  const { baseUrl } = settings.parse(connection.settings)
  let response: Response
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v3/${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "X-Api-Key": connection.apiKey ?? "",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ORPCError("BAD_REQUEST", { message: UNREACHABLE })
  }
  if (missing && response.status === 404) return null
  if (response.status === 401 || response.status === 403)
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The connection rejected the API key. Check the saved key or environment variable.",
    })
  if (!response.ok)
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The connection rejected the operation. Check its configuration and logs.",
    })
  let value: SchemaBoundaryInput
  try {
    value = await readJsonBody(response, MAX_BODY_BYTES)
  } catch (cause) {
    if (cause instanceof BodyTooLarge) {
      log.warn(
        `The connection's reply to ${path} was over ${MAX_BODY_BYTES} bytes`,
      )
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The connection sent a reply too large to read. Check its configuration and logs.",
      })
    }
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The connection rejected the operation. Check its configuration and logs.",
    })
  }
  try {
    return schema.parse(value)
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The connection rejected the operation. Check its configuration and logs.",
    })
  }
}

export async function list(connection: FulfilmentConnection, path: string) {
  return (
    (await call(
      connection,
      path,
      t.array(t.record(t.string(), t.unknown())),
    )) ?? []
  )
}
