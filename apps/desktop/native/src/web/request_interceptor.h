#pragma once

#include <QUrl>
#include <QWebEngineUrlRequestInterceptor>

// Signs the web app's requests in. The app's session is a bearer token,
// which the pages never see: this adds it to each request the server's own
// pages make to the server, and to nothing else.
class RequestInterceptor : public QWebEngineUrlRequestInterceptor {
  Q_OBJECT

public:
  explicit RequestInterceptor(QObject *parent = nullptr);

  // The server whose requests carry `token`. An empty token signs nothing.
  void setSession(const QUrl &server, const QString &token);

  void interceptRequest(QWebEngineUrlRequestInfo &info) override;

private:
  QUrl m_server;
  QByteArray m_authorization;
};
