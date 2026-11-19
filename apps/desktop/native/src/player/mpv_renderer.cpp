#include "player/mpv_renderer.h"

#include <QGuiApplication>
#include <QLoggingCategory>
#include <QOpenGLContext>
#include <QOpenGLFunctions>
#include <QQuickWindow>
#include <QTimer>

#include <mpv/client.h>
#include <mpv/render_gl.h>

Q_LOGGING_CATEGORY(lcRender, "matinee.render")

namespace {

constexpr int logIntervalMs = 2000;

void *procAddress(void *, const char *name) {
  const QOpenGLContext *context = QOpenGLContext::currentContext();
  return context ? reinterpret_cast<void *>(context->getProcAddress(name)) : nullptr;
}

} // namespace

MpvRenderer::MpvRenderer(mpv_handle *mpv, QQuickWindow *window)
    : VideoOutput(nullptr), m_mpv(mpv), m_window(window) {
#if QT_CONFIG(wayland)
  if (const auto *wayland =
          qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>()) {
    m_waylandDisplay = wayland->display();
  }
#endif

  // Direct connections: these signals come from the render thread, and
  // the slots have to run there, with the OpenGL context current.
  connect(window, &QQuickWindow::beforeRenderPassRecording, this,
          &MpvRenderer::render, Qt::DirectConnection);
  connect(window, &QQuickWindow::frameSwapped, this, &MpvRenderer::swapped,
          Qt::DirectConnection);
  connect(window, &QQuickWindow::sceneGraphInvalidated, this, &MpvRenderer::release,
          Qt::DirectConnection);

  if (lcRender().isDebugEnabled()) {
    auto *timer = new QTimer(this);
    connect(timer, &QTimer::timeout, this, &MpvRenderer::logRates);
    timer->start(logIntervalMs);
    window->installEventFilter(this);
  }
}

MpvRenderer::~MpvRenderer() {
  // The window let go of its scene graph first, which freed the context
  // on the render thread. Freeing it here would be on the wrong thread.
  if (m_context) {
    qCWarning(lcRender) << "The window outlived its renderer; mpv's context leaks";
  }
}

void MpvRenderer::setActive(bool active) {
  if (m_active.exchange(active) != active) m_window->update();
}

bool MpvRenderer::create() {
  if (m_window->rendererInterface()->graphicsApi() != QSGRendererInterface::OpenGL) {
    qCCritical(lcRender) << "The window doesn't draw with OpenGL, so mpv has nowhere to draw";
    return false;
  }
  mpv_opengl_init_params gl{.get_proc_address = procAddress,
                            .get_proc_address_ctx = nullptr};
  // mpv decides when frames show and is told when they did, instead of
  // being asked for one whenever the window happens to draw.
  int advanced = 1;
  QList<mpv_render_param> params = {
      {MPV_RENDER_PARAM_API_TYPE, const_cast<char *>(MPV_RENDER_API_TYPE_OPENGL)},
      {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl},
      {MPV_RENDER_PARAM_ADVANCED_CONTROL, &advanced},
  };
  if (m_waylandDisplay) {
    params.append({MPV_RENDER_PARAM_WL_DISPLAY, m_waylandDisplay});
  }
  params.append({MPV_RENDER_PARAM_INVALID, nullptr});

  if (const int error = mpv_render_context_create(&m_context, m_mpv, params.data());
      error < 0) {
    qCCritical(lcRender) << "mpv couldn't draw into the window:" << mpv_error_string(error);
    m_context = nullptr;
    return false;
  }
  // mpv calls this from its own threads when there is a frame to show.
  mpv_render_context_set_update_callback(
      m_context,
      [](void *self) {
        auto *renderer = static_cast<MpvRenderer *>(self);
        renderer->m_asked.fetch_add(1, std::memory_order_relaxed);
        QMetaObject::invokeMethod(renderer->m_window, &QQuickWindow::update,
                                  Qt::QueuedConnection);
      },
      this);
  return true;
}

void MpvRenderer::render() {
  if (!m_context) {
    if (m_failed) return;
    if (!create()) {
      m_failed = true;
      return;
    }
    Q_EMIT readyChanged(true);
  }
  // Has to be called after every update callback, picture or not.
  mpv_render_context_update(m_context);
  if (!m_active.load(std::memory_order_relaxed)) return;

  m_window->beginExternalCommands();
  QOpenGLContext *context = QOpenGLContext::currentContext();
  QOpenGLFunctions *gl = context->functions();
  // The pass Qt just began targets the window, at the window's size in
  // device pixels.
  GLint viewport[4] = {0, 0, 0, 0};
  gl->glGetIntegerv(GL_VIEWPORT, viewport);
  // Qt leaves the context as its last draw had it, and mpv draws assuming
  // a fresh one. The depth test matters most: mpv draws at the far plane,
  // which fails it against a buffer Qt just cleared to there.
  gl->glDisable(GL_DEPTH_TEST);
  gl->glDisable(GL_STENCIL_TEST);
  gl->glDisable(GL_SCISSOR_TEST);
  gl->glDisable(GL_BLEND);
  gl->glDisable(GL_CULL_FACE);
  gl->glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  mpv_opengl_fbo target{.fbo = static_cast<int>(context->defaultFramebufferObject()),
                        .w = viewport[2],
                        .h = viewport[3],
                        .internal_format = 0};
  // A window's framebuffer has its first row at the bottom.
  int flip = 1;
  // Never wait for a frame's time here: that would hold up the page.
  int block = 0;
  mpv_render_param params[] = {
      {MPV_RENDER_PARAM_OPENGL_FBO, &target},
      {MPV_RENDER_PARAM_FLIP_Y, &flip},
      {MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, &block},
      {MPV_RENDER_PARAM_INVALID, nullptr},
  };
  mpv_render_context_render(m_context, params);
  m_window->endExternalCommands();
  m_drawn.fetch_add(1, std::memory_order_relaxed);
}

void MpvRenderer::logRates() {
  const int asked = m_asked.exchange(0);
  const int drawn = m_drawn.exchange(0);
  const int swapped = m_swapped.exchange(0);
  if (asked == 0 && drawn == 0) return;
  qCDebug(lcRender) << "In" << logIntervalMs / 1000 << "s mpv asked for" << asked
                    << "frames, the window drew" << drawn << "and showed" << swapped;
}

bool MpvRenderer::eventFilter(QObject *watched, QEvent *event) {
  if (event->type() == QEvent::Expose) {
    qCDebug(lcRender) << "The window is" << (m_window->isExposed() ? "shown" : "hidden");
  }
  return QObject::eventFilter(watched, event);
}

void MpvRenderer::swapped() {
  m_swapped.fetch_add(1, std::memory_order_relaxed);
  if (m_context) mpv_render_context_report_swap(m_context);
}

void MpvRenderer::release() {
  if (!m_context) return;
  mpv_render_context_set_update_callback(m_context, nullptr, nullptr);
  mpv_render_context_free(m_context);
  m_context = nullptr;
  Q_EMIT readyChanged(false);
}
