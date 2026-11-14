import type { FulfilmentSource } from "../types"

/**
 * No backend. An approved request waits until an admin adds the file by
 * hand and the library scan finds it.
 */
export const manual = {
  id: "manual",
  name: "By hand",
  kinds: ["movie", "show"],
  needs: [],
  scope: "season",
  apiKey: false,
  settings: { parse: () => ({}) },
  parseOptions: () => ({}),
  fields: () => [],
  test: () => Promise.resolve(),
  options: () => Promise.resolve({ fields: [], values: {}, anime: {} }),
  submit: () => Promise.resolve({}),
} satisfies FulfilmentSource
