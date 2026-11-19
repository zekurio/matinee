#include "player/mpv_player.h"

#include "app/paths.h"
#include "app/settings.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QLoggingCategory>
#include <QSaveFile>
#include <QSslCertificate>
#include <QSslConfiguration>

#include <mpv/client.h>

#include <algorithm>
#include <clocale>
#include <memory>

Q_LOGGING_CATEGORY(lcMpv, "matinee.mpv")

namespace {

// The properties whose changes mpv reports, by the id each was observed
// with.
enum Observed : quint64 {
  TimePos = 1,
  Duration,
  Pause,
  PausedForCache,
  EofReached,
  Speed,
  Volume,
  Mute,
  CacheTime,
  CacheState,
  CacheIdle,
  Seekable,
  PartiallySeekable,
  DisplayWidth,
  DisplayHeight,
  TrackList,
  AudioDeviceList,
  OutputConfigured,
  // Requests made later count on from here.
  FirstReply = 1000,
};

// How often the time goes to the page while it only counts on. The page
// counts on by itself in between, so this only has to correct drift.
constexpr qint64 timeIntervalMs = 250;

// A source that reports its end this far before its length didn't play to
// the end: the connection broke, and mpv read that as the end of the file.
constexpr double earlyEndSeconds = 10;

QJsonValue fromNode(const mpv_node &node) {
  switch (node.format) {
  case MPV_FORMAT_STRING:
    return QString::fromUtf8(node.u.string);
  case MPV_FORMAT_FLAG:
    return node.u.flag != 0;
  case MPV_FORMAT_INT64:
    return static_cast<qint64>(node.u.int64);
  case MPV_FORMAT_DOUBLE:
    return node.u.double_;
  case MPV_FORMAT_NODE_ARRAY: {
    QJsonArray array;
    for (int i = 0; i < node.u.list->num; ++i) {
      array.append(fromNode(node.u.list->values[i]));
    }
    return array;
  }
  case MPV_FORMAT_NODE_MAP: {
    QJsonObject object;
    for (int i = 0; i < node.u.list->num; ++i) {
      object.insert(QString::fromUtf8(node.u.list->keys[i]),
                    fromNode(node.u.list->values[i]));
    }
    return object;
  }
  default:
    return QJsonValue(QJsonValue::Null);
  }
}

QJsonValue fromProperty(const mpv_event_property &property) {
  if (!property.data) return QJsonValue(QJsonValue::Null);
  switch (property.format) {
  case MPV_FORMAT_NODE:
    return fromNode(*static_cast<const mpv_node *>(property.data));
  case MPV_FORMAT_DOUBLE:
    return *static_cast<const double *>(property.data);
  case MPV_FORMAT_FLAG:
    return *static_cast<const int *>(property.data) != 0;
  case MPV_FORMAT_INT64:
    return static_cast<qint64>(*static_cast<const int64_t *>(property.data));
  case MPV_FORMAT_STRING:
    return QString::fromUtf8(*static_cast<const char *const *>(property.data));
  default:
    return QJsonValue(QJsonValue::Null);
  }
}

// A value in one of mpv's comma-separated lists, with its commas kept.
QByteArray listItem(const QString &value) {
  QByteArray escaped = value.toUtf8();
  escaped.replace('\\', "\\\\");
  escaped.replace(',', "\\,");
  return escaped;
}

QByteArray number(double value) { return QByteArray::number(value, 'f', 3); }

QByteArray flag(bool value) { return value ? "yes" : "no"; }

// The certificates the system trusts, as one PEM file for mpv's TLS, so
// mpv accepts the servers the web view does. Empty when there are none to
// write, and mpv then connects without checking.
QString writeCertificates() {
  const QList<QSslCertificate> certificates =
      QSslConfiguration::systemCaCertificates();
  if (certificates.isEmpty()) return {};
  const QString path =
      QDir(paths::cache()).filePath(QStringLiteral("ca-certificates.pem"));
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly)) return {};
  for (const QSslCertificate &certificate : certificates) {
    file.write(certificate.toPem());
  }
  return file.commit() ? path : QString();
}

QJsonValue numberOrNull(const QJsonValue &value) {
  return value.isDouble() ? value : QJsonValue(QJsonValue::Null);
}

QJsonValue stringOrNull(const QJsonValue &value) {
  return value.isString() && !value.toString().isEmpty()
             ? value
             : QJsonValue(QJsonValue::Null);
}

