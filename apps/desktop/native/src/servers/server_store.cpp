#include "servers/server_store.h"

#include "app/paths.h"

#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLoggingCategory>
#include <QSaveFile>
#include <QUuid>

#include <algorithm>

Q_LOGGING_CATEGORY(lcServers, "matinee.servers")

namespace {

QJsonValue orNull(const QString &value) {
  return value.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(value);
}

} // namespace

QJsonObject SavedServer::toJson() const {
  return {
      {QStringLiteral("id"), id},
      {QStringLiteral("url"), url.toString()},
      {QStringLiteral("username"), username},
      {QStringLiteral("displayName"), orNull(displayName)},
      {QStringLiteral("avatar"), orNull(avatar)},
  };
}

ServerStore::ServerStore(QObject *parent)
    : QObject(parent),
      m_path(QDir(paths::config()).filePath(QStringLiteral("servers.json"))) {
  load();
}

std::optional<SavedServer> ServerStore::find(const QString &id) const {
  const auto found = std::find_if(m_servers.begin(), m_servers.end(),
                                  [&](const SavedServer &server) { return server.id == id; });
  return found == m_servers.end() ? std::nullopt : std::optional(*found);
}

std::optional<SavedServer> ServerStore::current() const { return find(m_current); }

void ServerStore::setCurrent(const QString &id) {
  if (m_current == id || !find(id)) return;
  m_current = id;
  persist();
}

SavedServer ServerStore::save(const QUrl &url, const QJsonObject &user) {
  const QString avatarId = user.value(QLatin1String("avatarId")).toString();
  SavedServer server{
      .id = QUuid::createUuid().toString(QUuid::WithoutBraces),
      .url = url,
      .username = user.value(QLatin1String("username")).toString(),
      .displayName = user.value(QLatin1String("displayName")).toString(),
      // avatarPath() in the contract's paths.ts.
      .avatar = avatarId.isEmpty()
                    ? QString()
                    : QStringLiteral("/api/avatars/") +
                          QString::fromUtf8(QUrl::toPercentEncoding(avatarId)),
  };
  const auto existing = std::find_if(m_servers.begin(), m_servers.end(),
                                     [&](const SavedServer &saved) { return saved.url == url; });
  if (existing == m_servers.end()) {
    m_servers.append(server);
  } else {
    server.id = existing->id;
    *existing = server;
  }
  m_current = server.id;
  persist();
  return server;
}

void ServerStore::remove(const QString &id) {
  m_servers.removeIf([&](const SavedServer &server) { return server.id == id; });
  if (m_current == id) m_current = QString();
  persist();
}

QJsonObject ServerStore::toJson() const {
  QJsonArray servers;
  for (const SavedServer &server : m_servers) servers.append(server.toJson());
  return {{QStringLiteral("servers"), servers},
          {QStringLiteral("current"), current() ? QJsonValue(m_current)
                                                : QJsonValue(QJsonValue::Null)}};
}

void ServerStore::load() {
  QFile file(m_path);
  if (!file.open(QIODevice::ReadOnly)) return;
  const QJsonObject root = QJsonDocument::fromJson(file.readAll()).object();
  const QJsonArray servers = root.value(QLatin1String("servers")).toArray();
  for (const QJsonValue &entry : servers) {
    const QJsonObject object = entry.toObject();
    const SavedServer server{
        .id = object.value(QLatin1String("id")).toString(),
        .url = QUrl(object.value(QLatin1String("url")).toString()),
        .username = object.value(QLatin1String("username")).toString(),
        .displayName = object.value(QLatin1String("displayName")).toString(),
        .avatar = object.value(QLatin1String("avatar")).toString(),
    };
    if (server.id.isEmpty() || !server.url.isValid() || server.url.host().isEmpty()) {
      qCWarning(lcServers) << "Skipping a saved server that doesn't read";
      continue;
    }
    m_servers.append(server);
  }
  m_current = root.value(QLatin1String("current")).toString();
}

void ServerStore::persist() const {
  QSaveFile file(m_path);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(QJsonDocument(toJson()).toJson()) < 0 || !file.commit()) {
    qCWarning(lcServers) << "Couldn't save" << m_path << file.errorString();
  }
}
