import { t } from "@matinee/contracts/schema"

import {
  BRIDGE_ERROR_CODES,
  BRIDGE_PROTOCOL,
  BridgeEvent,
  type BridgeErrorCode,
  BridgeResponse,
  type BridgeTransport,
  type EventData,
  type EventName,
  events,
  type MethodName,
  type MethodParams,
  type MethodResult,
  methods,
} from "./protocol"

declare global {
  interface Window {
    /** Set by the desktop app's shell. Absent in a browser. */
    matineeDesktop?: BridgeTransport
  }
}

/** A request the shell refused or couldn't carry out. */
export class DesktopBridgeError extends Error {
  readonly code: BridgeErrorCode

  constructor(code: BridgeErrorCode, message: string) {
    super(message)
    this.name = "DesktopBridgeError"
    this.code = code
  }
}

const ErrorCode = t.enum(BRIDGE_ERROR_CODES)

type Response = t.infer<typeof BridgeResponse>
type Listener<Name extends EventName> = (data: EventData<Name>) => void

/** The desktop app's shell, as a page talks to it. */
export type DesktopBridge = {
  /**
   * Calls a method of the shell. Rejects with a `DesktopBridgeError` when
   * the shell refuses, fails, or answers something this page can't read.
   */
  request: <Name extends MethodName>(
    method: Name,
    // A method that takes nothing is called without params. (`{}` from
    // `t.object({})` isn't a `Record<string, never>`, so test its keys.)
    ...params: [keyof MethodParams<Name>] extends [never]
      ? [params?: MethodParams<Name>]
      : [params: MethodParams<Name>]
  ) => Promise<MethodResult<Name>>
  /** Listens for an event. Returns the function that stops listening. */
  on: <Name extends EventName>(
    event: Name,
    listener: Listener<Name>,
  ) => () => void
}

function failure(response: Response): DesktopBridgeError | null {
  if (!response.error) return null
  const code = ErrorCode.safeParse(response.error.code)
  return new DesktopBridgeError(
    code.success ? code.data : "failed",
    response.error.message,
  )
}

function eventName(name: string): EventName | null {
  if (!(name in events)) return null
  // SAFETY: the check just before found it among the events' names.
  return name as EventName
}

function connect(transport: BridgeTransport): DesktopBridge {
  let nextId = 1
  // What each request on its way does with its answer.
  const pending = new Map<number, (response: Response) => void>()
  const listeners = new Map<EventName, Set<Listener<EventName>>>()

  const tell = (message: t.infer<typeof BridgeEvent>) => {
    const name = eventName(message.event)
    // An event from a newer shell that this page doesn't know.
    if (!name) return
    const data = events[name].safeParse(message.data)
    if (!data.success) return
    for (const listener of listeners.get(name) ?? []) listener(data.data)
  }

  transport.receive = (text) => {
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return
    }
    const response = BridgeResponse.safeParse(json)
    if (response.success) {
      const settle = pending.get(response.data.id)
      pending.delete(response.data.id)
      settle?.(response.data)
      return
    }
    const event = BridgeEvent.safeParse(json)
    if (event.success) tell(event.data)
  }

  return {
    request: <Name extends MethodName>(
      method: Name,
      ...params: [params?: MethodParams<Name>]
    ) =>
      new Promise<MethodResult<Name>>((resolve, reject) => {
        const id = nextId++
        pending.set(id, (response) => {
          const failed = failure(response)
          if (failed) {
            reject(failed)
            return
          }
          const result = methods[method].result.safeParse(response.result)
          if (result.success) {
            // SAFETY: the method's own result schema just parsed it.
            resolve(result.data as MethodResult<Name>)
            return
          }
          reject(
            new DesktopBridgeError(
              "failed",
              `The app answered ${method} with something this page can't read.`,
            ),
          )
        })
        transport.send(JSON.stringify({ id, method, params: params[0] ?? {} }))
      }),
    on: (event, listener) => {
      const set = listeners.get(event) ?? new Set()
      listeners.set(event, set)
      // SAFETY: `tell` parses an event's data with that event's schema
      // before it calls the event's listeners.
      const entry = listener as Listener<EventName>
      set.add(entry)
      return () => {
        set.delete(entry)
      }
    },
  }
}

let bridge: DesktopBridge | null | undefined

/**
 * The shell this page runs in, or null in a browser, and in a shell that
 * only speaks a protocol older than this page's. One connection per page:
 * every call returns the same one.
 */
export function connectDesktop(): DesktopBridge | null {
  if (bridge !== undefined) return bridge
  const transport = window.matineeDesktop
  bridge =
    transport && transport.protocol >= BRIDGE_PROTOCOL
      ? connect(transport)
      : null
  return bridge
}

/**
 * Whether the page runs in the desktop app at all, even one too old to
 * talk to, for telling the viewer to update it.
 */
export function inDesktopApp(): boolean {
  return window.matineeDesktop !== undefined
}
