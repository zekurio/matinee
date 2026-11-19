#pragma once

class QWindow;
struct wl_display;
struct wl_event_queue;
struct zwp_idle_inhibit_manager_v1;
struct zwp_idle_inhibitor_v1;

// Holds the compositor from going idle while a window shows, through
// Wayland's idle-inhibit protocol. Does nothing off Wayland, and on a
// compositor without the protocol.
class WaylandIdleInhibitor {
public:
  explicit WaylandIdleInhibitor(QWindow *window);
  ~WaylandIdleInhibitor();

  WaylandIdleInhibitor(const WaylandIdleInhibitor &) = delete;
  WaylandIdleInhibitor &operator=(const WaylandIdleInhibitor &) = delete;

  void setActive(bool active);

  // Called as the compositor lists what it offers.
  void offered(unsigned name, const char *interface);

private:
  QWindow *m_window;
  wl_display *m_display = nullptr;
  // The app's own queue on Qt's connection, so that reading the
  // compositor's list doesn't run Qt's handlers from here.
  wl_event_queue *m_queue = nullptr;
  struct wl_registry *m_registry = nullptr;
  zwp_idle_inhibit_manager_v1 *m_manager = nullptr;
  zwp_idle_inhibitor_v1 *m_inhibitor = nullptr;
};
