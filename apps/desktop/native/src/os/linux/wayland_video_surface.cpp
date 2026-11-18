#include "os/linux/wayland_video_surface.h"

#include "player/mpv_player.h"

#include <QLoggingCategory>
#include <QQuickWindow>
#include <qpa/qplatformwindow_p.h>

Q_LOGGING_CATEGORY(lcSurface, "matinee.surface")

using WaylandWindow = QNativeInterface::Private::QWaylandWindow;

WaylandVideoSurface::WaylandVideoSurface(MpvPlayer *player, QQuickWindow *window)
    : VideoOutput(nullptr), m_player(player), m_window(window) {
  connect(window, &QWindow::widthChanged, this, &WaylandVideoSurface::resized);
  connect(window, &QWindow::heightChanged, this, &WaylandVideoSurface::resized);
  // mpv puts its surface under the window's when it opens a source, and
  // the compositor acts on that when the window next commits, which it
  // only does when it draws.
  connect(player, &MpvPlayer::outputConfigured, window, &QQuickWindow::update);
  // The window's surface comes and goes with the window being shown. Its
  // native handle is only there once Qt has made the platform window.
  connect(window, &QWindow::visibleChanged, this, &WaylandVideoSurface::follow);
  // Once whoever made this listens for what it finds.
  QMetaObject::invokeMethod(this, &WaylandVideoSurface::follow, Qt::QueuedConnection);
}

void WaylandVideoSurface::follow() {
  auto *wayland = m_window->nativeInterface<WaylandWindow>();
  if (!wayland) return;
  // Unique, so asking again each time the window is shown connects once.
  connect(wayland, &WaylandWindow::surfaceCreated, this, &WaylandVideoSurface::follow,
          Qt::UniqueConnection);
  connect(wayland, &WaylandWindow::surfaceDestroyed, this, &WaylandVideoSurface::follow,
          Qt::UniqueConnection);

  wl_surface *surface = wayland->surface();
  m_player->setParentSurface(reinterpret_cast<quintptr>(surface), m_window->size());
  const bool ready = surface != nullptr;
  if (ready == m_ready) return;
  m_ready = ready;
  qCDebug(lcSurface) << (ready ? "The window has a surface for the video to go under"
                               : "The window's surface is gone");
  Q_EMIT readyChanged(ready);
}

void WaylandVideoSurface::resized() {
  if (m_ready) m_player->setOutputSize(m_window->size());
}
