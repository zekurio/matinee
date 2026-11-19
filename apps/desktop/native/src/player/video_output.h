#pragma once

#include <QObject>

class MpvPlayer;
class QQuickWindow;

// Where mpv's picture goes in the window. There are two ways, and which
// one a system gets is decided once, before the window exists.
//
// Under the window: mpv presents on a surface of its own beneath the
// window's, through its own swapchain, exactly as in a window of its own.
// That is the only way the picture reaches the display as HDR, and needs
// the window to be see-through where the video shows. Wayland has it,
// with an mpv that takes a parent surface, and macOS, with one that takes
// a parent layer. Windows has it one level down: mpv's window is inside
// the app's, under a window of the page's own.
//
// In the window: mpv draws into the window's own framebuffer through its
// render API, before Qt draws the page over it. It works everywhere and
// is limited to what an OpenGL window shows, which is SDR.
class VideoOutput : public QObject {
  Q_OBJECT

public:
  // Whether this system shows the video under the window. Asked before
  // the window is made, since such a window needs an alpha channel.
  static bool underWindow(const MpvPlayer &player);

  // Whether the video then shows through the app's window itself, which
  // is the window that needs the alpha channel. Not where the page gets a
  // window of its own over the video.
  static bool showsThroughWindow();

  // The output for `window`, of the kind `underWindow` said.
  static VideoOutput *create(MpvPlayer *player, QQuickWindow *window);

  // Whether there is a picture to show.
  virtual void setActive(bool active) = 0;

Q_SIGNALS:
  // mpv has somewhere to put a picture, or lost it. A source opened
  // before that would play without one.
  void readyChanged(bool ready);

protected:
  using QObject::QObject;
};
