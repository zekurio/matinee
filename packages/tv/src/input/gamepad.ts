import { platform } from "../platform/runtime"
import type { Direction, RemoteKey } from "./keys"
import { pressRemoteKey, type KeyPhase, type KeyPress } from "./navigation"

/*
 * A game controller for the TV UI in a browser: its D-pad and left stick
 * move focus as the remote's arrows do, A selects, B goes back, and the
 * rest reach the player as the remote's media keys do. A TV's own remote
 * needs none of this, so only the browser host starts it.
 *
 * The mapping and the repeat timing are plain, so they can be checked
 * without a pad; `startGamepads` is the part that reads them.
 */

/** How far the left stick moves before it means a direction. */
export const GAMEPAD_DEADZONE = 0.5
/** How long a held arrow waits before it repeats, and between repeats. */
export const GAMEPAD_REPEAT_DELAY_MS = 400
export const GAMEPAD_REPEAT_MS = 100

/** The buttons and axes of one pad, as a frame of its state. */
export type GamepadFrame = {
  /** Whether each button is pressed, by the standard mapping's index. */
  buttons: readonly boolean[]
  /** The sticks' positions, the left stick at 0 and 1. */
  axes: readonly number[]
}

/** A key to send, and whether it went down or up. */
export type GamepadAction = {
  key: RemoteKey
  phase: KeyPhase
  press: KeyPress
}

/** The directions a frame holds: the D-pad, and the left stick past its deadzone. */
export function heldDirections(frame: GamepadFrame): Set<Direction> {
  const directions = new Set<Direction>()
  const pressed = (index: number) => frame.buttons[index] === true
  if (pressed(12)) directions.add("up")
  if (pressed(13)) directions.add("down")
  if (pressed(14)) directions.add("left")
  if (pressed(15)) directions.add("right")
  const x = frame.axes[0] ?? 0
  const y = frame.axes[1] ?? 0
  if (x <= -GAMEPAD_DEADZONE) directions.add("left")
  else if (x >= GAMEPAD_DEADZONE) directions.add("right")
  if (y <= -GAMEPAD_DEADZONE) directions.add("up")
  else if (y >= GAMEPAD_DEADZONE) directions.add("down")
  return directions
}

/**
 * What a button means, by the standard mapping's index. `start` stands for
 * button 9, which plays and pauses on the player and opens the focused
 * item's menu elsewhere, where no player has it.
 */
export function buttonKey(button: number, start: RemoteKey): RemoteKey | null {
  switch (button) {
    case 0:
      return "select"
    case 1:
      return "back"
    case 3:
      return "menu"
    // The shoulders seek, and the triggers skip between episodes.
    case 4:
      return "rewind"
    case 5:
      return "fastForward"
    case 6:
      return "previous"
    case 7:
      return "next"
    case 8:
      return "back"
    case 9:
      return start
    default:
      return null
  }
}

/** When a held arrow presses again: after a pause, then every interval. */
class Hold {
  private nextAt: number

  constructor(at: number) {
    this.nextAt = at + GAMEPAD_REPEAT_DELAY_MS
  }

  /** Whether a press is due at `now`, and plans the next one. */
  due(now: number): boolean {
    if (now < this.nextAt) return false
    this.nextAt = now + GAMEPAD_REPEAT_MS
    return true
  }
}

function action(
  key: RemoteKey,
  phase: KeyPhase,
  repeat: boolean,
  timeStamp: number,
): GamepadAction {
  return { key, phase, press: { repeat, timeStamp } }
}

/** Turns a pad's frames into the keys it sends, one frame at a time. */
export class GamepadInput {
  private readonly held = new Map<Direction, Hold>()
  private readonly buttons = new Map<number, RemoteKey>()

