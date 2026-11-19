#include "os/linux/wayland_video_surface.h"
#include "player/mpv_player.h"
#include "player/mpv_renderer.h"
#include "player/video_output.h"


// Under the window with an mpv that takes a parent surface, which the
// flake's is. In the window with one that doesn't.

bool VideoOutput::underWindow(const MpvPlayer &player) {
  return player.takesParentSurface();
}

// The video is under the window's own surface.
bool VideoOutput::showsThroughWindow() { return true; }

VideoOutput *VideoOutput::create(MpvPlayer *player, QQuickWindow *window) {
  if (underWindow(*player)) return new WaylandVideoSurface(player, window);
  return new MpvRenderer(player->handle(), window);
}
