#pragma once

#include "servers/server_api.h"

#include <QObject>
#include <QSet>
#include <QUdpSocket>

#include <functional>

struct DiscoveredServer {
  QString name;
  QUrl url;
};

// Finds servers on the local network, by the broadcast the server's README
// describes under "Local server discovery" and the constants in the
// contract's discovery.ts. Anyone on the network can answer, so each
// address is checked to be a server before it's offered, and nothing here
// ever signs in.
class Discovery : public QObject {
  Q_OBJECT

public:
  Discovery(ServerApi *api, QObject *parent = nullptr);

  // Broadcasts, listens for a few seconds, and calls `done` with the
  // servers that answered and passed the check. A scan already running
  // answers both callers.
  void scan(std::function<void(const QList<DiscoveredServer> &servers)> done);

private:
  void readReplies();
  void finish();
  void checked();

  ServerApi *m_api;
  QUdpSocket m_socket;
  bool m_scanning = false;
  QList<std::function<void(const QList<DiscoveredServer> &servers)>> m_waiting;
  // What answered the broadcast, by address.
  QHash<QUrl, QString> m_replies;
  QList<DiscoveredServer> m_found;
  int m_unchecked = 0;
};
