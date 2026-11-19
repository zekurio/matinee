#pragma once

#include "player/video_output.h"

#include <memory>

// The video under the window, on macOS: mpv puts a Metal layer of its
// own, which it presents on through Vulkan, into a layer this keeps under
// the window's content. Qt draws the window's content with Metal into a
// layer with an alpha channel, so the system shows the video wherever the
// page is transparent, and mixes the two even when the video is HDR and
// the page isn't.
//
// Qt's view is the window's content view, and nothing shows under a
// view's own content from inside it. So the layer for the video goes
// beside that view's layer, right below it, in the layer of the window's
// frame view. A view beside Qt's would do the same, but with one in its
// frame view macOS 26 lays the title bar out an old way, with the title
// over the buttons.
class MacVideoLayer : public VideoOutput {
  Q_OBJECT

public:
  MacVideoLayer(MpvPlayer *player, QQuickWindow *window);
  ~MacVideoLayer() override;

  // mpv adds and removes its layer itself, by having a source or not.
  void setActive(bool) override {}

private:
  struct Layers;

  void follow();
  void close();

  MpvPlayer *m_player;
  QQuickWindow *m_window;
  std::unique_ptr<Layers> m_layers;
  bool m_ready = false;
  bool m_closed = false;
};
