import {
  getThemeState,
  subscribeTheme,
  type ThemeState,
} from "@matinee/ui/lib/theme"
import { useSyncExternalStore } from "react"

/** The live theme, re-rendering whenever it changes. */
export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribeTheme, getThemeState, getThemeState)
}
