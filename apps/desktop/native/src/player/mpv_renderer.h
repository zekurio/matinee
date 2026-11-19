#pragma once

#include "player/video_output.h"

#include <atomic>

class QQuickWindow;
struct mpv_handle;
struct mpv_render_context;

// The video in the window: draws mpv's picture into the window's own
// framebuffer, under the page.
//
// Qt Quick draws the window in passes: it clears the window, draws the
// scene, here the web view, and swaps. This draws mpv's frame right after
// the clear, so the web view blends over it, and the video shows wherever
// the page is transparent. Nothing is copied: mpv draws straight into the
// window's own framebuffer.
//
// It belongs to the main thread, and its `render`, `swapped`, and
// `release` run on Qt Quick's render thread, where the OpenGL context is.
class MpvRenderer : public VideoOutput {
  Q_OBJECT

public:
  MpvRenderer(mpv_handle *mpv, QQuickWindow *window);
  ~MpvRenderer() override;

  // Off, the window stays as Qt cleared it.
  void setActive(bool active) override;

private:
  void render();
  void swapped();
  void release();
  bool create();
  void logRates();
  bool eventFilter(QObject *watched, QEvent *event) override;

  mpv_handle *m_mpv;
  QQuickWindow *m_window;
  // The Wayland display the window is on, which mpv's hardware decoders
  // there need to hand frames over.
  void *m_waylandDisplay = nullptr;

  // Only the render thread touches these.
  mpv_render_context *m_context = nullptr;
  bool m_failed = false;

  std::atomic<bool> m_active = false;

  // For the verbose log: how often mpv asked for a frame and how often
  // the window drew one, since the last line about it.
  std::atomic<int> m_asked = 0;
  std::atomic<int> m_drawn = 0;
  std::atomic<int> m_swapped = 0;
};
