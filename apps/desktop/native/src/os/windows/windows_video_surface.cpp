#include "os/windows/windows_video_surface.h"

#include "player/mpv_player.h"

#include <QGuiApplication>
#include <QLoggingCategory>
#include <QPlatformSurfaceEvent>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSGRendererInterface>
#include <QtCore/qt_windows.h>

#include <mpv/client.h>

#include <dcomp.h>

Q_LOGGING_CATEGORY(lcSurface, "matinee.surface")

namespace {

const wchar_t hostClassName[] = L"MatineeVideoHost";

// The class of the window mpv's goes in. Black, which is what shows
// between mpv making its window and drawing its first frame.
bool registerHostClass() {
  static const ATOM atom = [] {
    WNDCLASSEXW description{};
    description.cbSize = sizeof(description);
    description.lpfnWndProc = DefWindowProcW;
    description.hInstance = GetModuleHandleW(nullptr);
    description.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    description.lpszClassName = hostClassName;
    return RegisterClassExW(&description);
  }();
  return atom != 0;
}

// Qt Quick draws with Direct3D 11 on Windows unless it's told otherwise,
// through one of these.
bool quickDrawsWithDirect3D() {
  const QByteArray quick = qgetenv("QT_QUICK_BACKEND");
  if (!quick.isEmpty() && quick != "rhi") return false;
  const QByteArray rhi = qgetenv("QSG_RHI_BACKEND").toLower();
  return rhi.isEmpty() || rhi.contains("d3d");
}

} // namespace

bool WindowsVideoSurface::available(const MpvPlayer &player) {
  // Only an mpv built with its Direct3D 11 output knows that output's
  // options. Nothing plays yet, so asking and waiting is safe.
  char *option = mpv_get_property_string(player.handle(), "option-info/d3d11-flip/name");
  if (!option) {
    qCWarning(lcSurface) << "This mpv has no Direct3D 11 output, so the video is drawn in"
                            " the window, without HDR";
    return false;
  }
  mpv_free(option);

  // Only Qt's Direct3D backends compose a window that has an alpha
  // channel with what is under it.
  if (!quickDrawsWithDirect3D()) {
    qCWarning(lcSurface) << "Qt Quick is set not to draw with Direct3D, so the video is"
                            " drawn in the window, without HDR";
    return false;
  }
  IDCompositionDevice *composition = nullptr;
  const HRESULT result = DCompositionCreateDevice(nullptr, IID_PPV_ARGS(&composition));
  if (FAILED(result)) {
    qCWarning(lcSurface).noquote()
        << "DirectComposition didn't start (" << qt_error_string(int(result))
        << "), so the video is drawn in the window, without HDR";
    return false;
  }
  composition->Release();
  return true;
}

WindowsVideoSurface::WindowsVideoSurface(MpvPlayer *player, QQuickWindow *window)
    : VideoOutput(nullptr), m_player(player), m_window(window),
      m_page(new QQuickWindow(window)) {
  // Cleared to nothing at all times: the web view covers the window and is
  // opaque itself unless a video shows. Set before the window is made,
  // this is also what gives it an alpha channel.
  m_page->setColor(Qt::transparent);
  const QList<QQuickItem *> items = window->contentItem()->childItems();
  for (QQuickItem *item : items) item->setParentItem(m_page->contentItem());
  fitPage();
  // Before it's shown: Qt makes the page's window right then if the main
  // window has one already, and this has to see that.
  m_page->installEventFilter(this);
  m_page->show();

  connect(window, &QWindow::widthChanged, this, &WindowsVideoSurface::fitPage);
  connect(window, &QWindow::heightChanged, this, &WindowsVideoSurface::fitPage);
  // Windows gives the keyboard to the main window when the app comes to
  // the front, and the page is what takes keys.
  connect(qGuiApp, &QGuiApplication::focusWindowChanged, this, [this](QWindow *focus) {
    if (focus == m_window && m_page) m_page->requestActivate();
  });
  // From the render thread, so this is told on the next turn of the main one.
  connect(m_page, &QQuickWindow::sceneGraphInitialized, this,
          &WindowsVideoSurface::checkRenderer);

  window->installEventFilter(this);
  qGuiApp->installNativeEventFilter(this);
  // For a window that has its handle already, once whoever made this
  // listens for what it finds.
  QMetaObject::invokeMethod(this, &WindowsVideoSurface::attach, Qt::QueuedConnection);
}