// The properties `stats` reads, in the order `statsFrom` takes them.
constexpr const char *statProperties[] = {
    "video-format",
    "video-params",
    "hwdec-current",
    "osd-dimensions",
    "container-fps",
    "frame-drop-count",
    "decoder-frame-drop-count",
    "vo-delayed-frame-count",
    "video-bitrate",
    "audio-bitrate",
    "audio-codec-name",
    "audio-params",
    "audio-out-params",
    "avsync",
    "demuxer-cache-duration",
    "demuxer-cache-state",
    "cache-speed",
};

// PlayerStats in the bridge protocol, from mpv's properties by name.
QJsonObject statsFrom(const QJsonObject &values, double displayRefreshRate) {
  const QJsonObject video = values.value(QLatin1String("video-params")).toObject();
  const QJsonObject osd = values.value(QLatin1String("osd-dimensions")).toObject();
  const QJsonObject audio = values.value(QLatin1String("audio-params")).toObject();
  const QJsonObject audioOut =
      values.value(QLatin1String("audio-out-params")).toObject();
  const QJsonObject cache =
      values.value(QLatin1String("demuxer-cache-state")).toObject();
  const QString hardware = values.value(QLatin1String("hwdec-current")).toString();
  const bool shown = osd.contains(QLatin1String("w")) && !video.isEmpty();
  const auto margin = [&osd](const char *key) {
    return osd.value(QLatin1String(key)).toDouble();
  };
  return {
      {QStringLiteral("videoCodec"),
       stringOrNull(values.value(QLatin1String("video-format")))},
      {QStringLiteral("pixelFormat"),
       stringOrNull(video.value(QLatin1String("pixelformat")))},
      {QStringLiteral("hardwareDecoder"),
       hardware.isEmpty() || hardware == QLatin1String("no")
           ? QJsonValue(QJsonValue::Null)
           : QJsonValue(hardware)},
      {QStringLiteral("width"), numberOrNull(video.value(QLatin1String("w")))},
      {QStringLiteral("height"), numberOrNull(video.value(QLatin1String("h")))},
      {QStringLiteral("shownWidth"),
       shown ? QJsonValue(margin("w") - margin("ml") - margin("mr"))
             : QJsonValue(QJsonValue::Null)},
      {QStringLiteral("shownHeight"),
       shown ? QJsonValue(margin("h") - margin("mt") - margin("mb"))
             : QJsonValue(QJsonValue::Null)},
      {QStringLiteral("frameRate"),
       numberOrNull(values.value(QLatin1String("container-fps")))},
      {QStringLiteral("displayFrameRate"),
       displayRefreshRate > 0 ? QJsonValue(displayRefreshRate)
                              : QJsonValue(QJsonValue::Null)},
      {QStringLiteral("droppedFrames"),
       values.value(QLatin1String("frame-drop-count")).toDouble()},
      {QStringLiteral("decoderDroppedFrames"),
       values.value(QLatin1String("decoder-frame-drop-count")).toDouble()},
      {QStringLiteral("delayedFrames"),
       values.value(QLatin1String("vo-delayed-frame-count")).toDouble()},
      {QStringLiteral("colorPrimaries"),
       stringOrNull(video.value(QLatin1String("primaries")))},
      {QStringLiteral("colorTransfer"),
       stringOrNull(video.value(QLatin1String("gamma")))},
      {QStringLiteral("videoBitRate"),
       numberOrNull(values.value(QLatin1String("video-bitrate")))},
      {QStringLiteral("audioBitRate"),
       numberOrNull(values.value(QLatin1String("audio-bitrate")))},
      {QStringLiteral("audioCodec"),
       stringOrNull(values.value(QLatin1String("audio-codec-name")))},
      {QStringLiteral("audioChannels"),
       numberOrNull(audio.value(QLatin1String("channel-count")))},
      {QStringLiteral("audioOutputChannels"),
       numberOrNull(audioOut.value(QLatin1String("channel-count")))},
      {QStringLiteral("audioSampleRate"),
       numberOrNull(audio.value(QLatin1String("samplerate")))},
      {QStringLiteral("audioPassthrough"),
       audioOut.value(QLatin1String("format"))
           .toString()
           .startsWith(QLatin1String("spdif"))},
      {QStringLiteral("avSync"),
       numberOrNull(values.value(QLatin1String("avsync")))},
      {QStringLiteral("cacheSeconds"),
       numberOrNull(values.value(QLatin1String("demuxer-cache-duration")))},
      {QStringLiteral("cacheBytes"),
       numberOrNull(cache.value(QLatin1String("fw-bytes")))},
      {QStringLiteral("downloadSpeed"),
       numberOrNull(values.value(QLatin1String("cache-speed")))},
  };
}

} // namespace

