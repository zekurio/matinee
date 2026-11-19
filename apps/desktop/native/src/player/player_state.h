#pragma once

#include <QJsonObject>
#include <QList>
#include <QSize>
#include <QString>

#include <optional>

// A stretch of the source, in seconds of its own time.
struct TimeRange {
  double start = 0;
  double end = 0;

  bool operator==(const TimeRange &) const = default;
};

// mpv's state as the pages see it: PlayerState in the bridge protocol,
// where each field is explained. Times are seconds in the source's own
// time.
struct PlayerState {
  enum class Phase { Idle, Loading, Ready, Ended, Failed };

  Phase phase = Phase::Idle;
  int load = 0;
  bool paused = false;
  bool buffering = false;
  bool seeking = false;
  double time = 0;
  std::optional<double> duration;
  double speed = 1;
  double volume = 1;
  bool muted = false;
  double bufferedTo = 0;
  bool reading = false;
  bool seeks = false;
  QList<TimeRange> seekable;
  std::optional<QSize> video;
  // Null unless the phase is Failed.
  QString error;

  QJsonObject toJson() const;

  // The fields that differ in `next`, with its values, as a
  // PlayerStatePatch. Empty when nothing does.
  QJsonObject patchTo(const PlayerState &next) const;
};