WindowsVideoSurface::~WindowsVideoSurface() {
  if (m_host) DestroyWindow(m_host);
}

bool WindowsVideoSurface::eventFilter(QObject *watched, QEvent *event) {
  // Qt makes the main window's handle when the window is first shown and
  // takes it away when the window goes.
  if (watched == m_window && event->type() == QEvent::PlatformSurface) {
    const auto *surface = static_cast<QPlatformSurfaceEvent *>(event);
    if (surface->surfaceEventType() == QPlatformSurfaceEvent::SurfaceCreated) attach();
    else detach();
  }
  // Qt makes a child window with an alpha channel a layered window. With
  // that style, Windows showed the page's window opaque black where it's
  // transparent once the main window had changed its size, as it does
  // for full screen, and the video was gone. DirectComposition puts the
  // page over what's under it already, which needs no such style. Qt only
  // sets it when it makes the window and when its opacity or flags
  // change, which the app never changes for this one.
  if (watched == m_page && event->type() == QEvent::PlatformSurface &&
      static_cast<QPlatformSurfaceEvent *>(event)->surfaceEventType() ==
          QPlatformSurfaceEvent::SurfaceCreated) {
    const HWND page = reinterpret_cast<HWND>(m_page->winId());
    SetWindowLongPtrW(page, GWL_EXSTYLE, GetWindowLongPtrW(page, GWL_EXSTYLE) & ~WS_EX_LAYERED);
  }
  return VideoOutput::eventFilter(watched, event);
}

bool WindowsVideoSurface::nativeEventFilter(const QByteArray &, void *message, qintptr *) {
  // The main window's size in its own pixels, which is what mpv's window
  // has to match. Qt's size for it is in scaled units and rounded.
  const auto *event = static_cast<const MSG *>(message);
  if (m_host && event->hwnd == m_frame && event->message == WM_SIZE) fitHost();
  return false;
}

void WindowsVideoSurface::attach() {
  if (m_host || !m_window->handle()) return;
  const HWND frame = reinterpret_cast<HWND>(m_window->winId());
  // Disabled, so the mouse never lands on it or on mpv's window. Without
  // WS_CLIPSIBLINGS, so Windows doesn't cut the page's window, which
  // covers all of it, out of what mpv presents.
  if (registerHostClass()) {
    m_host = CreateWindowExW(WS_EX_NOPARENTNOTIFY, hostClassName, L"",
                             WS_CHILD | WS_VISIBLE | WS_DISABLED | WS_CLIPCHILDREN, 0, 0, 0, 0,
                             frame, nullptr, GetModuleHandleW(nullptr), nullptr);
  }
  if (!m_host) {
    qCCritical(lcSurface).noquote()
        << "Couldn't make the window for mpv's picture:" << qt_error_string();
    return;
  }
  m_frame = frame;
  fitHost();
  m_player->setParentWindow(reinterpret_cast<quintptr>(m_host));
  qCDebug(lcSurface) << "The window has a place for mpv's under the page";
  Q_EMIT readyChanged(true);
}

void WindowsVideoSurface::detach() {
  if (!m_host) return;
  qCDebug(lcSurface) << "The window is going, and mpv's place in it";
  // Stops what plays: mpv with no window to go in would open one of its
  // own.
  Q_EMIT readyChanged(false);
  m_player->setParentWindow(0);
  // mpv's window goes with it. mpv expects that of a window it was given.
  DestroyWindow(m_host);
  m_host = nullptr;
  m_frame = nullptr;
}

void WindowsVideoSurface::fitPage() {
  if (m_page) m_page->setGeometry(QRect(QPoint(0, 0), m_window->size()));
}

void WindowsVideoSurface::fitHost() {
  RECT inside{};
  // Empty while the window is minimized, which is no size to give mpv.
  if (!GetClientRect(m_frame, &inside) || IsRectEmpty(&inside)) return;
  // To the bottom each time, under the page's window whenever Qt made it.
  SetWindowPos(m_host, HWND_BOTTOM, 0, 0, inside.right, inside.bottom, SWP_NOACTIVATE);
}

void WindowsVideoSurface::checkRenderer() {
  if (!m_page) return;
  const QSGRendererInterface::GraphicsApi api = m_page->rendererInterface()->graphicsApi();
  if (api == QSGRendererInterface::Direct3D11 || api == QSGRendererInterface::Direct3D12) {
    return;
  }
  qCCritical(lcSurface) << "Qt Quick doesn't draw the page with Direct3D, so the page hides"
                           " the video under it";
}
