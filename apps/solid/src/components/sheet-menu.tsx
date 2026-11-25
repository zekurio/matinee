import { isPhone } from "@/lib/viewport"

/**
 * Below Tailwind's `sm`: phones, which get the shell's phone frame and
 * menus as sheets, where the thumb is. An accessor; `isPhone` from
 * `@/lib/viewport` is the same one.
 */
export function usePhone(): () => boolean {
  return isPhone
}
