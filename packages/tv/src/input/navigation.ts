import { onSettled } from "solid-js"

import { focused, focusOn, moveFocus } from "./focus"
import { isDirection, type RemoteKey, remoteKey } from "./keys"

/*
 * What the remote's keys do when nothing on screen takes them first. An
 * arrow moves focus. Select clicks what has focus as it comes up, or,
 * held, asks for its menu. Back goes to whoever asked for it last: an
 * open panel, the player's controls, a page, and at last the app itself.
 */

/** How long Select is held before it's a long press. */
const LONG_PRESS_MS = 500

export type KeyPhase = "down" | "up"

/**
 * A press's own facts, which a keyboard event and a game controller both
 * give: whether it's a held key repeating, and when it happened, on the
 * clock `performance.now()` reads.
 */
export type KeyPress = {
  repeat: boolean
  timeStamp: number
}

/** Takes a key before anything else does. True when it used the key. */
export type KeyTap = (
  key: RemoteKey,
  phase: KeyPhase,
  press: KeyPress,
) => boolean

function pressOf(event: KeyboardEvent): KeyPress {
  return { repeat: event.repeat, timeStamp: event.timeStamp }
}

const taps: KeyTap[] = []

type BackEntry = {
  onBack: () => void
  enabled: () => boolean
}

type RefocusEntry = {
  restore: () => void
  enabled: () => boolean
}

const backs: BackEntry[] = []
const fallbacks: RefocusEntry[] = []

/**
 * Hears every key before the focused thing does, while `enabled`, as the
 * player does for the media keys. The newest one hears it first.
 */
export function useKeyTap(tap: KeyTap, enabled: () => boolean = () => true) {
  const entry: KeyTap = (key, phase, press) =>
    enabled() ? tap(key, phase, press) : false
  onSettled(() => {
    taps.push(entry)
    return () => {
      taps.splice(taps.lastIndexOf(entry), 1)
    }
  })
}

/** Takes Back while `enabled`, in place of whoever would have got it. */
export function useBack(
  onBack: () => void,
  enabled: () => boolean = () => true,
) {
  const entry: BackEntry = { onBack, enabled }
  onSettled(() => {
    backs.push(entry)
    return () => {
      backs.splice(backs.lastIndexOf(entry), 1)
    }
  })
}

/**
 * Puts focus back when nothing has it and a key is pressed, as after the
 * focused card left the page. The newest one is asked, while `enabled`.
 */
export function useRefocus(
  restore: () => void,
  enabled: () => boolean = () => true,
) {
  const entry: RefocusEntry = { restore, enabled }
  onSettled(() => {
    fallbacks.push(entry)
    return () => {
      fallbacks.splice(fallbacks.lastIndexOf(entry), 1)
    }
  })
}

/** Asks the newest place taking it to restore focus now. */
export function refocus() {
  for (let index = fallbacks.length - 1; index >= 0; index -= 1) {
    const entry = fallbacks[index]
    if (!entry || !entry.enabled()) continue
    entry.restore()
    return
  }
}

/**
 * Runs Back as the remote's key would: the newest handler that's taking
 * it. A panel that's closed, or a page that's left, lets it pass to the
 * one under it.
 */
export function goBack() {
  for (let index = backs.length - 1; index >= 0; index -= 1) {
    const entry = backs[index]
    if (!entry || !entry.enabled()) continue
    entry.onBack()
    return
  }
}

let pressed: { target: HTMLElement; timer: number; long: boolean } | null = null

function release() {
  if (pressed) window.clearTimeout(pressed.timer)
  pressed = null
}

/** Asks `target` for its menu, as holding Select on it does. */
function askForMenu(target: HTMLElement) {
  target.dispatchEvent(new CustomEvent("longpress", { bubbles: true }))
}

function onSelectDown(press: KeyPress) {
  if (press.repeat) return
  const target = focused()
  if (!target) return
  release()
  const hold = {
    target,
    long: false,
    timer: window.setTimeout(() => {
      hold.long = true
      askForMenu(target)
    }, LONG_PRESS_MS),
  }
  pressed = hold
}

function onSelectUp() {
  const press = pressed
  release()
  // Focus moved on while the key was down, as when the press opened a page.
  if (!press || press.long || focused() !== press.target) return
  press.target.click()
}

function tapped(key: RemoteKey, phase: KeyPhase, press: KeyPress) {
  for (let index = taps.length - 1; index >= 0; index -= 1) {
    if (taps[index]?.(key, phase, press)) return true
  }
  return false
}

/** What a key does when no tap took it first, as a keyboard's keydown. */
function pressDown(key: RemoteKey, press: KeyPress) {
  if (!focused() && key !== "back") {
    refocus()
    return
  }
  if (isDirection(key)) moveFocus(key)
  else if (key === "select") onSelectDown(press)
  else if (key === "back") goBack()
  else if (key === "menu") {
    const target = focused()
    if (target) askForMenu(target)
  }
}

/**
 * Runs a key as the remote's would, for a source without a keyboard
 * event, like a game controller. `press.repeat` is a held key repeating.
 */
export function pressRemoteKey(
  key: RemoteKey,
  phase: KeyPhase,
  press: KeyPress,
) {
  if (tapped(key, phase, press)) return
  if (phase === "down") pressDown(key, press)
  else if (key === "select") onSelectUp()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const key = remoteKey(event)
  if (!key) return
  event.preventDefault()
  pressDown(key, pressOf(event))
}

function onKeyUp(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (remoteKey(event) === "select") {
    event.preventDefault()
    onSelectUp()
  }
}

/** Starts listening for the remote. Once, as the app starts. */
export function startNavigation() {
  // Before the focused thing hears the key, for whoever taps them.
  document.addEventListener(
    "keydown",
    (event) => {
      const key = remoteKey(event)
      if (key && tapped(key, "down", pressOf(event))) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    true,
  )
  document.addEventListener(
    "keyup",
    (event) => {
      const key = remoteKey(event)
      if (key && tapped(key, "up", pressOf(event))) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    true,
  )
  document.addEventListener("keydown", onKeyDown)
  document.addEventListener("keyup", onKeyUp)
  // A click focuses what it clicks, so the pointer and the arrows share
  // one focus: the arrows go on from where the pointer was.
  document.addEventListener("mousedown", (event) => {
    if (!(event.target instanceof Element)) return
    const leaf = event.target.closest<HTMLElement>("[data-f]")
    if (leaf) {
      // The browser would focus the click's target itself and scroll to it.
      event.preventDefault()
      focusOn(leaf)
    }
  })
}
