#pragma once

#include "player/video_output.h"

#include <memory>

// The video under the window, on macOS: mpv puts a view of its own, with
// a Metal layer it presents on through Vulkan, into a view this makes
// under the window's content. Qt draws the window's content with Metal
// into a layer with an alpha channel, so the system shows the video
// wherever the page is transparent, and mixes the two even when the
// video is HDR and the page isn't.
//
// Qt's view is the window's content view, and a view can't show under its
// own content. So the view for the video sits beside it in the window's
// frame, below it, and follows its position and size.
class MacVideoView : public VideoOutput {
  Q_OBJECT

public:
  MacVideoView(MpvPlayer *player, QQuickWindow *window);
  ~MacVideoView() override;

  // mpv adds and removes its view itself, by having a source or not.
  void setActive(bool) override {}

private:
  struct Views;

  void follow();
  void close();

  MpvPlayer *m_player;
  QQuickWindow *m_window;
  std::unique_ptr<Views> m_views;
  bool m_ready = false;
  bool m_closed = false;
};
