import { type HTTPPath, oc } from "@orpc/contract"

import type { Permission, ProcedureMeta } from "./permissions"

const routes = oc.$meta<ProcedureMeta>({})

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** The permission a procedure takes; false for none beyond signing in. */
type Needed = Permission | false

function route(method: Method, path: HTTPPath, permission?: Needed) {
  if (permission === undefined) return routes.route({ method, path })
  // The description reaches the OpenAPI document, where an app's author
  // looks for what a call needs.
  const description =
    permission === false
      ? "Any account and any API token may call this."
      : permission === "all"
        ? "Only an admin calls this, and an API token needs the `all` permission."
        : `The account needs the \`${permission}\` permission, and so does an API token.`
  return routes.route({ method, path, description }).meta({ permission })
}

// Where each procedure sits in the REST API under `OPENAPI_PATH`. The RPC
// handler ignores these; every RPC call is a POST to its router path.
//
// The second argument is the permission a caller needs, see `PERMISSIONS`.
// Every procedure behind a sign-in names one. Left out, only an admin
// calls it, with a session or a token that has `all`, and a procedure
// anyone calls without signing in needs none.
export const get = (path: HTTPPath, permission?: Needed) =>
  route("GET", path, permission)
export const post = (path: HTTPPath, permission?: Needed) =>
  route("POST", path, permission)
export const put = (path: HTTPPath, permission?: Needed) =>
  route("PUT", path, permission)
export const patch = (path: HTTPPath, permission?: Needed) =>
  route("PATCH", path, permission)
export const del = (path: HTTPPath, permission?: Needed) =>
  route("DELETE", path, permission)
