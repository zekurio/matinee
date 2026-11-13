import { t } from "@matinee/contracts/schema"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const Saved = t.object({ dismissed: t.boolean() })

type AppBannerState = {
  /** The person closed the banner on this device, so it stays away. */
  dismissed: boolean
  dismiss: () => void
}

/** Whether this browser still shows the banner for the Android app. */
export const useAppBannerStore = create<AppBannerState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
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
