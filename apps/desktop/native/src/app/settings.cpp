#include "app/settings.h"

#include "app/paths.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLoggingCategory>
#include <QSaveFile>

#include <algorithm>
#include <optional>

Q_LOGGING_CATEGORY(lcSettings, "matinee.settings")

namespace {

const QStringList channelLayouts = {
    QStringLiteral("auto"), QStringLiteral("stereo"), QStringLiteral("5.1"),
    QStringLiteral("7.1")};
const QStringList passthroughCodecs = {
    QStringLiteral("ac3"), QStringLiteral("eac3"), QStringLiteral("dts"),
    QStringLiteral("dts-hd"), QStringLiteral("truehd")};

constexpr double minScale = 0.5;
constexpr double maxScale = 3.0;

// The settings with `patch` over them, or nothing when `patch` holds a
// value its setting doesn't take. Keys it doesn't know are skipped, so a
// file from a newer version still loads.
std::optional<DesktopSettings> patched(DesktopSettings values,
                                       const QJsonObject &patch) {
  for (auto it = patch.begin(); it != patch.end(); ++it) {
    const QString key = it.key();
    const QJsonValue value = it.value();
    if (key == QLatin1String("hardwareDecoding")) {
      if (!value.isBool()) return std::nullopt;
      values.hardwareDecoding = value.toBool();
    } else if (key == QLatin1String("audioDevice")) {
      if (!value.isString() || value.toString().isEmpty()) return std::nullopt;
      values.audioDevice = value.toString();
    } else if (key == QLatin1String("audioChannels")) {
      if (!channelLayouts.contains(value.toString())) return std::nullopt;
      values.audioChannels = value.toString();
    } else if (key == QLatin1String("passthrough")) {
      if (!value.isArray()) return std::nullopt;
      QStringList codecs;
      const QJsonArray array = value.toArray();
      for (const QJsonValue &codec : array) {
        if (!passthroughCodecs.contains(codec.toString())) return std::nullopt;
        if (!codecs.contains(codec.toString())) codecs.append(codec.toString());
      }
      values.passthrough = codecs;
    } else if (key == QLatin1String("exclusiveAudio")) {
      if (!value.isBool()) return std::nullopt;
      values.exclusiveAudio = value.toBool();
    } else if (key == QLatin1String("scale")) {
      if (!value.isDouble()) return std::nullopt;
      values.scale = std::clamp(value.toDouble(), minScale, maxScale);
    } else if (key == QLatin1String("startFullscreen")) {
      if (!value.isBool()) return std::nullopt;
      values.startFullscreen = value.toBool();
    }
  }
  return values;
}

} // namespace

QJsonObject DesktopSettings::toJson() const {
  return {
      {QStringLiteral("hardwareDecoding"), hardwareDecoding},
      {QStringLiteral("audioDevice"), audioDevice},
      {QStringLiteral("audioChannels"), audioChannels},
      {QStringLiteral("passthrough"), QJsonArray::fromStringList(passthrough)},
      {QStringLiteral("exclusiveAudio"), exclusiveAudio},
      {QStringLiteral("scale"), scale},
      {QStringLiteral("startFullscreen"), startFullscreen},
  };
}

Settings::Settings(QObject *parent)
    : QObject(parent),
      m_path(QDir(paths::config()).filePath(QStringLiteral("settings.json"))) {
  load();
}

bool Settings::apply(const QJsonObject &patch) {
  const std::optional<DesktopSettings> next = patched(m_values, patch);
  if (!next) return false;
  if (*next == m_values) return true;
  m_values = *next;
  save();
  Q_EMIT changed(m_values);
  return true;
}

void Settings::setWindow(const WindowPlacement &placement) {
  m_window = placement;
  save();
}

void Settings::load() {
  QFile file(m_path);
  if (!file.open(QIODevice::ReadOnly)) return;
  const QJsonObject root = QJsonDocument::fromJson(file.readAll()).object();
  // A file someone edited into something unreadable starts over.
  if (const auto values = patched({}, root.value(QLatin1String("settings")).toObject())) {
    m_values = *values;
  } else {
    qCWarning(lcSettings) << "Ignoring settings that don't read:" << m_path;
  }
  const QJsonObject window = root.value(QLatin1String("window")).toObject();
  m_window.geometry = QRect(window.value(QLatin1String("x")).toInt(),
                            window.value(QLatin1String("y")).toInt(),
                            window.value(QLatin1String("width")).toInt(),
                            window.value(QLatin1String("height")).toInt());
  m_window.maximized = window.value(QLatin1String("maximized")).toBool();
}

void Settings::save() const {
  const QJsonObject window{
      {QStringLiteral("x"), m_window.geometry.x()},
      {QStringLiteral("y"), m_window.geometry.y()},
      {QStringLiteral("width"), m_window.geometry.width()},
      {QStringLiteral("height"), m_window.geometry.height()},
      {QStringLiteral("maximized"), m_window.maximized},
  };
  const QJsonObject root{{QStringLiteral("settings"), m_values.toJson()},
                         {QStringLiteral("window"), window}};
  QSaveFile file(m_path);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(QJsonDocument(root).toJson()) < 0 || !file.commit()) {
    qCWarning(lcSettings) << "Couldn't save" << m_path << file.errorString();
  }
}
