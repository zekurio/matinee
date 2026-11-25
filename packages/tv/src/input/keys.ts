/*
 * The remote's keys by what they do. A Samsung remote sends its own key
 * codes for Back and the media keys; a keyboard, as in a browser or
 * plugged into the TV, sends the usual ones.
 */

export type RemoteKey =
  | "left"
  | "right"
  | "up"
  | "down"
  | "select"
  | "back"
  | "play"
  | "pause"
  | "playPause"
  | "stop"
  | "rewind"
  | "fastForward"
  | "previous"
  | "next"
  | "captions"
  | "menu"

const BY_CODE = new Map<number, RemoteKey>([
  [37, "left"],
  [38, "up"],
  [39, "right"],
  [40, "down"],
  [13, "select"],
  // Samsung's Back; Escape in a browser.
  [10009, "back"],
  [27, "back"],
  [415, "play"],
  [19, "pause"],
  [10252, "playPause"],
  [413, "stop"],
  [412, "rewind"],
  [417, "fastForward"],
  [10232, "previous"],
  [10233, "next"],
  [10221, "captions"],
  // Info and Tools, which open what a long press of Select opens.
  [457, "menu"],
  [10135, "menu"],
  // A keyboard's context menu key.
  [93, "menu"],
])

/** A text field takes these itself while it's being typed in. */
const TYPING_KEYS = new Set<RemoteKey>(["left", "right"])

export type Direction = "left" | "right" | "up" | "down"

const DIRECTIONS = new Set<RemoteKey>(["left", "right", "up", "down"])

export function isDirection(key: RemoteKey): key is Direction {
  return DIRECTIONS.has(key)
}

/** The field a key press would type into, if focus is in one. */
function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement &&
    !target.readOnly &&
    target.type !== "button"
  )
}

/**
 * What a key press means to the app, or null for a key it leaves alone:
 * one it doesn't know, or one a text field needs for typing. Space plays
 * and pauses, as on the web, unless a field is typing it.
 */
export function remoteKey(event: KeyboardEvent): RemoteKey | null {
  const typing = typingIn(event.target)
  if (event.keyCode === 32) return typing ? null : "playPause"
  // Backspace goes back, as Escape does, where nothing is being typed.
  if (event.keyCode === 8) return typing ? null : "back"
  const key = BY_CODE.get(event.keyCode) ?? null
  if (key && typing && TYPING_KEYS.has(key)) return null
  return key
}
