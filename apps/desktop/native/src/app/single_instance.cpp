#include "app/single_instance.h"

#include <QCryptographicHash>
#include <QDir>
#include <QLocalSocket>
#include <QStandardPaths>

namespace {

constexpr int connectTimeoutMs = 500;

// One per user. On Unix a socket in the user's runtime directory, which
// nobody else can reach. A bare name would land in /tmp, shared by every
// user of the machine. On Windows a pipe's name is per session already.
// A copy of the app with a directory of its own, from MATINEE_DESKTOP_DIR,
// is its own instance too.
QString serverName() {
  const QString own = qEnvironmentVariable("MATINEE_DESKTOP_DIR");
#ifdef Q_OS_UNIX
  const QString directory =
      own.isEmpty() ? QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation) : own;
  if (!directory.isEmpty()) {
    return QDir(directory).filePath(QStringLiteral("matinee-desktop.sock"));
  }
#endif
  const QString name = QStringLiteral("io.github.zekurio.matinee.desktop");
  if (own.isEmpty()) return name;
  return name + QLatin1Char('.') +
         QString::fromLatin1(
             QCryptographicHash::hash(own.toUtf8(), QCryptographicHash::Sha1).toHex().left(12));
}

} // namespace

SingleInstance::SingleInstance(QObject *parent) : QObject(parent) {
  m_server.setSocketOptions(QLocalServer::UserAccessOption);
  connect(&m_server, &QLocalServer::newConnection, this, [this] {
    while (QLocalSocket *socket = m_server.nextPendingConnection()) {
      socket->deleteLater();
      Q_EMIT activated();
    }
  });
}

bool SingleInstance::claim() {
  const QString name = serverName();
  QLocalSocket socket;
  socket.connectToServer(name);
  if (socket.waitForConnected(connectTimeoutMs)) {
    socket.disconnectFromServer();
    return false;
  }
  // Nothing answered, so a socket file still there is from a copy that
  // crashed.
  QLocalServer::removeServer(name);
  m_server.listen(name);
  return true;
}
