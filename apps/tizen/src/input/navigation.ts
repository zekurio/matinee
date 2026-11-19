import { useEffect, useRef } from "preact/hooks"

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

type KeyPhase = "down" | "up"

/** Takes a key before anything else does. True when it used the key. */
export type KeyTap = (
  key: RemoteKey,
  phase: KeyPhase,
  event: KeyboardEvent,
) => boolean

const taps: KeyTap[] = []
const backs: (() => void)[] = []
const fallbacks: (() => void)[] = []

/**
 * Hears every key before the focused thing does, while `enabled`, as the
 * player does for the media keys. The newest one hears it first.
 */
export function useKeyTap(tap: KeyTap, enabled = true) {
  const latest = useRef(tap)
  latest.current = tap
  useEffect(() => {
    if (!enabled) return
    const entry: KeyTap = (key, phase, event) =>
      latest.current(key, phase, event)
    taps.push(entry)
    return () => {
      taps.splice(taps.lastIndexOf(entry), 1)
    }
  }, [enabled])
}

/** Takes Back while `enabled`, in place of whoever would have got it. */
export function useBack(onBack: () => void, enabled = true) {
  const latest = useRef(onBack)
  latest.current = onBack
  useEffect(() => {
    if (!enabled) return
    const entry = () => latest.current()
    backs.push(entry)
    return () => {
      backs.splice(backs.lastIndexOf(entry), 1)
    }
  }, [enabled])
}

/**
 * Puts focus back when nothing has it and a key is pressed, as after the
 * focused card left the page. The newest one is asked, while `enabled`.
 */
export function useRefocus(restore: () => void, enabled = true) {
  const latest = useRef(restore)
  latest.current = restore
  useEffect(() => {
    if (!enabled) return
    const entry = () => latest.current()
    fallbacks.push(entry)
    return () => {
      fallbacks.splice(fallbacks.lastIndexOf(entry), 1)
    }
  }, [enabled])
}

/** Asks whoever restores focus to do so now. */
export function refocus() {
  fallbacks.at(-1)?.()
}

/** Runs Back as the remote's key would. */
export function goBack() {
  backs.at(-1)?.()
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

function onSelectDown(event: KeyboardEvent) {
  if (event.repeat) return
  const target = focused()
  if (!target) return
  release()
  const press = {
    target,
    long: false,
    timer: window.setTimeout(() => {
      press.long = true
      askForMenu(target)
    }, LONG_PRESS_MS),
  }
  pressed = press
}

function onSelectUp() {
  const press = pressed
  release()
  // Focus moved on while the key was down, as when the press opened a page.
  if (!press || press.long || focused() !== press.target) return
  press.target.click()
}

function tapped(key: RemoteKey, phase: KeyPhase, event: KeyboardEvent) {
  for (let index = taps.length - 1; index >= 0; index -= 1) {
    if (taps[index]?.(key, phase, event)) return true
  }
  return false
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const key = remoteKey(event)
  if (!key) return
  event.preventDefault()
  if (!focused() && key !== "back") {
    refocus()
    return
  }
  if (isDirection(key)) moveFocus(key)
  else if (key === "select") onSelectDown(event)
  else if (key === "back") goBack()
  else if (key === "menu") {
    const target = focused()
    if (target) askForMenu(target)
  }
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
      if (key && tapped(key, "down", event)) {
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
      if (key && tapped(key, "up", event)) {
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
