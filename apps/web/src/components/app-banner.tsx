import { buttonVariants } from "@matinee/ui/components/button"
import { MonitorUpIcon, SmartphoneIcon, XIcon } from "lucide-react"

import { tr } from "@/i18n"
import { desktopOutdated } from "@/lib/desktop"
import { useAppBannerStore } from "@/stores/app-banner"

/** Where the signed APKs are, see `apps/android/README.md`. */
const APP_DOWNLOAD_URL = "https://github.com/zekurio/matinee/releases/latest"

/** The native app is for Android, so only its browsers hear of it. */
function onAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

const dismissClass =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [&_svg]:size-4"

/**
 * Tells someone on an Android phone's browser that there is an app, over
 * the tab bar until they close it. The phone layout of the web app gets
 * no new features; the app is where a phone watches. In a desktop app too
 * old for this page, it asks for an update instead.
 */
export function AppBanner() {
  const dismissed = useAppBannerStore((state) => state.dismissed)
  const dismiss = useAppBannerStore((state) => state.dismiss)
  if (desktopOutdated) return <DesktopUpdateBanner />
  if (dismissed || !onAndroid()) return null
  return (
    <aside
      aria-label={tr("shell.appBanner.title")}
      className="border-foreground/[0.08] bg-popover/85 fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex items-center gap-3 rounded-2xl border py-2 pr-2 pl-3.5 shadow-[0_10px_32px_-6px_rgb(0_0_0/0.55)] backdrop-blur-xl backdrop-saturate-150 sm:hidden"
    >
      <SmartphoneIcon
        aria-hidden
        className="text-muted-foreground size-5 shrink-0"
      />
      <p className="min-w-0 flex-1 text-sm leading-5">
        <span className="block font-medium">{tr("shell.appBanner.title")}</span>
        <span className="text-muted-foreground block">
          {tr("shell.appBanner.text")}
        </span>
      </p>
      <a
        href={APP_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ size: "sm" })}
      >
        {tr("shell.appBanner.get")}
      </a>
      <button
        type="button"
        aria-label={tr("shell.appBanner.dismiss")}
        onClick={dismiss}
        className={dismissClass}
      >
        <XIcon />
      </button>
    </aside>
  )
}

/**
 * The desktop app speaks an older protocol than this page, so the video
 * plays in the web view. Over the tab bar on a narrow window, in the
 * corner on a wide one, until closed for this start of the app.
 */
function DesktopUpdateBanner() {
  const dismissed = useAppBannerStore((state) => state.updateDismissed)
  const dismiss = useAppBannerStore((state) => state.dismissUpdate)
  if (dismissed) return null
  return (
    <aside
      aria-label={tr("desktop.update.title")}
      className="border-foreground/[0.08] bg-popover/85 fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex items-center gap-3 rounded-2xl border py-2 pr-2 pl-3.5 shadow-[0_10px_32px_-6px_rgb(0_0_0/0.55)] backdrop-blur-xl backdrop-saturate-150 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-sm"
    >
      <MonitorUpIcon
        aria-hidden
        className="text-muted-foreground size-5 shrink-0"
      />
      <p className="min-w-0 flex-1 text-sm leading-5">
        <span className="block font-medium">{tr("desktop.update.title")}</span>
        <span className="text-muted-foreground block">
          {tr("desktop.update.text")}
        </span>
      </p>
      <a
        href={APP_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ size: "sm" })}
      >
        {tr("shell.appBanner.get")}
      </a>
      <button
        type="button"
        aria-label={tr("desktop.update.dismiss")}
        onClick={dismiss}
        className={dismissClass}
      >
        <XIcon />
      </button>
    </aside>
  )
}
