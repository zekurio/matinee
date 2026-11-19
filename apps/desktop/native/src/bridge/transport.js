/* global QWebChannel, qt, matineeBridgeProtocol */

// What the shell runs in every page before the page's own scripts: it
// makes `window.matineeDesktop`, the BridgeTransport of
// packages/desktop-bridge/src/protocol.ts. The shell wraps this in a
// function with Qt's qwebchannel.js, which defines `QWebChannel`, and with
// `matineeBridgeProtocol`, the protocol's number, so neither is the
// page's to see.
;(() => {
  if (window.matineeDesktop || window.top !== window) return

  // Names this document, so an answer to the page before it, which
  // numbered its requests the same way, isn't taken for one of its own.
  const page = Math.random().toString(36).slice(2) + Date.now().toString(36)
  // Messages sent before the channel is up, which takes a moment.
  let waiting = []
  let bridge = null
  const transport = {
    protocol: matineeBridgeProtocol,
    send(message) {
      if (bridge) bridge.send(page, message)
      else waiting.push(message)
    },
    receive: null,
  }
  Object.defineProperty(window, "matineeDesktop", { value: transport })

  // oxlint-disable-next-line no-new -- Qt's channel is used through the callback its constructor takes.
  new QWebChannel(qt.webChannelTransport, (channel) => {
    bridge = channel.objects.bridge
    // An answer names the page that asked. An event names none.
    bridge.message.connect((target, message) => {
      if (target && target !== page) return
      transport.receive?.(message)
    })
    for (const message of waiting) bridge.send(page, message)
    waiting = []
  })
})()
