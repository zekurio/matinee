#pragma once

#include "player/video_output.h"

// The video under the window, on Wayland: mpv makes its surface a
// subsurface of the window's, below it, and presents there through
// Vulkan as it would in a window of its own. The compositor puts the
// window's surface over it, so the video shows wherever the window is
// transparent, and it mixes the two even when one is HDR and the other
// isn't.
//
// mpv needs the window's `wl_surface` for that, and its size, since a
// subsurface isn't told one. Qt makes that surface when the window is
// shown and may make another later, so this follows it.
class WaylandVideoSurface : public VideoOutput {
  Q_OBJECT

public:
  WaylandVideoSurface(MpvPlayer *player, QQuickWindow *window);

  // mpv shows and hides its surface itself, by having a source or not.
  void setActive(bool) override {}

private:
  void follow();
  void resized();

  MpvPlayer *m_player;
  QQuickWindow *m_window;
  bool m_ready = false;
};
