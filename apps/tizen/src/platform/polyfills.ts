/*
 * What the oldest TVs' engines lack that the build's own polyfills (see
 * vite.config.ts) don't bring, since those cover the language, not the
 * browser. Imported before everything else.
 */

/**
 * The API client's library declares a class on top of TransformStream as
 * it loads, which engines before Chromium 67 don't have, so without a
 * stand-in the whole app would stop there. Only a streamed answer would
 * use the class, and the app reads the one stream it follows itself (see
 * api/events.ts), so the stand-in never runs.
 */
function MissingTransformStream() {
  throw new Error("This engine has no TransformStream")
}

if (!("TransformStream" in window)) {
  Object.defineProperty(window, "TransformStream", {
    value: MissingTransformStream,
    configurable: true,
    writable: true,
  })
}
