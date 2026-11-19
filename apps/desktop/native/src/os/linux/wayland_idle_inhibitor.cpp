#include "os/linux/wayland_idle_inhibitor.h"

#include <QGuiApplication>
#include <QWindow>
#include <qpa/qplatformnativeinterface.h>

#include <idle-inhibit-unstable-v1-client-protocol.h>
#include <wayland-client.h>

#include <cstring>

namespace {

void global(void *self, wl_registry *, uint32_t name, const char *interface, uint32_t) {
  static_cast<WaylandIdleInhibitor *>(self)->offered(name, interface);
}

void globalRemoved(void *, wl_registry *, uint32_t) {}

const wl_registry_listener registryListener = {global, globalRemoved};

} // namespace

WaylandIdleInhibitor::WaylandIdleInhibitor(QWindow *window) : m_window(window) {
  const auto *wayland = qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>();
  if (!wayland) return;
  m_display = wayland->display();
  m_queue = wl_display_create_queue(m_display);
  // A wrapper, so the registry made from it reports to this queue from
  // its first event, whichever thread reads the connection.
  auto *wrapped = static_cast<wl_display *>(wl_proxy_create_wrapper(m_display));
  wl_proxy_set_queue(reinterpret_cast<wl_proxy *>(wrapped), m_queue);
  m_registry = wl_display_get_registry(wrapped);
  wl_proxy_wrapper_destroy(wrapped);
  wl_registry_add_listener(m_registry, &registryListener, this);
  wl_display_roundtrip_queue(m_display, m_queue);
}

WaylandIdleInhibitor::~WaylandIdleInhibitor() {
  setActive(false);
  if (m_manager) zwp_idle_inhibit_manager_v1_destroy(m_manager);
  if (m_registry) wl_registry_destroy(m_registry);
  if (m_queue) wl_event_queue_destroy(m_queue);
}

void WaylandIdleInhibitor::offered(unsigned name, const char *interface) {
  if (m_manager || std::strcmp(interface, zwp_idle_inhibit_manager_v1_interface.name) != 0) {
    return;
  }
  m_manager = static_cast<zwp_idle_inhibit_manager_v1 *>(
      wl_registry_bind(m_registry, name, &zwp_idle_inhibit_manager_v1_interface, 1));
}

void WaylandIdleInhibitor::setActive(bool active) {
  if (!m_manager || active == (m_inhibitor != nullptr)) return;
  if (active) {
    auto *surface = static_cast<wl_surface *>(
        qGuiApp->platformNativeInterface()->nativeResourceForWindow("surface", m_window));
    // No surface while the window is hidden, and then nothing shows to
    // keep the screen on for.
    if (!surface) return;
    m_inhibitor = zwp_idle_inhibit_manager_v1_create_inhibitor(m_manager, surface);
  } else {
    zwp_idle_inhibitor_v1_destroy(m_inhibitor);
    m_inhibitor = nullptr;
  }
  wl_display_flush(m_display);
}
