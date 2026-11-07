import { type HTTPPath, oc } from "@orpc/contract"

// Where each procedure sits in the REST API under `OPENAPI_PATH`. The RPC
// handler ignores these; every RPC call is a POST to its router path.
export const get = (path: HTTPPath) => oc.route({ method: "GET", path })
export const post = (path: HTTPPath) => oc.route({ method: "POST", path })
export const put = (path: HTTPPath) => oc.route({ method: "PUT", path })
export const patch = (path: HTTPPath) => oc.route({ method: "PATCH", path })
export const del = (path: HTTPPath) => oc.route({ method: "DELETE", path })
