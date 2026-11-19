#pragma once

#include <QJsonObject>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QObject>
#include <QUrl>

#include <functional>

// A server's answer to a request the shell made itself.
struct ApiResponse {
  // False when nothing answered: no connection, no such host, a timeout.
  bool reached = false;
  int status = 0;
  // The JSON it sent. Null for none, and for anything that isn't JSON.
  QJsonValue body;
  // The server's own words for an error, for the person to read.
  QString message;

  bool ok() const { return reached && status >= 200 && status < 300; }
};

// What an address turned out to be.
struct ProbeResult {
  enum class Outcome { Server, Invalid, Unreachable, NotMatinee };

  Outcome outcome = Outcome::Invalid;
  // The server's address without a path, when it is one.
  QUrl url;
};

// The requests the shell makes to a server itself, outside the web view:
// checking that an address is a server, and signing in and out. They use
// the REST API, whose paths the contract sets under /api/v1.
class ServerApi : public QObject {
  Q_OBJECT

public:
  using Done = std::function<void(const ApiResponse &response)>;

  ServerApi(const QString &userAgent, QObject *parent = nullptr);

  QNetworkAccessManager *network() { return &m_network; }

  // `path` is a path on `server`, like `/api/health`.
  void get(const QUrl &server, const QString &path, Done done,
           const QString &token = {});
  void post(const QUrl &server, const QString &path, const QJsonObject &body,
            Done done, const QString &token = {});

  // Checks what a person typed: with a scheme that address, without one
  // https and then http.
  void probe(const QString &address,
             std::function<void(const ProbeResult &result)> done);
  // Checks one address, for one that's already a URL.
  void probe(const QUrl &server, std::function<void(const ProbeResult &result)> done);

private:
  void send(QNetworkReply *reply, Done done);
  void probeNext(QList<QUrl> candidates, bool anyAnswered,
                 std::function<void(const ProbeResult &result)> done);

  QNetworkAccessManager m_network;
  QString m_userAgent;
};

// The address of `path` on `server`.
QUrl serverUrl(const QUrl &server, const QString &path);

// Whether both are the same scheme, host, and port: one origin, as a
// browser has it.
bool sameOrigin(const QUrl &a, const QUrl &b);
