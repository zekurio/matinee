import { t } from "@matinee/contracts/schema"

/*
 * What the main thread and the plugin host thread say to each other. Both
 * sides parse every message, since the host thread runs untrusted code
 * behind its bridge. Every message about a guest carries the guest's
 * number, which the main thread makes up, so nothing meant for one plugin
 * can reach another.
 */

export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024
/** Each 32-byte slot holds elapsed microseconds, run start, and a sequence. */
export const LOAD_SLOTS = 1024
export const Limits = t.object({
  memoryBytes: t.number().positive(),
  stackBytes: t.number().positive(),
  cpuMs: t.number().positive(),
  callMs: t.number().positive(),
  startMs: t.number().positive(),
  settleMs: t.number().positive(),
})
export const GuestError = t.object({
  name: t.string().max(2000),
  message: t.string().max(2000),
  status: t.number().nullable(),
})
export const Envelope = t.union([
  t.object({ ok: t.literal(true), json: t.string() }),
  t.object({ ok: t.literal(false), error: GuestError }),
])
const Guest = t.number().int().min(1)
export const WorkerMessage = t.union([
  t.object({
    type: t.literal("reply"),
    guest: Guest,
    id: t.number(),
    json: t.string(),
  }),
  t.object({
    type: t.literal("host"),
    guest: Guest,
    id: t.number(),
    name: t.string().max(128),
    json: t.string(),
  }),
  /** The guest ended by itself: a limit it passed, or a failure of its own. */
  t.object({
    type: t.literal("ended"),
    guest: Guest,
    kind: t.enum(["limit", "crashed"]),
    message: t.string().max(2000),
  }),
  /** The guest was stopped as asked and is gone. */
  t.object({ type: t.literal("stopped"), guest: Guest }),
  t.object({ type: t.literal("pong"), id: t.number() }),
])
export const MainMessage = t.union([
  t.object({
    type: t.literal("start"),
    guest: Guest,
    slot: t
      .number()
      .int()
      .min(0)
      .max(LOAD_SLOTS - 1),
    id: t.number(),
    code: t.string(),
    context: t.string(),
    limits: Limits,
  }),
  t.object({
    type: t.literal("call"),
    guest: Guest,
    id: t.number(),
    path: t.string().max(1024),
    json: t.string(),
  }),
  t.object({
    type: t.literal("answer"),
    guest: Guest,
    id: t.number(),
    json: t.string(),
    ok: t.boolean(),
  }),
  t.object({ type: t.literal("cancel"), guest: Guest, id: t.number() }),
  /** Dispose the guest and forget it. The thread stays for the others. */
  t.object({ type: t.literal("stop"), guest: Guest }),
  t.object({ type: t.literal("ping"), id: t.number() }),
  /** End the thread. */
  t.object({ type: t.literal("close") }),
  /**
   * For the checks only, and ignored unless the thread was started with
   * test hooks: spin in host code as if stuck inside that guest.
   */
  t.object({ type: t.literal("spin"), guest: Guest, ms: t.number() }),
])
export type WorkerMessage = t.infer<typeof WorkerMessage>
export type MainMessage = t.infer<typeof MainMessage>

export function encodeMessage(message: MainMessage | WorkerMessage): string {
  const text = JSON.stringify(message)
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES)
    throw new Error("Sandbox message exceeds 8 MB")
  return text
}

export const WireText = t
  .string()
  .refine(
    (text) => Buffer.byteLength(text) <= MAX_MESSAGE_BYTES,
    "Sandbox message exceeds 8 MB",
  )
