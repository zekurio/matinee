#include "os/macos/mac_video_view.h"

#include "player/mpv_player.h"

#include <QCoreApplication>
#include <QDeadlineTimer>
#include <QLoggingCategory>
#include <QQuickWindow>

#import <AppKit/AppKit.h>

#include <memory>

Q_LOGGING_CATEGORY(lcView, "matinee.view")

namespace {

// How long quitting waits for mpv to close its video output.
constexpr int closeTimeoutMs = 3000;

} // namespace

struct MacVideoView::Views {
  // What mpv puts its view into.
  NSView *host = nil;
  // Qt's view for the window, which the host follows.
  __weak NSView *content = nil;
  id frameObserver = nil;
};

MacVideoView::MacVideoView(MpvPlayer *player, QQuickWindow *window)
    : VideoOutput(nullptr), m_player(player), m_window(window),
      m_views(std::make_unique<Views>()) {
  m_views->host = [[NSView alloc] initWithFrame:NSZeroRect];
  // Qt makes its view when the window is first shown, and takes it away
  // when the window closes.
  connect(window, &QWindow::visibleChanged, this, &MacVideoView::follow);
  connect(qApp, &QCoreApplication::aboutToQuit, this, &MacVideoView::close);
  // Once whoever made this listens for what it finds.
  QMetaObject::invokeMethod(this, &MacVideoView::follow, Qt::QueuedConnection);
}

MacVideoView::~MacVideoView() {
  if (m_views->frameObserver) {
    [NSNotificationCenter.defaultCenter removeObserver:m_views->frameObserver];
  }
  [m_views->host removeFromSuperview];
}

void MacVideoView::follow() {
  if (m_closed) return;
  Views &views = *m_views;
  // A window's id is its view, which is the content view of the system's
  // window. Asking for the id of a window that has none would make one.
  NSView *content = m_window->handle()
                        ? (__bridge NSView *)reinterpret_cast<void *>(m_window->winId())
                        : nil;
  if (content != views.content) {
    if (views.frameObserver) {
      [NSNotificationCenter.defaultCenter removeObserver:views.frameObserver];
      views.frameObserver = nil;
    }
    views.content = content;
    if (content) {
      NSView *host = views.host;
      __weak NSView *followed = content;
      views.frameObserver =
          [NSNotificationCenter.defaultCenter addObserverForName:NSViewFrameDidChangeNotification
                                                          object:content
                                                           queue:nil
                                                      usingBlock:^(NSNotification *) {
                                                        NSView *moved = followed;
                                                        if (moved) host.frame = moved.frame;
                                                      }];
    }
  }

  // The frame view of the system's window, which holds the content view.
  // The video's view goes into it too, right below.
  NSView *frame = content.superview;
  if (frame) {
    [frame addSubview:views.host positioned:NSWindowBelow relativeTo:content];
    views.host.frame = content.frame;
  } else {
    [views.host removeFromSuperview];
  }

  const bool ready = frame != nil;
  if (ready == m_ready) return;
  m_ready = ready;
  qCDebug(lcView) << (ready ? "The window has a view for the video to go into"
                            : "The window's view is gone");
  m_player->setParentView(ready ? reinterpret_cast<quintptr>((__bridge void *)views.host) : 0);
  Q_EMIT readyChanged(ready);
}

// mpv takes its view out on the main thread and waits for that, and ending
// mpv waits for mpv. So mpv closes its video output here, before the app
// ends it, while the main thread can still answer.
void MacVideoView::close() {
  if (m_closed) return;
  m_closed = true;
  if (m_ready) {
    m_ready = false;
    Q_EMIT readyChanged(false);
  }
  const auto stopped = std::make_shared<bool>(false);
  m_player->stop([stopped] { *stopped = true; });
  const QDeadlineTimer deadline(closeTimeoutMs);
  // mpv's view is in the host for as long as mpv has a video output.
  while (!*stopped || m_views->host.subviews.count > 0) {
    if (deadline.hasExpired()) {
      qCWarning(lcView) << "mpv didn't close its video output; quitting may hang";
      break;
    }
    QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.005, true);
  }
  m_player->setParentView(0);
}
