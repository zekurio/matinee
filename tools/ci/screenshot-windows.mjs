/*
 * Writes a picture of the whole screen to a PNG file, on Windows. What it
 * reads is the desktop as Windows composed it, so windows that present
 * through Direct3D or DirectComposition are in it as they show.
 *
 *   node tools/ci/screenshot-windows.mjs <file>
 */

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

import { fail } from "../release/lib.mjs"

const file = process.argv[2]
if (!file) fail("Usage: screenshot-windows.mjs <file>")

const script = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
$picture = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($picture)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$picture.Save($env:SCREENSHOT_FILE, [System.Drawing.Imaging.ImageFormat]::Png)
`

execFileSync(
  "powershell",
  ["-NoProfile", "-NonInteractive", "-Command", script],
  {
    env: { ...process.env, SCREENSHOT_FILE: resolve(file) },
    stdio: "inherit",
  },
)
