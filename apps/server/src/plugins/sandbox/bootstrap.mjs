// tsx must be registered inside a Worker; inheriting its CLI flags is not enough.
import { register } from "tsx/esm/api"
register()
await import("./worker.ts")
