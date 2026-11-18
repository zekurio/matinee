# Patches to mpv

The desktop app shows its video on a surface of mpv's own under the app's
window, which is what HDR needs (see
[The window](../README.md#the-window)). mpv only presents in a window it
made itself, so each system that works this way needs mpv to learn to go
under another window. These are the patches that teach it, against the
mpv release nixpkgs has.

| Patch                          | What it adds                                     |
| ------------------------------ | ------------------------------------------------ |
| `wayland-parent-surface.patch` | `--wayland-parent-surface`, a subsurface of ours |
| `macos-parent-layer.patch`     | `--macos-parent-layer`, a layer inside ours      |

`nix/mpv.nix` builds libmpv with the Wayland one for the flake, and
`tools/ci/mpv-macos.mjs` with the macOS one for the app the macOS
workflow packages. The app asks mpv whether it has the option, and draws
the video in the window when it doesn't, so it also runs with a stock
libmpv.

To change one, check out mpv at the release's tag, apply the patch, edit,
and write `git diff` back over it.