MpvPlayer::MpvPlayer(QObject *parent)
    : QObject(parent), m_nextReply(Observed::FirstReply) {}

MpvPlayer::~MpvPlayer() {
  if (!m_mpv) return;
  mpv_set_wakeup_callback(m_mpv, nullptr, nullptr);
  mpv_terminate_destroy(m_mpv);
}

bool MpvPlayer::start(const DesktopSettings &settings, bool verbose) {
  // mpv reads numbers as C does, and refuses to start where the locale
  // writes them with a comma. Qt set the system's on startup.
  std::setlocale(LC_NUMERIC, "C");

  m_mpv = mpv_create();
  if (!m_mpv) {
    qCCritical(lcMpv) << "mpv didn't start";
    return false;
  }

  const QByteArray config = QDir(paths::config()).filePath(QStringLiteral("mpv")).toUtf8();
  const QByteArray cache = paths::cache().toUtf8();
  QDir().mkpath(QString::fromUtf8(config));
  const QString certificates = writeCertificates();

  // What a person may change in mpv.conf, read during mpv_initialize.
  const QList<std::pair<const char *, QByteArray>> defaults = {
      {"config", "yes"},
      {"config-dir", config},
      {"gpu-shader-cache-dir", cache},
      {"icc-cache-dir", cache},
      {"terminal", "no"},
      {"audio-client-name", "Matinee"},
      // For the video in the window. The render thread doesn't wait for
      // the display time: Qt still has to draw the controls. Ask for the
      // frame when it's due. With mpv's default 50 ms head start we
      // swapped 24 fps video a frame early.
      {"video-timing-offset", "0"},
#ifndef Q_OS_WIN
      // For the video under the window. An HDR source goes out as HDR,
      // with its own metadata, and the compositor fits it to the display.
      // mpv would otherwise ask the compositor what its surface should
      // be, and one that only switches the display to HDR for an HDR
      // surface, as Hyprland does by default, answers SDR until then.
      // Windows never switches for a program and doesn't fit HDR to an
      // SDR display, so there mpv's own default stands: it asks what the
      // display is, and sends HDR, fitted to it, only to one in HDR mode.
      {"target-colorspace-hint", "yes"},
      {"target-colorspace-hint-mode", "source"},
#endif
      // A file's parts are read again after a dropped connection, from
      // where it broke. Only for sources with byte ranges: a stream
      // without them would start over.
      {"stream-lavf-o", "reconnect=1,reconnect_on_network_error=1"},
  };
  for (const auto &[name, value] : defaults) {
    mpv_set_option_string(m_mpv, name, value.constData());
  }
  if (!certificates.isEmpty()) {
    mpv_set_option_string(m_mpv, "tls-verify", "yes");
    mpv_set_option_string(m_mpv, "tls-ca-file", certificates.toUtf8().constData());
  }

  // Only an mpv with the patch knows the option.
  m_takesParentSurface = mpv_set_option_string(m_mpv, "wayland-parent-surface", "0") >= 0;

  mpv_request_log_messages(m_mpv, verbose ? "v" : "warn");
  if (const int error = mpv_initialize(m_mpv); error < 0) {
    qCCritical(lcMpv) << "mpv didn't start:" << mpv_error_string(error);
    mpv_destroy(m_mpv);
    m_mpv = nullptr;
    return false;
  }

  // What the app depends on, set after mpv.conf so that it can't undo it.
  const QList<std::pair<const char *, const char *>> required = {
      // The picture goes to the window's renderer, under the page.
      {"vo", "libmpv"},
      // The page draws the controls and takes the keys.
      {"osc", "no"},
      {"osd-level", "0"},
      {"input-default-bindings", "no"},
      {"input-vo-keyboard", "no"},
      {"input-cursor", "no"},
      // A file stays open at its end, on the last frame, and stays as
      // paused or playing as it was, so the page says when it's over.
      {"idle", "yes"},
      {"keep-open", "always"},
      {"keep-open-pause", "no"},
      // The server says where a file resumes and which tracks play.
      {"save-position-on-quit", "no"},
      {"resume-playback", "no"},
      {"sid", "no"},
      {"sub-auto", "no"},
      {"audio-file-auto", "no"},
      {"ytdl", "no"},
      // mpv's clipboard support would open a connection to the display of
      // its own, for a clipboard only the page uses.
      {"clipboard-backends", ""},
      {"volume-max", "100"},
  };
  for (const auto &[name, value] : required) {
    if (const int error = mpv_set_property_string(m_mpv, name, value); error < 0) {
      qCWarning(lcMpv) << "mpv didn't take" << name << mpv_error_string(error);
    }
  }

  // Nothing plays yet, so asking and waiting is safe this once.
  if (char *version = mpv_get_property_string(m_mpv, "mpv-version")) {
    m_version = QString::fromUtf8(version).section(QLatin1Char(' '), 1, 1);
    mpv_free(version);
  }

  mpv_observe_property(m_mpv, TimePos, "time-pos", MPV_FORMAT_DOUBLE);
  mpv_observe_property(m_mpv, Duration, "duration", MPV_FORMAT_DOUBLE);
  mpv_observe_property(m_mpv, Pause, "pause", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, PausedForCache, "paused-for-cache", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, EofReached, "eof-reached", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, Speed, "speed", MPV_FORMAT_DOUBLE);
  mpv_observe_property(m_mpv, Volume, "volume", MPV_FORMAT_DOUBLE);
  mpv_observe_property(m_mpv, Mute, "mute", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, CacheTime, "demuxer-cache-time", MPV_FORMAT_DOUBLE);
  mpv_observe_property(m_mpv, CacheState, "demuxer-cache-state", MPV_FORMAT_NODE);
  mpv_observe_property(m_mpv, CacheIdle, "demuxer-cache-idle", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, Seekable, "seekable", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, PartiallySeekable, "partially-seekable", MPV_FORMAT_FLAG);
  mpv_observe_property(m_mpv, DisplayWidth, "dwidth", MPV_FORMAT_INT64);
  mpv_observe_property(m_mpv, DisplayHeight, "dheight", MPV_FORMAT_INT64);
  mpv_observe_property(m_mpv, TrackList, "track-list", MPV_FORMAT_NODE);
  mpv_observe_property(m_mpv, AudioDeviceList, "audio-device-list", MPV_FORMAT_NODE);
  mpv_observe_property(m_mpv, OutputConfigured, "vo-configured", MPV_FORMAT_FLAG);

  // Stops a file once it's open and before its tracks are picked, which
  // is when the ones the server named get picked instead.
  mpv_hook_add(m_mpv, 0, "on_preloaded", 0);

  mpv_set_wakeup_callback(
      m_mpv, [](void *self) { static_cast<MpvPlayer *>(self)->wake(); }, this);

  applySettings(settings);
  m_sinceTimeSent.start();
  return true;
}

