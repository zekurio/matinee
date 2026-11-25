import {
  getThemeState,
  subscribeTheme,
  type ThemeState,
} from "@matinee/ui/lib/theme"
import { type Accessor, createSignal } from "solid-js"

const [themeState, setThemeState] = createSignal<ThemeState>(getThemeState())
subscribeTheme(() => setThemeState(getThemeState()))

/**
 * The live theme. `main.tsx` starts the theme engine; this only follows it,
 * with one listener for the whole app.
 */
export function useThemeState(): Accessor<ThemeState> {
  return themeState
}
