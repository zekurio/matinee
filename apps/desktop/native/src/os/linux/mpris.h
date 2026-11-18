#pragma once

#include "os/media_controls.h"

#include <QDBusAbstractAdaptor>
#include <QDBusObjectPath>
#include <QStringList>
#include <QVariantMap>

// MPRIS, the D-Bus interface Linux desktops read what plays from and send
// their media buttons to: https://specifications.freedesktop.org/mpris-spec/
// Times cross it in microseconds, in the file's time.
class Mpris : public MediaControls {
  Q_OBJECT

public:
  explicit Mpris(QObject *parent);
  ~Mpris() override;

  void setMetadata(const std::optional<MediaMetadata> &metadata) override;
  void setState(const PlayerState &state) override;

  // What the two interfaces below answer with.
  QString playbackStatus() const;
  QVariantMap metadata() const;
  qlonglong position() const;
  double rate() const { return m_state.speed; }
  double volume() const { return m_state.muted ? 0 : m_state.volume; }
  bool controllable() const { return m_metadata.has_value(); }
  bool hasNext() const { return m_metadata && m_metadata->hasNext; }
  bool hasPrevious() const { return m_metadata && m_metadata->hasPrevious; }

  void request(const QString &action);
  void requestSeek(qlonglong position);
  void requestSkip(qlonglong by);

private:
  QVariantMap properties() const;
  void announce();

  bool m_registered = false;
  std::optional<MediaMetadata> m_metadata;
  PlayerState m_state;
  // What the desktop was last told, to tell it only of changes.
  QVariantMap m_announced;
};

class MprisRoot : public QDBusAbstractAdaptor {
  Q_OBJECT
  Q_CLASSINFO("D-Bus Interface", "org.mpris.MediaPlayer2")
  Q_PROPERTY(bool CanQuit READ yes CONSTANT)
  Q_PROPERTY(bool CanRaise READ yes CONSTANT)
  Q_PROPERTY(bool HasTrackList READ no CONSTANT)
  Q_PROPERTY(QString Identity READ identity CONSTANT)
  Q_PROPERTY(QString DesktopEntry READ desktopEntry CONSTANT)
  Q_PROPERTY(QStringList SupportedUriSchemes READ none CONSTANT)
  Q_PROPERTY(QStringList SupportedMimeTypes READ none CONSTANT)

public:
  explicit MprisRoot(Mpris *mpris);

  bool yes() const { return true; }
  bool no() const { return false; }
  QString identity() const { return QStringLiteral("Matinee"); }
  QString desktopEntry() const { return QStringLiteral("io.github.zekurio.matinee"); }
  QStringList none() const { return {}; }

public Q_SLOTS:
  void Raise();
  void Quit();

private:
  Mpris *m_mpris;
};

class MprisPlayer : public QDBusAbstractAdaptor {
  Q_OBJECT
  Q_CLASSINFO("D-Bus Interface", "org.mpris.MediaPlayer2.Player")
  Q_PROPERTY(QString PlaybackStatus READ playbackStatus)
  Q_PROPERTY(double Rate READ rate WRITE setRate)
  Q_PROPERTY(QVariantMap Metadata READ metadata)
  Q_PROPERTY(double Volume READ volume WRITE setVolume)
  Q_PROPERTY(qlonglong Position READ position)
  Q_PROPERTY(double MinimumRate READ one CONSTANT)
  Q_PROPERTY(double MaximumRate READ one CONSTANT)
  Q_PROPERTY(bool CanGoNext READ canGoNext)
  Q_PROPERTY(bool CanGoPrevious READ canGoPrevious)
  Q_PROPERTY(bool CanPlay READ canControl)
  Q_PROPERTY(bool CanPause READ canControl)
  Q_PROPERTY(bool CanSeek READ canControl)
  Q_PROPERTY(bool CanControl READ yes CONSTANT)

public:
  explicit MprisPlayer(Mpris *mpris);

  QString playbackStatus() const { return m_mpris->playbackStatus(); }
  double rate() const { return m_mpris->rate(); }
  // The speed and the volume are the page's to set, from its own menus.
  void setRate(double) {}
  void setVolume(double) {}
  QVariantMap metadata() const { return m_mpris->metadata(); }
  double volume() const { return m_mpris->volume(); }
  qlonglong position() const { return m_mpris->position(); }
  double one() const { return 1; }
  bool yes() const { return true; }
  bool canGoNext() const { return m_mpris->hasNext(); }
  bool canGoPrevious() const { return m_mpris->hasPrevious(); }
  bool canControl() const { return m_mpris->controllable(); }

public Q_SLOTS:
  void Next() { m_mpris->request(QStringLiteral("next")); }
  void Previous() { m_mpris->request(QStringLiteral("previous")); }
  void Pause() { m_mpris->request(QStringLiteral("pause")); }
  void PlayPause() { m_mpris->request(QStringLiteral("toggle")); }
  void Stop() { m_mpris->request(QStringLiteral("stop")); }
  void Play() { m_mpris->request(QStringLiteral("play")); }
  void Seek(qlonglong Offset) { m_mpris->requestSkip(Offset); }
  void SetPosition(const QDBusObjectPath &TrackId, qlonglong Position);
  void OpenUri(const QString &) {}

Q_SIGNALS:
  void Seeked(qlonglong Position);

private:
  Mpris *m_mpris;
};