void MpvPlayer::presentUnderWindow() {
  m_underWindow = true;
  set("vo", "gpu-next");
#ifdef Q_OS_WIN
  // mpv's own renderer on Direct3D 11, whose swapchain Windows takes as
  // HDR10.
  set("gpu-api", "d3d11");
  set("gpu-context", "d3d11");
#else
  // mpv's own renderer on Vulkan, which is what carries HDR to a Wayland
  // surface. The context is named, or mpv might pick X11 through
  // XWayland and open a window of its own.
  set("gpu-api", "vulkan");
  set("gpu-context", "waylandvk");
#endif
  // mpv times its own frames here.
  set("video-timing-offset", "0.050");
}

void MpvPlayer::setParentSurface(quintptr surface, const QSize &size) {
  set("wayland-parent-surface", QByteArray::number(surface));
  setOutputSize(size);
}

void MpvPlayer::setOutputSize(const QSize &size) {
  if (size.isEmpty()) return;
  set("geometry", QByteArray::number(size.width()) + 'x' + QByteArray::number(size.height()));
}

void MpvPlayer::setParentWindow(quintptr window) {
  // mpv's word for none is -1. 0 is the desktop's wallpaper.
  set("wid", window ? QByteArray::number(window) : QByteArray("-1"));
}

void MpvPlayer::setRenderReady(bool ready) {
  m_renderReady = ready;
  // Without anywhere to show it, a source that's open can't go on: under
  // the window, mpv would open a window of its own for the next one.
  if (!ready && m_underWindow && (m_fileOpen || m_awaitingStart)) stop();
  if (!ready || !m_deferred) return;
  const PlayerSource source = *m_deferred;
  m_deferred.reset();
  open(source);
}

void MpvPlayer::setCredentials(const QString &userAgent, const QString &token) {
  set("user-agent", userAgent.toUtf8());
  set("http-header-fields",
      token.isEmpty() ? QByteArray()
                      : "Authorization: " + listItem(QStringLiteral("Bearer ") + token));
}

