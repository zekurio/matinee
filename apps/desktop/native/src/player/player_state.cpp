#include "player/player_state.h"

#include <QJsonArray>

namespace {

QString phaseName(PlayerState::Phase phase) {
  switch (phase) {
  case PlayerState::Phase::Idle:
    return QStringLiteral("idle");
  case PlayerState::Phase::Loading:
    return QStringLiteral("loading");
  case PlayerState::Phase::Ready:
    return QStringLiteral("ready");
  case PlayerState::Phase::Ended:
    return QStringLiteral("ended");
  case PlayerState::Phase::Failed:
    return QStringLiteral("failed");
  }
  Q_UNREACHABLE();
}

QJsonValue durationJson(const std::optional<double> &duration) {
  return duration ? QJsonValue(*duration) : QJsonValue(QJsonValue::Null);
}

QJsonValue seekableJson(const QList<TimeRange> &ranges) {
  QJsonArray array;
  for (const TimeRange &range : ranges) {
    array.append(QJsonObject{{QStringLiteral("start"), range.start},
                             {QStringLiteral("end"), range.end}});
  }
  return array;
}

QJsonValue videoJson(const std::optional<QSize> &video) {
  if (!video) return QJsonValue(QJsonValue::Null);
  return QJsonObject{{QStringLiteral("width"), video->width()},
                     {QStringLiteral("height"), video->height()}};
}

QJsonValue errorJson(const QString &error) {
  return error.isNull() ? QJsonValue(QJsonValue::Null) : QJsonValue(error);
}

} // namespace

QJsonObject PlayerState::toJson() const {
  return {
      {QStringLiteral("phase"), phaseName(phase)},
      {QStringLiteral("load"), load},
      {QStringLiteral("paused"), paused},
      {QStringLiteral("buffering"), buffering},
      {QStringLiteral("seeking"), seeking},
      {QStringLiteral("time"), time},
      {QStringLiteral("duration"), durationJson(duration)},
      {QStringLiteral("speed"), speed},
      {QStringLiteral("volume"), volume},
      {QStringLiteral("muted"), muted},
      {QStringLiteral("bufferedTo"), bufferedTo},
      {QStringLiteral("reading"), reading},
      {QStringLiteral("seeks"), seeks},
      {QStringLiteral("seekable"), seekableJson(seekable)},
      {QStringLiteral("video"), videoJson(video)},
      {QStringLiteral("error"), errorJson(error)},
  };
}

QJsonObject PlayerState::patchTo(const PlayerState &next) const {
  QJsonObject patch;
  if (phase != next.phase) {
    patch.insert(QStringLiteral("phase"), phaseName(next.phase));
  }
  if (load != next.load) patch.insert(QStringLiteral("load"), next.load);
  if (paused != next.paused) {
    patch.insert(QStringLiteral("paused"), next.paused);
  }
  if (buffering != next.buffering) {
    patch.insert(QStringLiteral("buffering"), next.buffering);
  }
  if (seeking != next.seeking) {
    patch.insert(QStringLiteral("seeking"), next.seeking);
  }
  if (time != next.time) patch.insert(QStringLiteral("time"), next.time);
  if (duration != next.duration) {
    patch.insert(QStringLiteral("duration"), durationJson(next.duration));
  }
  if (speed != next.speed) patch.insert(QStringLiteral("speed"), next.speed);
  if (volume != next.volume) {
    patch.insert(QStringLiteral("volume"), next.volume);
  }
  if (muted != next.muted) patch.insert(QStringLiteral("muted"), next.muted);
  if (bufferedTo != next.bufferedTo) {
    patch.insert(QStringLiteral("bufferedTo"), next.bufferedTo);
  }
  if (reading != next.reading) {
    patch.insert(QStringLiteral("reading"), next.reading);
  }
  if (seeks != next.seeks) patch.insert(QStringLiteral("seeks"), next.seeks);
  if (seekable != next.seekable) {
    patch.insert(QStringLiteral("seekable"), seekableJson(next.seekable));
  }
  if (video != next.video) {
    patch.insert(QStringLiteral("video"), videoJson(next.video));
  }
  if (error != next.error || error.isNull() != next.error.isNull()) {
    patch.insert(QStringLiteral("error"), errorJson(next.error));
  }
  return patch;
}
