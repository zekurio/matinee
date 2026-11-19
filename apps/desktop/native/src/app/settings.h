#pragma once

#include <QJsonObject>
#include <QObject>
#include <QRect>
#include <QStringList>

// This device's settings, as DesktopSettings in the bridge protocol has
// them. Kept in settings.json in the config directory.
struct DesktopSettings {
  bool hardwareDecoding = true;
  QString audioDevice = QStringLiteral("auto");
  // "auto", "stereo", "5.1", or "7.1".
  QString audioChannels = QStringLiteral("auto");
  // mpv's audio-spdif names: ac3, eac3, dts, dts-hd, truehd.
  QStringList passthrough;
  bool exclusiveAudio = false;
  double scale = 1.0;
  bool startFullscreen = false;

  QJsonObject toJson() const;
  bool operator==(const DesktopSettings &) const = default;
};

// Where the window was, for the next start. Not a setting anyone sets.
struct WindowPlacement {
  QRect geometry;
  bool maximized = false;
};

class Settings : public QObject {
  Q_OBJECT

public:
  explicit Settings(QObject *parent = nullptr);

  const DesktopSettings &values() const { return m_values; }

  // Changes the settings `patch` names and keeps the rest. Returns false,
  // changing nothing, when a value isn't one the setting takes.
  bool apply(const QJsonObject &patch);

  WindowPlacement window() const { return m_window; }
  void setWindow(const WindowPlacement &placement);

Q_SIGNALS:
  void changed(const DesktopSettings &values);

private:
  void load();
  void save() const;

  QString m_path;
  DesktopSettings m_values;
  WindowPlacement m_window;
};
