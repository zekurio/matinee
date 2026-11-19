// The page's end of the bridge, by hand: the test drives the shell with
// `smoke.call` and reads what mpv reports from `smoke.state`.
const transport = window.matineeDesktop
const waiting = new Map()
let nextId = 1

window.smoke = {
  /** mpv's state, as the patches the shell sent add up to. */
  state: {},
  /** Every event but mpv's state, in order. */
  events: [],
  /** Calls a method of the shell and resolves with its answer or its error. */
  call(method, params = {}) {
    return new Promise((resolve) => {
      const id = nextId++
      waiting.set(id, resolve)
      transport.send(JSON.stringify({ id, method, params }))
    })
  },
}

transport.receive = (text) => {
  const message = JSON.parse(text)
  if (message.id !== undefined) {
    waiting.get(message.id)?.(message)
    waiting.delete(message.id)
  } else if (message.event === "player.state") {
    Object.assign(window.smoke.state, message.data)
  } else {
    window.smoke.events.push(message)
  }
}
