import { t } from "@matinee/contracts/schema"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const Saved = t.object({ dismissed: t.boolean() })

type AppBannerState = {
  /** The person closed the banner on this device, so it stays away. */
  dismissed: boolean
  /**
   * The person closed the banner asking to update the desktop app. It
   * comes back with the next start, until the app is updated.
   */
  updateDismissed: boolean
  dismiss: () => void
  dismissUpdate: () => void
}

/**
 * Whether this browser still shows the banner for the Android app, and
 * whether an outdated desktop app still asks to be updated.
 */
export const useAppBannerStore = create<AppBannerState>()(
  persist(
    (set) => ({
      dismissed: false,
      updateDismissed: false,
      dismiss: () => set({ dismissed: true }),
      dismissUpdate: () => set({ updateDismissed: true }),
    }),
    {
      name: "matinee.app-banner",
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ dismissed }) => ({ dismissed }),
      merge: (stored, current) => {
        const parsed = Saved.safeParse(stored)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
    },
  ),
)
