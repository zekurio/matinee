# libmpv for the desktop app: nixpkgs' mpv with one patch, which lets mpv
# show its video as a subsurface of the app's own Wayland window, on the
# app's connection. mpv then presents through its own Vulkan swapchain, as
# in its own window, and that is what HDR needs. Without the patch the app
# still runs: it asks for the option, and draws through mpv's render API
# when mpv doesn't have it.
{ mpv-unwrapped }:

mpv-unwrapped.overrideAttrs (old: {
  patches = (old.patches or [ ]) ++ [ ./mpv-wayland-parent-surface.patch ];
})
