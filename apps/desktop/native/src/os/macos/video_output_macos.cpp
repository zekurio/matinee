#include "os/macos/mac_video_view.h"
#include "player/mpv_player.h"
#include "player/mpv_renderer.h"
#include "player/video_output.h"

// Under the window with an mpv that takes a parent view, which the app's
// own build of libmpv is. In the window with one that doesn't, like
// Homebrew's, or when MATINEE_VIDEO_IN_WINDOW is set, to compare the two.

bool VideoOutput::underWindow(const MpvPlayer &player) {
  return player.takesParentView() && !qEnvironmentVariableIsSet("MATINEE_VIDEO_IN_WINDOW");
}

VideoOutput *VideoOutput::create(MpvPlayer *player, QQuickWindow *window) {
  if (underWindow(*player)) return new MacVideoView(player, window);
  return new MpvRenderer(player->handle(), window);
}
