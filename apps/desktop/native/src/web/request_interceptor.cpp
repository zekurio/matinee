#include "web/request_interceptor.h"

#include "servers/server_api.h"

RequestInterceptor::RequestInterceptor(QObject *parent)
    : QWebEngineUrlRequestInterceptor(parent) {}

void RequestInterceptor::setSession(const QUrl &server, const QString &token) {
  m_server = server;
  m_authorization = token.isEmpty() ? QByteArray() : "Bearer " + token.toUtf8();
}

void RequestInterceptor::interceptRequest(QWebEngineUrlRequestInfo &info) {
  if (m_authorization.isEmpty()) return;
  // To the server, from a page of the server. A page from anywhere else
  // that got into the view can't borrow the session.
  if (!sameOrigin(info.requestUrl(), m_server) ||
      !sameOrigin(info.firstPartyUrl(), m_server)) {
    return;
  }
  info.setHttpHeader(QByteArrayLiteral("Authorization"), m_authorization);
}
