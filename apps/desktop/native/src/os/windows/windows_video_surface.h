#pragma once

#include "player/video_output.h"

#include <QAbstractNativeEventFilter>
#include <QPointer>
#include <QtGui/qwindowdefs.h>

// The video under the page, on Windows: mpv presents in a window of its
// own through a Direct3D 11 swapchain, as it does standing alone, and that
// swapchain is what goes out as HDR10 while the display is in HDR mode.
//
// Everything stays inside the app's one window, which gets two child
// windows that fill it. At the bottom is the one mpv is given as `--wid`.
// mpv makes its own window inside that and keeps it at that size. Above it
// is one with an alpha channel that the page is moved into. Windows
// composes sibling windows in their order, so the video shows wherever
// the page is transparent.
//
// The page can't stay in the main window with mpv's window as a child of
// it. A child window draws over everything its parent draws. Qt presents a
// window that has an alpha channel through DirectComposition, and makes
// its target the one below the window's children (`CreateTargetForHwnd`
// with `topmost` false, in qrhid3d11.cpp), so mpv's window would cover the
// page.
//
// The other way to get the page above the video is a second top-level
// window, see-through and kept over the first. Two top-level windows move
// and resize one after the other, each with its own animation when one is
// minimized or maximized, and they show apart in Alt+Tab, in the taskbar's
// preview, and to a program that captures one window. Windows moves,
// hides, and captures a window's children with it, so here only their
// size has to follow.
class WindowsVideoSurface : public VideoOutput, public QAbstractNativeEventFilter {
  Q_OBJECT

public:
  // Whether this machine can show the video this way: an mpv with a
  // Direct3D 11 output, a Qt Quick that draws with Direct3D, and
  // DirectComposition. The reason is logged when it can't.
  static bool available(const MpvPlayer &player);

  WindowsVideoSurface(MpvPlayer *player, QQuickWindow *window);
  ~WindowsVideoSurface() override;

  // mpv makes and removes its window itself, by having a source or not.
  void setActive(bool) override {}

private:
  bool eventFilter(QObject *watched, QEvent *event) override;
  bool nativeEventFilter(const QByteArray &type, void *message, qintptr *result) override;
  void attach();
  void detach();
  void fitPage();
  void fitHost();
  void checkRenderer();

  MpvPlayer *m_player;
  QQuickWindow *m_window;
  // The window the page is in. It belongs to `m_window`, and goes with it.
  QPointer<QQuickWindow> m_page;
  // The main window's handle, and the window in it that mpv's goes in.
  // Both null while the main window has none.
  HWND m_frame = nullptr;
  HWND m_host = nullptr;
};
