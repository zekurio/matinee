#include "os/linux/mpris.h"

#include <QDBusConnection>
#include <QDBusMessage>
#include <QLoggingCategory>
#include <QUrl>

Q_LOGGING_CATEGORY(lcMpris, "matinee.mpris")

namespace {

const QString serviceName = QStringLiteral("org.mpris.MediaPlayer2.matinee");
const QString objectPath = QStringLiteral("/org/mpris/MediaPlayer2");
const QString playerInterface = QStringLiteral("org.mpris.MediaPlayer2.Player");
// MPRIS wants a path for what plays. There is only ever one thing.
const QString trackPath = QStringLiteral("/io/github/zekurio/matinee/track");

constexpr double microseconds = 1'000'000;

} // namespace

Mpris::Mpris(QObject *parent) : MediaControls(parent) {
  auto *root = new MprisRoot(this);
  auto *player = new MprisPlayer(this);
  Q_UNUSED(root);
  Q_UNUSED(player);
  QDBusConnection bus = QDBusConnection::sessionBus();
  m_registered = bus.registerObject(objectPath, this) && bus.registerService(serviceName);
  if (!m_registered) {
    qCInfo(lcMpris) << "No session bus took the media controls:" << bus.lastError().message();
  }
  m_announced = properties();
}

Mpris::~Mpris() {
  if (m_registered) QDBusConnection::sessionBus().unregisterService(serviceName);
}

void Mpris::setMetadata(const std::optional<MediaMetadata> &metadata) {
  m_metadata = metadata;
  announce();
}

void Mpris::setState(const PlayerState &state) {
  const bool landed = m_state.seeking && !state.seeking;
  m_state = state;
  announce();
  if (landed && m_registered) {
    Q_EMIT findChild<MprisPlayer *>()->Seeked(position());
  }
}

QString Mpris::playbackStatus() const {
  if (!m_metadata || m_state.phase == PlayerState::Phase::Idle ||
      m_state.phase == PlayerState::Phase::Failed) {
    return QStringLiteral("Stopped");
  }
  return m_state.paused || m_state.phase == PlayerState::Phase::Ended
             ? QStringLiteral("Paused")
             : QStringLiteral("Playing");
}

QVariantMap Mpris::metadata() const {
  if (!m_metadata) return {};
  QVariantMap map{
      {QStringLiteral("mpris:trackid"), QVariant::fromValue(QDBusObjectPath(trackPath))},
      {QStringLiteral("xesam:title"), m_metadata->title},
  };
  if (!m_metadata->subtitle.isEmpty()) {
    // A list, since a track can have several artists.
    map.insert(QStringLiteral("xesam:artist"), QStringList{m_metadata->subtitle});
  }
  if (!m_metadata->artworkFile.isEmpty()) {
    map.insert(QStringLiteral("mpris:artUrl"),
               QUrl::fromLocalFile(m_metadata->artworkFile).toString());
  }
  const std::optional<double> length =
      m_metadata->duration
          ? m_metadata->duration
          : m_state.duration ? std::optional(m_metadata->offset + *m_state.duration)
                             : std::nullopt;
  if (length) {
    map.insert(QStringLiteral("mpris:length"), static_cast<qlonglong>(*length * microseconds));
  }
  return map;
}

qlonglong Mpris::position() const {
  if (!m_metadata) return 0;
  return static_cast<qlonglong>((m_metadata->offset + m_state.time) * microseconds);
}

void Mpris::request(const QString &action) {
  if (!m_metadata) return;
  Q_EMIT this->action({{QStringLiteral("action"), action}});
}

void Mpris::requestSeek(qlonglong position) {
  if (!m_metadata) return;
  Q_EMIT action({{QStringLiteral("action"), QStringLiteral("seek")},
                 {QStringLiteral("position"), static_cast<double>(position) / microseconds}});
}

void Mpris::requestSkip(qlonglong by) {
  if (!m_metadata) return;
  Q_EMIT action({{QStringLiteral("action"), QStringLiteral("skip")},
                 {QStringLiteral("by"), static_cast<double>(by) / microseconds}});
}

// The properties a desktop is told about when they change. The position
// isn't one: MPRIS has clients count on from the last seek by the rate.
QVariantMap Mpris::properties() const {
  return {
      {QStringLiteral("PlaybackStatus"), playbackStatus()},
      {QStringLiteral("Rate"), rate()},
      {QStringLiteral("Metadata"), metadata()},
      {QStringLiteral("Volume"), volume()},
      {QStringLiteral("CanGoNext"), hasNext()},
      {QStringLiteral("CanGoPrevious"), hasPrevious()},
      {QStringLiteral("CanPlay"), controllable()},
      {QStringLiteral("CanPause"), controllable()},
      {QStringLiteral("CanSeek"), controllable()},
  };
}

void Mpris::announce() {
  const QVariantMap now = properties();
  QVariantMap changed;
  for (auto it = now.cbegin(); it != now.cend(); ++it) {
    if (m_announced.value(it.key()) != it.value()) changed.insert(it.key(), it.value());
  }
  if (changed.isEmpty()) return;
  m_announced = now;
  if (!m_registered) return;
  QDBusMessage signal = QDBusMessage::createSignal(
      objectPath, QStringLiteral("org.freedesktop.DBus.Properties"),
      QStringLiteral("PropertiesChanged"));
  signal << playerInterface << changed << QStringList();
  QDBusConnection::sessionBus().send(signal);
}

MprisRoot::MprisRoot(Mpris *mpris) : QDBusAbstractAdaptor(mpris), m_mpris(mpris) {}

void MprisRoot::Raise() { Q_EMIT m_mpris->raiseRequested(); }

void MprisRoot::Quit() { Q_EMIT m_mpris->quitRequested(); }

MprisPlayer::MprisPlayer(Mpris *mpris) : QDBusAbstractAdaptor(mpris), m_mpris(mpris) {}

void MprisPlayer::SetPosition(const QDBusObjectPath &TrackId, qlonglong Position) {
  // A position for a track that has gone since is stale.
  if (TrackId.path() == trackPath) m_mpris->requestSeek(Position);
}
