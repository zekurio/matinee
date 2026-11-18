#include "servers/server_api.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>

namespace {

// HEALTH_PATH in the contract's paths.ts.
const QString healthPath = QStringLiteral("/api/health");

constexpr int timeoutMs = 10'000;

int effectivePort(const QUrl &url) {
  return url.port(url.scheme() == QLatin1String("https") ? 443 : 80);
}

// The address without a path, or an empty URL when it isn't an http or
// https address of a host.
QUrl origin(const QUrl &url) {
  const QString scheme = url.scheme().toLower();
  if (!url.isValid() || url.host().isEmpty() ||
      (scheme != QLatin1String("http") && scheme != QLatin1String("https"))) {
    return {};
  }
  QUrl result;
  result.setScheme(scheme);
  result.setHost(url.host().toLower());
  result.setPort(url.port());
  return result;
}

} // namespace

QUrl serverUrl(const QUrl &server, const QString &path) {
  return server.resolved(QUrl(path));
}

bool sameOrigin(const QUrl &a, const QUrl &b) {
  return a.scheme().compare(b.scheme(), Qt::CaseInsensitive) == 0 &&
         a.host().compare(b.host(), Qt::CaseInsensitive) == 0 &&
         effectivePort(a) == effectivePort(b);
}

ServerApi::ServerApi(const QString &userAgent, QObject *parent)
    : QObject(parent), m_userAgent(userAgent) {
  m_network.setTransferTimeout(timeoutMs);
}

void ServerApi::get(const QUrl &server, const QString &path, Done done,
                    const QString &token) {
  QNetworkRequest request(serverUrl(server, path));
  request.setHeader(QNetworkRequest::UserAgentHeader, m_userAgent);
  if (!token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
  }
  send(m_network.get(request), std::move(done));
}

void ServerApi::post(const QUrl &server, const QString &path,
                     const QJsonObject &body, Done done, const QString &token) {
  QNetworkRequest request(serverUrl(server, path));
  request.setHeader(QNetworkRequest::UserAgentHeader, m_userAgent);
  request.setHeader(QNetworkRequest::ContentTypeHeader,
                    QByteArrayLiteral("application/json"));
  if (!token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
  }
  send(m_network.post(request, QJsonDocument(body).toJson(QJsonDocument::Compact)),
       std::move(done));
}

void ServerApi::send(QNetworkReply *reply, Done done) {
  connect(reply, &QNetworkReply::finished, this, [reply, done = std::move(done)] {
    reply->deleteLater();
    ApiResponse response;
    response.status =
        reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    response.reached = response.status != 0;
    const QJsonDocument json = QJsonDocument::fromJson(reply->readAll());
    if (json.isObject()) response.body = json.object();
    else if (json.isArray()) response.body = json.array();
    if (!response.ok()) {
      response.message = response.body.toObject().value(QLatin1String("message")).toString();
    }
    done(response);
  });
}

void ServerApi::probe(const QString &address,
                      std::function<void(const ProbeResult &result)> done) {
  const QString typed = address.trimmed();
  QList<QUrl> candidates;
  if (typed.contains(QLatin1String("://"))) {
    candidates.append(origin(QUrl(typed, QUrl::StrictMode)));
  } else {
    candidates.append(origin(QUrl(QStringLiteral("https://") + typed, QUrl::StrictMode)));
    candidates.append(origin(QUrl(QStringLiteral("http://") + typed, QUrl::StrictMode)));
  }
  candidates.removeIf([](const QUrl &url) { return url.isEmpty(); });
  if (typed.isEmpty() || candidates.isEmpty()) {
    done({ProbeResult::Outcome::Invalid, {}});
    return;
  }
  probeNext(candidates, false, std::move(done));
}

void ServerApi::probe(const QUrl &server,
                      std::function<void(const ProbeResult &result)> done) {
  const QUrl address = origin(server);
  if (address.isEmpty()) {
    done({ProbeResult::Outcome::Invalid, {}});
    return;
  }
  probeNext({address}, false, std::move(done));
}

void ServerApi::probeNext(QList<QUrl> candidates, bool anyAnswered,
                          std::function<void(const ProbeResult &result)> done) {
  if (candidates.isEmpty()) {
    done({anyAnswered ? ProbeResult::Outcome::NotMatinee
                      : ProbeResult::Outcome::Unreachable,
          {}});
    return;
  }
  const QUrl candidate = candidates.takeFirst();
  QNetworkRequest request(serverUrl(candidate, healthPath));
  request.setHeader(QNetworkRequest::UserAgentHeader, m_userAgent);
  QNetworkReply *reply = m_network.get(request);
  connect(reply, &QNetworkReply::finished, this,
          [this, reply, candidates, anyAnswered, done = std::move(done)]() mutable {
            reply->deleteLater();
            const int status =
                reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
            const QJsonObject body = QJsonDocument::fromJson(reply->readAll()).object();
            if (status == 200 && body.value(QLatin1String("ok")).toBool()) {
              // A proxy may have sent the request on to https, and then
              // that is where the server is.
              done({ProbeResult::Outcome::Server, origin(reply->url())});
              return;
            }
            probeNext(candidates, anyAnswered || status != 0, std::move(done));
          });
}
