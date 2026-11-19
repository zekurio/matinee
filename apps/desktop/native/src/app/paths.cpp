#include "app/paths.h"

#include <QDir>
#include <QStandardPaths>

namespace {

QString ensured(QStandardPaths::StandardLocation location, const char *name) {
  const QString root = qEnvironmentVariable("MATINEE_DESKTOP_DIR");
  const QString path = root.isEmpty() ? QStandardPaths::writableLocation(location)
                                      : QDir(root).filePath(QLatin1String(name));
  QDir().mkpath(path);
  return path;
}

} // namespace

namespace paths {

QString config() { return ensured(QStandardPaths::AppConfigLocation, "config"); }

QString cache() { return ensured(QStandardPaths::CacheLocation, "cache"); }

QString data() { return ensured(QStandardPaths::AppLocalDataLocation, "data"); }

} // namespace paths
