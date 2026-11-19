#include "servers/discovery.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkDatagram>
#include <QNetworkInterface>
#include <QTimer>

namespace {

// From packages/contracts/src/discovery.ts.
constexpr quint16 discoveryPort = 8421;
constexpr qsizetype maxBytes = 512;
constexpr int maxNameLength = 64;
constexpr int maxUrlLength = 400;

// The README's "A three-second scan is enough."
constexpr int scanMs = 3000;

QByteArray probe() {
  return QByteArrayLiteral("Matinee discovery v1").leftJustified(maxBytes, ' ');
}

} // namespace

Discovery::Discovery(ServerApi *api, QObject *parent) : QObject(parent), m_api(api) {
  connect(&m_socket, &QUdpSocket::readyRead, this, &Discovery::readReplies);
}

void Discovery::scan(std::function<void(const QList<DiscoveredServer> &servers)> done) {
  m_waiting.append(std::move(done));
  if (m_scanning) return;
  m_scanning = true;
  m_replies.clear();
  m_found.clear();

  if (m_socket.state() != QAbstractSocket::BoundState &&
      !m_socket.bind(QHostAddress(QHostAddress::AnyIPv4), 0)) {
    finish();
    return;
  }
  const QByteArray datagram = probe();
  // Every network's broadcast address, and this machine itself, where a
  // broadcast's answer often doesn't get back through the firewall.
  QSet<QHostAddress> targets = {QHostAddress(QHostAddress::Broadcast),
                                QHostAddress(QHostAddress::LocalHost)};
  const QList<QNetworkInterface> interfaces = QNetworkInterface::allInterfaces();
  for (const QNetworkInterface &interface : interfaces) {
    const auto flags = interface.flags();
    if (!flags.testFlag(QNetworkInterface::IsUp) ||
        !flags.testFlag(QNetworkInterface::CanBroadcast) ||
        flags.testFlag(QNetworkInterface::IsLoopBack)) {
      continue;
    }
    const QList<QNetworkAddressEntry> entries = interface.addressEntries();
    for (const QNetworkAddressEntry &entry : entries) {
      if (!entry.broadcast().isNull()) targets.insert(entry.broadcast());
    }
  }
  for (const QHostAddress &target : std::as_const(targets)) {
    m_socket.writeDatagram(datagram, target, discoveryPort);
  }
  QTimer::singleShot(scanMs, this, &Discovery::finish);
}

void Discovery::readReplies() {
  while (m_socket.hasPendingDatagrams()) {
    const QByteArray data = m_socket.receiveDatagram(maxBytes + 1).data();
    if (!m_scanning || data.size() > maxBytes) continue;
    const QJsonObject reply = QJsonDocument::fromJson(data).object();
    if (reply.value(QLatin1String("version")).toInt() != 1) continue;
    const QString name = reply.value(QLatin1String("name")).toString().trimmed();
    const QString address = reply.value(QLatin1String("url")).toString();
    const QUrl url(address, QUrl::StrictMode);
    if (name.isEmpty() || name.size() > maxNameLength ||
        address.size() > maxUrlLength || !url.isValid() || url.host().isEmpty() ||
        !url.userInfo().isEmpty() ||
        (url.scheme() != QLatin1String("http") &&
         url.scheme() != QLatin1String("https"))) {
      continue;
    }
    m_replies.insert(url, name);
  }
}

void Discovery::finish() {
  m_unchecked = static_cast<int>(m_replies.size());
  if (m_unchecked == 0) {
    checked();
    return;
  }
  for (auto it = m_replies.cbegin(); it != m_replies.cend(); ++it) {
    const QString name = it.value();
    m_api->probe(it.key(), [this, name](const ProbeResult &result) {
      const bool known =
          std::any_of(m_found.cbegin(), m_found.cend(),
                      [&](const DiscoveredServer &server) { return server.url == result.url; });
      if (result.outcome == ProbeResult::Outcome::Server && !known) {
        m_found.append({name, result.url});
      }
      --m_unchecked;
      checked();
    });
  }
}

void Discovery::checked() {
  if (m_unchecked > 0) return;
  m_scanning = false;
  const auto waiting = std::exchange(m_waiting, {});
  for (const auto &done : waiting) done(m_found);
}
