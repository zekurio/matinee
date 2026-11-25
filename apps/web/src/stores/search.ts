import { createSignal } from "solid-js"

// The pause in typing before a search goes out.
const DEBOUNCE_MS = 180

/*
 * The top bar's search. There is one, so one store. The text outlives a
 * closed list, so coming back to it brings the last search back; the shell
 * resets it when it unmounts, so the next sign-in starts empty.
 */

const [searchText, setText] = createSignal("")
/** The text once it has held still for a moment; what gets searched. */
const [searchSettled, setSettled] = createSignal("")
/**
 * A request for the desktop field to take focus, with the text at the time
 * so the field needn't read the text again when it handles it.
 */
const [searchFocus, setFocus] = createSignal(
  { ticket: 0, text: "" },
  { equals: (before, after) => before.ticket === after.ticket },
)

let timer: ReturnType<typeof setTimeout> | undefined

function setSearchText(text: string) {
  setText(text)
  clearTimeout(timer)
  timer = setTimeout(() => setSettled(text.trim()), DEBOUNCE_MS)
}

/** Empties the field and whatever was searched. */
function clearSearch() {
  setSearchText("")
}

/** Asks the desktop field to take focus, and its results to open. */
function focusSearch() {
  setFocus((current) => ({ ticket: current.ticket + 1, text: searchText() }))
}

function resetSearch() {
  clearTimeout(timer)
  setText("")
  setSettled("")
  setFocus({ ticket: 0, text: "" })
}

export {
  clearSearch,
  focusSearch,
  resetSearch,
  searchFocus,
  searchSettled,
  searchText,
  setSearchText,
}