  /** The keys a frame sends: a direction at once and again as it's held, a button as it changes. */
  update(now: number, frame: GamepadFrame, start: RemoteKey): GamepadAction[] {
    const actions: GamepadAction[] = []
    const directions = heldDirections(frame)
    for (const direction of this.held.keys()) {
      if (directions.has(direction)) continue
      actions.push(action(direction, "up", false, now))
      this.held.delete(direction)
    }
    for (const direction of directions) {
      const hold = this.held.get(direction)
      if (!hold) {
        this.held.set(direction, new Hold(now))
        actions.push(action(direction, "down", false, now))
      } else if (hold.due(now)) {
        actions.push(action(direction, "down", true, now))
      }
    }
    for (let index = 0; index < frame.buttons.length; index += 1) {
      const down = frame.buttons[index] === true
      const held = this.buttons.get(index)
      if (down && held === undefined) {
        const key = buttonKey(index, start)
        if (key) {
          this.buttons.set(index, key)
          actions.push(action(key, "down", false, now))
        }
      } else if (!down && held !== undefined) {
        this.buttons.delete(index)
        actions.push(action(held, "up", false, now))
      }
    }
    return actions
  }

  /** Releases everything held, as when the pad goes away. */
  reset(now = 0): GamepadAction[] {
    const actions: GamepadAction[] = []
    for (const direction of this.held.keys()) {
      actions.push(action(direction, "up", false, now))
    }
    this.held.clear()
    for (const key of this.buttons.values()) {
      actions.push(action(key, "up", false, now))
    }
    this.buttons.clear()
    return actions
  }
}

/**
 * The pads the browser lists as connected, by the standard mapping this
 * file reads. A pad with a mapping of its own is left alone.
 */
function connectedPads(): Gamepad[] {
  const pads: Gamepad[] = []
  for (const pad of navigator.getGamepads()) {
    if (pad?.connected && pad.mapping === "standard") pads.push(pad)
  }
  return pads
}

function send(actions: readonly GamepadAction[]) {
  for (const entry of actions) {
    pressRemoteKey(entry.key, entry.phase, entry.press)
  }
}

/**
 * Starts reading the pads a browser has. It polls only while one is
 * connected and the page is on screen, since a pad has no events of its
 * own for its buttons. `start` says what button 9 means where the app is.
 * Returns the function that stops it again.
 */
export function startGamepads(start: () => RemoteKey): () => void {
  // A TV's remote is its controller; a gamepad is the browser's.
  if (platform().onTv) return () => {}
  const inputs = new Map<number, GamepadInput>()
  let request = 0

  const stop = () => {
    if (request !== 0) cancelAnimationFrame(request)
    request = 0
    for (const input of inputs.values()) send(input.reset())
    inputs.clear()
  }

  const poll = (now: number) => {
    const pads = connectedPads()
    if (pads.length === 0 || document.visibilityState !== "visible") {
      stop()
      return
    }
    request = requestAnimationFrame(poll)
    const seen = new Set<number>()
    const key = start()
    for (const pad of pads) {
      seen.add(pad.index)
      let input = inputs.get(pad.index)
      if (!input) {
        input = new GamepadInput()
        inputs.set(pad.index, input)
      }
      send(
        input.update(
          now,
          {
            axes: pad.axes,
            buttons: pad.buttons.map((button) => button.pressed),
          },
          key,
        ),
      )
    }
    // A pad that went without saying so, as one that fell asleep.
    for (const [index, input] of inputs) {
      if (seen.has(index)) continue
      send(input.reset())
      inputs.delete(index)
    }
  }

  const begin = () => {
    if (request !== 0) return
    if (document.visibilityState !== "visible") return
    if (connectedPads().length === 0) return
    request = requestAnimationFrame(poll)
  }

  const onConnected = () => begin()
  const onDisconnected = () => {
    if (connectedPads().length === 0) stop()
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") begin()
    else stop()
  }

  window.addEventListener("gamepadconnected", onConnected)
  window.addEventListener("gamepaddisconnected", onDisconnected)
  document.addEventListener("visibilitychange", onVisibility)
  begin()

  return () => {
    window.removeEventListener("gamepadconnected", onConnected)
    window.removeEventListener("gamepaddisconnected", onDisconnected)
    document.removeEventListener("visibilitychange", onVisibility)
    stop()
  }
}
