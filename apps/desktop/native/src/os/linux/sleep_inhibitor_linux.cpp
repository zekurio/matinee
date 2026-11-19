#include "os/sleep_inhibitor.h"

#include "os/linux/wayland_idle_inhibitor.h"

#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QLoggingCategory>

#include <optional>

Q_LOGGING_CATEGORY(lcSleep, "matinee.sleep")

// Linux has two ways, and which one works depends on the desktop, so this
// uses both.
//
// The session's screen saver service, which GNOME, KDE, and idle daemons
// like hypridle implement: a cookie from Inhibit holds the screen until
// UnInhibit gives it back.
//
// Wayland's idle-inhibit protocol, which compositors built on wlroots
// (Sway, Hyprland, river) and others implement: while a window has an
// inhibitor and is visible, the compositor doesn't go idle.
struct SleepInhibitor::Platform {
  QDBusInterface screenSaver{QStringLiteral("org.freedesktop.ScreenSaver"),
                             QStringLiteral("/org/freedesktop/ScreenSaver"),
                             QStringLiteral("org.freedesktop.ScreenSaver"),
                             QDBusConnection::sessionBus()};
  std::optional<quint32> cookie;
  // Counts requests, so an answer that arrives after a release is given
  // back at once.
  int generation = 0;
  WaylandIdleInhibitor wayland;

  explicit Platform(QWindow *window) : wayland(window) {}
};

SleepInhibitor::SleepInhibitor(QWindow *window)
    : m_platform(std::make_unique<Platform>(window)) {}

SleepInhibitor::~SleepInhibitor() { setActive(false); }

void SleepInhibitor::setActive(bool active) {
  if (active == m_active) return;
  m_active = active;
  Platform *platform = m_platform.get();
  platform->wayland.setActive(active);
  const int generation = ++platform->generation;
  if (!active) {
    if (platform->cookie) {
      platform->screenSaver.asyncCall(QStringLiteral("UnInhibit"), *platform->cookie);
      platform->cookie.reset();
    }
    return;
  }
  auto *watcher = new QDBusPendingCallWatcher(
      platform->screenSaver.asyncCall(QStringLiteral("Inhibit"), QStringLiteral("Matinee"),
                                      QStringLiteral("Playing video")),
      &platform->screenSaver);
  QObject::connect(watcher, &QDBusPendingCallWatcher::finished, &platform->screenSaver,
                   [platform, generation](QDBusPendingCallWatcher *call) {
                     call->deleteLater();
                     const QDBusPendingReply<quint32> reply = *call;
                     if (reply.isError()) {
                       qCDebug(lcSleep).noquote()
                           << "No screen saver service to hold the screen:"
                           << reply.error().message();
                       return;
                     }
                     if (generation != platform->generation) {
                       platform->screenSaver.asyncCall(QStringLiteral("UnInhibit"),
                                                       reply.value());
                       return;
                     }
                     platform->cookie = reply.value();
                   });
}
