#pragma once

#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QUrl>

#include <optional>

// A server the app is signed in to: SavedServer in the bridge protocol.
struct SavedServer {
  QString id;
  // The server's address without a path.
  QUrl url;
  QString username;
  QString displayName;
  // The user's picture as a path on the server. Empty without one.
  QString avatar;

  QJsonObject toJson() const;
};

// The servers the app is signed in to, in servers.json in the config
// directory. Their tokens are in the SecretStore, under each one's id.
class ServerStore : public QObject {
  Q_OBJECT

public:
  explicit ServerStore(QObject *parent = nullptr);

  const QList<SavedServer> &servers() const { return m_servers; }
  std::optional<SavedServer> find(const QString &id) const;
  // The one the app opens with.
  std::optional<SavedServer> current() const;
  void setCurrent(const QString &id);

  // Saves a sign-in. One for the same address replaces it and keeps its
  // id, so each server has one session.
  SavedServer save(const QUrl &url, const QJsonObject &user);
  void remove(const QString &id);

  QJsonObject toJson() const;

private:
  void load();
  void persist() const;

  QString m_path;
  QList<SavedServer> m_servers;
  QString m_current;
};
