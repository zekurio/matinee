#include "os/macos/mac_video_layer.h"

#include "player/mpv_player.h"

#include <QCoreApplication>
#include <QDeadlineTimer>
#include <QLoggingCategory>
#include <QQuickWindow>

#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>

#include <memory>

Q_LOGGING_CATEGORY(lcLayer, "matinee.layer")

namespace {

// How long quitting waits for mpv to close its video output.
constexpr int closeTimeoutMs = 3000;

// Puts `host` right under the layer of `content`, in the layer that holds
// it, and over the same area. False while the system hasn't built the
// window's layers.
bool place(CALayer *host, NSView *content) {
  CALayer *over = content.layer;
  CALayer *holder = over.superlayer;
  if (!holder) {
    [host removeFromSuperlayer];
    return false;
  }
  NSArray<CALayer *> *layers = holder.sublayers;
  const NSUInteger above = [layers indexOfObjectIdenticalTo:over];
  const bool inPlace = host.superlayer == holder && above > 0 && layers[above - 1] == host;
  if (inPlace && CGRectEqualToRect(host.frame, over.frame)) return true;
  // At once. A layer's changes are animated otherwise, and the video
  // would trail the window while it's resized.
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  if (!inPlace) [holder insertSublayer:host below:over];
  host.frame = over.frame;
  [CATransaction commit];
  return true;
}

} // namespace

struct MacVideoLayer::Layers {
  // What mpv puts its layer into.
  CALayer *host = nil;
  // Qt's view for the window, which the host follows.
  __weak NSView *content = nil;
  id frameObserver = nil;
};

MacVideoLayer::MacVideoLayer(MpvPlayer *player, QQuickWindow *window)
    : VideoOutput(nullptr), m_player(player), m_window(window),
      m_layers(std::make_unique<Layers>()) {
  m_layers->host = [CALayer layer];
  // Qt makes its view when the window is first shown, and takes it away
  // when the window closes.
  connect(window, &QWindow::visibleChanged, this, &MacVideoLayer::follow);
  // The system builds the window's layers when the window first draws,
  // and they are the system's to arrange. So this looks again whenever
  // the window has drawn, from the main thread.
  connect(window, &QQuickWindow::frameSwapped, this, &MacVideoLayer::follow,
          Qt::QueuedConnection);
  connect(qApp, &QCoreApplication::aboutToQuit, this, &MacVideoLayer::close);
  // Once whoever made this listens for what it finds.
  QMetaObject::invokeMethod(this, &MacVideoLayer::follow, Qt::QueuedConnection);
}

MacVideoLayer::~MacVideoLayer() {
  if (m_layers->frameObserver) {
    [NSNotificationCenter.defaultCenter removeObserver:m_layers->frameObserver];
  }
  [m_layers->host removeFromSuperlayer];
}

void MacVideoLayer::follow() {
  if (m_closed) return;
  Layers &layers = *m_layers;
  // A window's id is its view, which is the content view of the system's
  // window. Asking for the id of a window that has none would make one.
  NSView *content = m_window->handle()
                        ? (__bridge NSView *)reinterpret_cast<void *>(m_window->winId())
                        : nil;
  if (content != layers.content) {
    if (layers.frameObserver) {
      [NSNotificationCenter.defaultCenter removeObserver:layers.frameObserver];
      layers.frameObserver = nil;
    }
    layers.content = content;
    if (content) {
      // Right when the view changes its size, without waiting for the
      // window to draw.
      layers.frameObserver =
          [NSNotificationCenter.defaultCenter addObserverForName:NSViewFrameDidChangeNotification
                                                          object:content
                                                           queue:nil
                                                      usingBlock:^(NSNotification *) {
                                                        follow();
                                                      }];
    }
  }

  const bool ready = content && place(layers.host, content);
  if (!content) [layers.host removeFromSuperlayer];
  if (ready == m_ready) return;
  m_ready = ready;
  qCDebug(lcLayer) << (ready ? "The window has a layer for the video to go into"
                             : "The window's layers are gone");
  m_player->setParentLayer(ready ? reinterpret_cast<quintptr>((__bridge void *)layers.host)
                                 : 0);
  Q_EMIT readyChanged(ready);
}

// mpv takes its layer out on the main thread and waits for that, and
// ending mpv waits for mpv. So mpv closes its video output here, before
// the app ends it, while the main thread can still answer.
void MacVideoLayer::close() {
  if (m_closed) return;
  m_closed = true;
  if (m_ready) {
    m_ready = false;
    Q_EMIT readyChanged(false);
  }
  const auto stopped = std::make_shared<bool>(false);
  m_player->stop([stopped] { *stopped = true; });
  const QDeadlineTimer deadline(closeTimeoutMs);
  // mpv's layer is in the host for as long as mpv has a video output.
  while (!*stopped || m_layers->host.sublayers.count > 0) {
    if (deadline.hasExpired()) {
      qCWarning(lcLayer) << "mpv didn't close its video output; quitting may hang";
      break;
    }
    QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.005, true);
  }
  m_player->setParentLayer(0);
}