void MpvPlayer::applySettings(const DesktopSettings &settings) {
  set("hwdec", settings.hardwareDecoding ? "auto-safe" : "no");
  set("audio-device", settings.audioDevice.toUtf8());
  set("audio-channels", settings.audioChannels == QLatin1String("auto")
                            ? QByteArray("auto-safe")
                            : settings.audioChannels.toUtf8());
  QStringList passthrough = settings.passthrough;
  // DTS-HD is carried as DTS to a receiver that only takes that.
  if (passthrough.contains(QLatin1String("dts-hd")) &&
      !passthrough.contains(QLatin1String("dts"))) {
    passthrough.append(QStringLiteral("dts"));
  }
  set("audio-spdif", passthrough.join(QLatin1Char(',')).toUtf8());
  set("audio-exclusive", flag(settings.exclusiveAudio));
}

void MpvPlayer::setDisplayRefreshRate(double hertz) {
  // On its own surface mpv hears the display's rate from the compositor.
  if (m_underWindow || hertz <= 0 || hertz == m_displayRefreshRate) return;
  m_displayRefreshRate = hertz;
  set("display-fps-override", number(hertz));
}

void MpvPlayer::load(const PlayerSource &source) {
  ++m_load;
  resetFile();
  m_failure = QString();
  m_time = source.start;
  m_wantedAudio = source.audio;
  m_wantedSubtitle = source.subtitle;
  m_awaitingStart = true;
  if (m_renderReady) open(source);
  else m_deferred = source;
  publish();
}

void MpvPlayer::open(const PlayerSource &source) {
  set("start", number(source.start));
  set("pause", flag(source.paused));
  set("sub-delay", number(source.subtitleDelay));
  const int load = m_load;
  command({"loadfile", source.url.toEncoded(), "replace"},
          [this, load](const QJsonValue &, int error) {
            if (error < 0 && load == m_load) {
              fail(QString::fromUtf8(mpv_error_string(error)));
            }
          });
}

void MpvPlayer::stop() {
  m_deferred.reset();
  resetFile();
  m_failure = QString();
  command({"stop"});
  publish();
}

void MpvPlayer::setPaused(bool paused) { set("pause", flag(paused)); }

void MpvPlayer::seek(double time) {
  // Before the file is open there is nothing to seek in, so it seeks once
  // it is.
  if (!m_loaded) {
    m_time = time;
    m_pendingSeek = time;
    publish();
    return;
  }
  m_seeking = true;
  m_seekTarget = time;
  m_endReached = false;
  command({"seek", number(time), "absolute+exact"});
  publish();
}

void MpvPlayer::setSpeed(double speed) { set("speed", number(speed)); }

void MpvPlayer::setVolume(double volume, bool muted) {
  set("volume", number(std::clamp(volume, 0.0, 1.0) * 100));
  set("mute", flag(muted));
}

void MpvPlayer::setAudio(int index) {
  m_wantedAudio = index;
  if (!m_loaded) return;
  if (const Track *track = embeddedTrack(QStringLiteral("audio"), index)) {
    set("aid", QByteArray::number(track->id));
  }
}

void MpvPlayer::setSubtitle(const PlayerSubtitle &subtitle) {
  m_wantedSubtitle = subtitle;
  applySubtitle();
}

void MpvPlayer::setSubtitleDelay(double seconds) {
  set("sub-delay", number(seconds));
}

void MpvPlayer::setSubtitleInset(double bottom) {
  // mpv places subtitles by how far down the screen they sit, in percent.
  set("sub-pos", number(100 - std::clamp(bottom, 0.0, 1.0) * 100));
}

void MpvPlayer::stats(std::function<void(const QJsonObject &)> done) {
  struct Batch {
    QJsonObject values;
    size_t remaining = std::size(statProperties);
  };
  const auto batch = std::make_shared<Batch>();
  for (const char *name : statProperties) {
    get(name, [this, batch, name, done](const QJsonValue &value, int) {
      batch->values.insert(QLatin1String(name), value);
      if (--batch->remaining == 0) {
        done(statsFrom(batch->values, m_displayRefreshRate));
      }
    });
  }
}

bool MpvPlayer::playing() const {
  return m_published.phase == PlayerState::Phase::Ready && !m_published.paused;
}

void MpvPlayer::wake() {
  // mpv calls this from its own threads, often several times per event.
  if (m_wakePending.exchange(true)) return;
  QMetaObject::invokeMethod(this, &MpvPlayer::drainEvents, Qt::QueuedConnection);
}

void MpvPlayer::drainEvents() {
  m_wakePending = false;
  while (true) {
    const mpv_event *event = mpv_wait_event(m_mpv, 0);
    if (event->event_id == MPV_EVENT_NONE) break;
    handle(*event);
  }
  publish();
}

