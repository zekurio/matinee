import { connectDesktop, inDesktopApp } from "@matinee/desktop-bridge"

/*
 * The desktop app's shell, for the page it shows. The shell is there from
 * before the first script runs to the page's end, so this is decided once.
 * Nothing else calls `connectDesktop()`.
 */

/**
 * The shell this page runs in, or null in a browser and in a shell too old
 * to talk to. With one, mpv plays the video under the page.
 */
export const desktop = connectDesktop()

/**
 * The page runs in the desktop app, but one that speaks an older protocol
 * than this page. It plays in the web view, as a browser does, and asks
 * the viewer to update the app.
 */
export const desktopOutdated = desktop === null && inDesktopApp()

/**
 * Tells the shell the session is gone, signed out here or found missing.
 * It forgets the token and shows its own sign-in in place of this page.
 */
export function leaveSignedOut() {
  void desktop?.request("shell.signedOut").catch(() => {})
}

/** Shows the app's list of servers, to open or sign in to another. */
export function showServers() {
  void desktop?.request("shell.showServers").catch(() => {})
}

/** Closes the app. */
export function quitApp() {
  void desktop?.request("app.quit").catch(() => {})
}
