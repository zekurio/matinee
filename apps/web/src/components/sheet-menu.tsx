import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"

/**
 * Below Tailwind's `sm`: phones, which get the tab bar and the bars at the
 * top of pages instead of the floating bar, and menus as sheets, where the
 * thumb is.
 */
export function usePhone() {
  return useMediaQuery("(width < 40rem)")
}
