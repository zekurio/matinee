#pragma once

#include "player/player_state.h"

#include <QByteArray>
#include <QElapsedTimer>
#include <QHash>
#include <QJsonValue>
#include <QObject>
#include <QSet>
#include <QSize>
#include <QUrl>

#include <atomic>
#include <functional>
#include <optional>

struct DesktopSettings;
struct mpv_handle;
struct mpv_event;
struct mpv_event_property;

// A subtitle mpv draws: a stream of the file that plays, by its index in
// the file, or a file at an address.
struct PlayerSubtitle {
  enum class Kind { None, Stream, External };

  Kind kind = Kind::None;
  int index = 0;
  QUrl url;
};

// What `load` opens. Times are seconds.
struct PlayerSource {
  QUrl url;
  double start = 0;
  bool paused = false;
  // The audio stream to play, by its index in the file. Unset, mpv's pick.
  std::optional<int> audio;
  PlayerSubtitle subtitle;
  double subtitleDelay = 0;
};

struct AudioDevice {
  QString name;
  QString description;
};

// mpv, and its state as the pages see it.
//
// mpv decides what the state is: every field of PlayerState comes from a
// property mpv reports or an event it sends, never from what was last
// asked of it. The one exception is a seek on its way, whose target shows
// as the time until mpv lands.
//
// Everything here runs on the main thread. mpv is only ever asked
// asynchronously once it runs: a synchronous call waits for mpv's core,
// which at times waits for the render thread, which waits for this one.
class MpvPlayer : public QObject {
  Q_OBJECT

public:
  explicit MpvPlayer(QObject *parent = nullptr);
  ~MpvPlayer() override;

  // Starts mpv. False when it can't, with the reason logged.
  bool start(const DesktopSettings &settings, bool verbose);

  // This mpv can show its video on a surface of its own under another
  // Wayland surface, which libmpv only does with the patch in
  // apps/desktop/mpv/wayland-parent-surface.patch.
  bool takesParentSurface() const { return m_takesParentSurface; }
  // Has mpv present on its own surface under the window's from now on,
  // instead of drawing through the render API. Before any source opens.
  void presentUnderWindow();
  // The window's `wl_surface`, as a number, and its size in the surface's
  // own units. 0 while the window has none.
  void setParentSurface(quintptr surface, const QSize &size);
  void setOutputSize(const QSize &size);

  mpv_handle *handle() const { return m_mpv; }
  // Like `v0.41.0`.
  QString version() const { return m_version; }

  // Whether the renderer has its context. A source opened before that
  // would get no picture, so `load` waits for it.
  void setRenderReady(bool ready);
  // What mpv sends with its requests: the web view's User-Agent, so the
  // server sees one client, and the session's token. An empty token sends
  // none.
  void setCredentials(const QString &userAgent, const QString &token);
  void applySettings(const DesktopSettings &settings);
  // The screen's refresh rate, which mpv can't find out under a web view.
  void setDisplayRefreshRate(double hertz);

  void load(const PlayerSource &source);
  void stop();
  void setPaused(bool paused);
  void seek(double time);
  void setSpeed(double speed);
  void setVolume(double volume, bool muted);
  void setAudio(int index);
  void setSubtitle(const PlayerSubtitle &subtitle);
  void setSubtitleDelay(double seconds);
  // How much of the window's height, from the bottom, subtitles keep out
  // of.
  void setSubtitleInset(double bottom);
  // Asks mpv for PlayerStats, and calls `done` with them.
  void stats(std::function<void(const QJsonObject &)> done);

  const PlayerState &state() const { return m_published; }
  QList<AudioDevice> audioDevices() const { return m_audioDevices; }
  // A source is open and not paused, so the screen should stay on.
  bool playing() const;
  // A frame of the source that's open is on screen.
  bool hasPicture() const { return m_fileOpen && m_started && m_failure.isNull(); }

Q_SIGNALS:
  // The fields of the state that changed, as a PlayerStatePatch.
  void stateChanged(const QJsonObject &patch);
  void playingChanged(bool playing);
  void pictureChanged(bool hasPicture);
  // mpv set its video output up for a source.
  void outputConfigured();

private:
  struct Track {
    qint64 id = 0;
    QString type;
    std::optional<int> fileIndex;
    bool external = false;
    QString externalFilename;
  };

  using Reply = std::function<void(const QJsonValue &value, int error)>;

  static QList<Track> parseTracks(const QJsonValue &list);

  void open(const PlayerSource &source);
  void wake();
  void drainEvents();
  void handle(const mpv_event &event);
  void propertyChanged(quint64 id, const mpv_event_property &property);
  void fileEnded(int reason, int error);
  void preloaded(quint64 hook);
  void fail(const QString &error);
  void resetFile();
  void publish();
  void notePicture();
  PlayerState composed() const;

  void set(const char *name, const QByteArray &value, Reply done = {});
  void get(const char *name, Reply done);
  void command(const QList<QByteArray> &arguments, Reply done = {});
  quint64 expect(Reply done);

  const Track *embeddedTrack(const QString &type, int fileIndex) const;
  void applySubtitle();
  void updateSeekable(const QJsonValue &cacheState);

  mpv_handle *m_mpv = nullptr;
  QString m_version;
  std::atomic<bool> m_wakePending = false;
  QHash<quint64, Reply> m_replies;
  quint64 m_nextReply;

  bool m_takesParentSurface = false;
  bool m_underWindow = false;
  bool m_renderReady = false;
  std::optional<PlayerSource> m_deferred;

  // What mpv last reported, which `composed` turns into the state.
  int m_load = 0;
  // A load was asked for and mpv hasn't started on it yet.
  bool m_awaitingStart = false;
  bool m_fileOpen = false;
  // mpv opened the file: its length and tracks are known and it seeks.
  bool m_loaded = false;
  // The first frame since the file opened showed.
  bool m_started = false;
  bool m_seeking = false;
  std::optional<double> m_seekTarget;
  // A seek asked for before the file opened, done once it has.
  std::optional<double> m_pendingSeek;
  bool m_pausedForCache = false;
  bool m_endReached = false;
  bool m_paused = false;
  double m_time = 0;
  std::optional<double> m_duration;
  double m_speed = 1;
  double m_volume = 1;
  bool m_muted = false;
  double m_bufferedTo = 0;
  // mpv has read all it will for now: to the end, or its cache is full.
  bool m_cacheIdle = false;
  bool m_seekableSource = false;
  bool m_partiallySeekable = false;
  QList<TimeRange> m_seekable;
  int m_videoWidth = 0;
  int m_videoHeight = 0;
  // Null while nothing failed.
  QString m_failure;
  QString m_lastError;

  QList<Track> m_tracks;
  std::optional<int> m_wantedAudio;
  PlayerSubtitle m_wantedSubtitle;
  // The subtitle files added to the file that's open, each added once.
  QSet<QString> m_addedSubtitles;

  QList<AudioDevice> m_audioDevices;
  double m_displayRefreshRate = 0;

  PlayerState m_published;
  QElapsedTimer m_sinceTimeSent;
  bool m_wasPlaying = false;
  bool m_hadPicture = false;
};
