#include "player/mpv_player.h"
#include "player/mpv_renderer.h"
#include "player/video_output.h"

// Systems where mpv has no surface of its own under the window: the video
// is drawn in the window.

bool VideoOutput::underWindow(const MpvPlayer &) { return false; }

bool VideoOutput::showsThroughWindow() { return false; }

VideoOutput *VideoOutput::create(MpvPlayer *player, QQuickWindow *window) {
  return new MpvRenderer(player->handle(), window);
}