void MpvPlayer::handle(const mpv_event &event) {
  switch (event.event_id) {
  case MPV_EVENT_START_FILE:
    m_awaitingStart = false;
    m_fileOpen = true;
    break;
  case MPV_EVENT_FILE_LOADED:
    m_loaded = true;
    applySubtitle();
    if (const std::optional<double> pending = m_pendingSeek) {
      m_pendingSeek.reset();
      seek(*pending);
    }
    break;
  case MPV_EVENT_SEEK:
    m_seeking = true;
    break;
  case MPV_EVENT_PLAYBACK_RESTART:
    m_seeking = false;
    // The time mpv reports next is from after the seek; until then the
    // target stands in, rather than the time from before it.
    if (m_seekTarget) m_time = *m_seekTarget;
    m_seekTarget.reset();
    m_started = true;
    break;
  case MPV_EVENT_END_FILE: {
    const auto *end = static_cast<const mpv_event_end_file *>(event.data);
    fileEnded(end->reason, end->error);
    break;
  }
  case MPV_EVENT_HOOK:
    preloaded(static_cast<const mpv_event_hook *>(event.data)->id);
    break;
  case MPV_EVENT_PROPERTY_CHANGE:
    propertyChanged(event.reply_userdata,
                    *static_cast<const mpv_event_property *>(event.data));
    break;
  case MPV_EVENT_GET_PROPERTY_REPLY:
  case MPV_EVENT_SET_PROPERTY_REPLY:
  case MPV_EVENT_COMMAND_REPLY: {
    const Reply reply = m_replies.take(event.reply_userdata);
    if (!reply) break;
    const QJsonValue value =
        event.event_id == MPV_EVENT_GET_PROPERTY_REPLY && event.error >= 0
            ? fromProperty(*static_cast<const mpv_event_property *>(event.data))
            : QJsonValue(QJsonValue::Null);
    reply(value, event.error);
    break;
  }
  case MPV_EVENT_LOG_MESSAGE: {
    const auto *message = static_cast<const mpv_event_log_message *>(event.data);
    const QString line = QStringLiteral("[%1] %2").arg(
        QString::fromUtf8(message->prefix), QString::fromUtf8(message->text).trimmed());
    if (message->log_level <= MPV_LOG_LEVEL_ERROR) {
      m_lastError = line;
      qCWarning(lcMpv).noquote() << line;
    } else if (message->log_level <= MPV_LOG_LEVEL_WARN) {
      qCWarning(lcMpv).noquote() << line;
    } else {
      qCDebug(lcMpv).noquote() << line;
    }
    break;
  }
  default:
    break;
  }
}

void MpvPlayer::propertyChanged(quint64 id, const mpv_event_property &property) {
  const QJsonValue value = fromProperty(property);
  switch (id) {
  case TimePos:
    // A file that's opening still reports the last one's time.
    if (value.isDouble() && m_loaded) m_time = value.toDouble();
    break;
  case Duration:
    m_duration = value.isDouble() ? std::optional(value.toDouble()) : std::nullopt;
    break;
  case Pause:
    m_paused = value.toBool();
    break;
  case PausedForCache:
    m_pausedForCache = value.toBool();
    break;
  case EofReached:
    m_endReached = value.toBool();
    if (m_endReached && m_loaded && m_duration &&
        m_time < *m_duration - earlyEndSeconds) {
      fail(m_lastError.isNull() ? QStringLiteral("The source ended early")
                                : m_lastError);
      command({"stop"});
    }
    break;
  case Speed:
    if (value.isDouble()) m_speed = value.toDouble();
    break;
  case Volume:
    if (value.isDouble()) m_volume = value.toDouble() / 100;
    break;
  case Mute:
    m_muted = value.toBool();
    break;
  case CacheTime:
    if (value.isDouble()) m_bufferedTo = value.toDouble();
    break;
  case CacheState:
    updateSeekable(value);
    break;
  case CacheIdle:
    m_cacheIdle = value.toBool();
    break;
  case Seekable:
    m_seekableSource = value.toBool();
    break;
  case PartiallySeekable:
    m_partiallySeekable = value.toBool();
    break;
  case DisplayWidth:
    m_videoWidth = value.toInt();
    break;
  case DisplayHeight:
    m_videoHeight = value.toInt();
    break;
  case TrackList:
    m_tracks = parseTracks(value);
    break;
  case OutputConfigured:
    if (value.toBool()) Q_EMIT outputConfigured();
    break;
  case AudioDeviceList: {
    m_audioDevices.clear();
    const QJsonArray devices = value.toArray();
    for (const QJsonValue &entry : devices) {
      const QJsonObject device = entry.toObject();
      m_audioDevices.append({device.value(QLatin1String("name")).toString(),
                             device.value(QLatin1String("description")).toString()});
    }
    break;
  }
  default:
    break;
  }
}

