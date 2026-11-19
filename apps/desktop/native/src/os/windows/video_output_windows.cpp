#include "os/windows/windows_video_surface.h"
#include "player/mpv_player.h"
#include "player/mpv_renderer.h"
#include "player/video_output.h"

// Under the page wherever the machine can, which is any current Windows
// with the libmpv the app ships with. In the window otherwise.

bool VideoOutput::underWindow(const MpvPlayer &player) {
  static const bool available = WindowsVideoSurface::available(player);
  return available;
}

// The video is in a window inside the app's, and the page in another over
// it, so the app's window itself stays opaque.
bool VideoOutput::showsThroughWindow() { return false; }

VideoOutput *VideoOutput::create(MpvPlayer *player, QQuickWindow *window) {
  if (underWindow(*player)) return new WindowsVideoSurface(player, window);
  return new MpvRenderer(player->handle(), window);
}
