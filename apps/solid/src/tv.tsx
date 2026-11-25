import "@matinee/tv/styles"
import { browserPlatform, mountTv } from "@matinee/tv"

/*
 * The TV UI in a browser, the same screens the Samsung package runs, with
 * the browser's video element and the page's own origin as the server.
 * A separate document from the desktop app, so its root sizes and theme
 * don't follow the TV's.
 */
const root = document.getElementById("app")
if (root) mountTv(root, browserPlatform)