void MpvPlayer::fileEnded(int reason, int error) {
  // A file replaced by the next one ends as stopped, after the load and
  // before the next file starts, and says nothing about the next.
  if (m_awaitingStart) return;
  if (reason == MPV_END_FILE_REASON_ERROR) {
    const QString code = QString::fromUtf8(mpv_error_string(error));
    fail(m_lastError.isNull() ? code
                              : QStringLiteral("%1: %2").arg(code, m_lastError));
    return;
  }
  resetFile();
}

void MpvPlayer::preloaded(quint64 hook) {
  // Every path through here has to let mpv go on, or the file never plays.
  get("track-list", [this, hook](const QJsonValue &value, int) {
    // The observed list may not have caught up with this file yet.
    m_tracks = parseTracks(value);

    QByteArray audio = "auto";
    if (m_wantedAudio) {
      if (const Track *track = embeddedTrack(QStringLiteral("audio"), *m_wantedAudio)) {
        audio = QByteArray::number(track->id);
      }
    }
    QByteArray subtitle = "no";
    if (m_wantedSubtitle.kind == PlayerSubtitle::Kind::Stream) {
      if (const Track *track =
              embeddedTrack(QStringLiteral("sub"), m_wantedSubtitle.index)) {
        subtitle = QByteArray::number(track->id);
      }
    }
    set("aid", audio, [this, hook, subtitle](const QJsonValue &, int) {
      set("sid", subtitle, [this, hook](const QJsonValue &, int) {
        mpv_hook_continue(m_mpv, hook);
      });
    });
  });
}

QList<MpvPlayer::Track> MpvPlayer::parseTracks(const QJsonValue &list) {
  QList<Track> tracks;
  const QJsonArray entries = list.toArray();
  for (const QJsonValue &entry : entries) {
    const QJsonObject track = entry.toObject();
    const QJsonValue fileIndex = track.value(QLatin1String("ff-index"));
    tracks.append({
        .id = track.value(QLatin1String("id")).toInteger(),
        .type = track.value(QLatin1String("type")).toString(),
        .fileIndex = fileIndex.isDouble() ? std::optional(fileIndex.toInt())
                                          : std::nullopt,
        .external = track.value(QLatin1String("external")).toBool(),
        .externalFilename =
            track.value(QLatin1String("external-filename")).toString(),
    });
  }
  return tracks;
}

void MpvPlayer::fail(const QString &error) {
  resetFile();
  m_failure = error.isNull() ? QStringLiteral("") : error;
  qCWarning(lcMpv).noquote() << "Playback failed:" << m_failure;
}

void MpvPlayer::resetFile() {
  m_awaitingStart = false;
  m_fileOpen = false;
  m_loaded = false;
  m_started = false;
  m_seeking = false;
  m_seekTarget.reset();
  m_pendingSeek.reset();
  m_pausedForCache = false;
  m_endReached = false;
  m_duration.reset();
  m_bufferedTo = 0;
  m_cacheIdle = false;
  m_seekable.clear();
  m_seekableSource = false;
  m_partiallySeekable = false;
  m_videoWidth = 0;
  m_videoHeight = 0;
  m_tracks.clear();
  m_addedSubtitles.clear();
  m_lastError = QString();
}

PlayerState MpvPlayer::composed() const {
  PlayerState state;
  state.load = m_load;
  state.paused = m_paused;
  state.speed = m_speed;
  state.volume = m_volume;
  state.muted = m_muted;
  if (!m_failure.isNull()) {
    state.phase = PlayerState::Phase::Failed;
    state.error = m_failure;
    state.time = m_time;
    return state;
  }
  if (!m_fileOpen && !m_awaitingStart) return state;
  state.time = m_seekTarget.value_or(m_time);
  if (!m_loaded) {
    state.phase = PlayerState::Phase::Loading;
    state.buffering = true;
    state.reading = true;
    return state;
  }
  state.phase = m_endReached ? PlayerState::Phase::Ended : PlayerState::Phase::Ready;
  state.seeking = m_seeking;
  state.buffering = !m_endReached && (!m_started || m_seeking || m_pausedForCache);
  state.duration = m_duration;
  state.bufferedTo = std::max(m_bufferedTo, state.time);
  state.reading = !m_cacheIdle;
  state.seeks = m_seekableSource && !m_partiallySeekable;
  state.seekable = m_seekable;
  if (m_videoWidth > 0 && m_videoHeight > 0) {
    state.video = QSize(m_videoWidth, m_videoHeight);
  }
  return state;
}

void MpvPlayer::publish() {
  notePicture();
  const PlayerState next = composed();
  // What changes all the time while a file plays goes out a few times a
  // second. With anything else it goes at once, so the page has the time
  // a change happened at.
  PlayerState steady = next;
  steady.time = m_published.time;
  steady.bufferedTo = m_published.bufferedTo;
  steady.seekable = m_published.seekable;
  if (m_published.patchTo(steady).isEmpty() &&
      m_sinceTimeSent.elapsed() < timeIntervalMs) {
    return;
  }
  const QJsonObject patch = m_published.patchTo(next);
  if (patch.isEmpty()) return;
  m_sinceTimeSent.restart();
  m_published = next;
  Q_EMIT stateChanged(patch);
  if (const bool now = playing(); now != m_wasPlaying) {
    m_wasPlaying = now;
    Q_EMIT playingChanged(now);
  }
}

void MpvPlayer::notePicture() {
  if (const bool now = hasPicture(); now != m_hadPicture) {
    m_hadPicture = now;
    Q_EMIT pictureChanged(now);
  }
}

quint64 MpvPlayer::expect(Reply done) {
  if (!done) return 0;
  const quint64 id = m_nextReply++;
  m_replies.insert(id, std::move(done));
  return id;
}

void MpvPlayer::set(const char *name, const QByteArray &value, Reply done) {
  const char *text = value.constData();
  const quint64 id = expect(std::move(done));
  const int error = mpv_set_property_async(m_mpv, id, name, MPV_FORMAT_STRING, &text);
  if (error < 0) {
    qCWarning(lcMpv) << "Couldn't set" << name << mpv_error_string(error);
    if (const Reply reply = m_replies.take(id)) reply(QJsonValue(), error);
  }
}

void MpvPlayer::get(const char *name, Reply done) {
  const quint64 id = expect(std::move(done));
  const int error = mpv_get_property_async(m_mpv, id, name, MPV_FORMAT_NODE);
  if (error < 0) {
    if (const Reply reply = m_replies.take(id)) reply(QJsonValue(), error);
  }
}

void MpvPlayer::command(const QList<QByteArray> &arguments, Reply done) {
  QList<const char *> pointers;
  for (const QByteArray &argument : arguments) pointers.append(argument.constData());
  pointers.append(nullptr);
  const quint64 id = expect(std::move(done));
  const int error = mpv_command_async(m_mpv, id, pointers.data());
  if (error < 0) {
    qCWarning(lcMpv) << "Couldn't run" << arguments.first() << mpv_error_string(error);
    if (const Reply reply = m_replies.take(id)) reply(QJsonValue(), error);
  }
}

const MpvPlayer::Track *MpvPlayer::embeddedTrack(const QString &type,
                                                 int fileIndex) const {
  const auto found = std::find_if(m_tracks.begin(), m_tracks.end(),
                                  [&](const Track &track) {
                                    return track.type == type && !track.external &&
                                           track.fileIndex == fileIndex;
                                  });
  return found == m_tracks.end() ? nullptr : &*found;
}

void MpvPlayer::applySubtitle() {
  if (!m_loaded) return;
  switch (m_wantedSubtitle.kind) {
  case PlayerSubtitle::Kind::None:
    set("sid", "no");
    break;
  case PlayerSubtitle::Kind::Stream: {
    const Track *track = embeddedTrack(QStringLiteral("sub"), m_wantedSubtitle.index);
    set("sid", track ? QByteArray::number(track->id) : QByteArray("no"));
    break;
  }
  case PlayerSubtitle::Kind::External: {
    const QString url = QString::fromUtf8(m_wantedSubtitle.url.toEncoded());
    const auto added = std::find_if(m_tracks.begin(), m_tracks.end(),
                                    [&](const Track &track) {
                                      return track.type == QLatin1String("sub") &&
                                             track.externalFilename == url;
                                    });
    if (added != m_tracks.end()) {
      set("sid", QByteArray::number(added->id));
    } else if (!m_addedSubtitles.contains(url)) {
      m_addedSubtitles.insert(url);
      command({"sub-add", url.toUtf8(), "select"});
    }
    break;
  }
  }
}

void MpvPlayer::updateSeekable(const QJsonValue &cacheState) {
  m_seekable.clear();
  const QJsonArray ranges =
      cacheState.toObject().value(QLatin1String("seekable-ranges")).toArray();
  for (const QJsonValue &entry : ranges) {
    const QJsonObject range = entry.toObject();
    m_seekable.append({range.value(QLatin1String("start")).toDouble(),
                       range.value(QLatin1String("end")).toDouble()});
  }
}
