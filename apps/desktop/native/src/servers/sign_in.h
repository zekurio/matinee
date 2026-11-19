#pragma once

#include "servers/server_api.h"

#include <QJsonObject>
#include <QObject>
#include <QTcpServer>
#include <QTimer>

#include <functional>

// Signs the app in to a server, the two ways the server's README has
// under "Signing in apps". Either ends with a session of the app's own: a
// token, which goes to whoever listens for `approved` and nowhere else.
//
// `browser`: OAuth for native apps (RFC 8252) with PKCE. The system's
// browser opens the server's approval page, where passkeys and the OIDC
// provider work as on the web, and comes back to a port this listens on,
// on this machine only, with a code. Only this app holds the verifier the
// code was made for, so another program that catches it can't use it.
//
// `code`: the device grant (RFC 8628). The app shows a code to enter on
// the server's /link page, on any device, and asks the server until
// someone has.
class SignIn : public QObject {
  Q_OBJECT

public:
  enum class Method { Browser, Code };
  enum class Failure { Expired, Denied, Unreachable, Failed };

  SignIn(ServerApi *api, QObject *parent = nullptr);

  // Starts signing in to `server`, ending a sign-in that runs. `started`
  // gets a SignInStarted of the bridge protocol, or an error for the log
  // when it couldn't start.
  void start(const QUrl &server, Method method,
             std::function<void(const QJsonObject &started, const QString &error)> started);
  // Ends a sign-in that runs, without a result.
  void cancel();

Q_SIGNALS:
  // `user` is the contract's User.
  void approved(const QUrl &server, const QString &token, const QJsonObject &user);
  void failed(SignIn::Failure reason, const QString &message);

private:
  void startBrowser(std::function<void(const QJsonObject &, const QString &)> started);
  void startCode(std::function<void(const QJsonObject &, const QString &)> started);
  void acceptCallback();
  void redeem(const QString &code);
  void poll();
  void finish(const ApiResponse &session);
  void fail(Failure reason, const QString &message = {});
  void reset();

  ServerApi *m_api;
  // Tells one sign-in's late answers from the next one's.
  int m_attempt = 0;
  bool m_running = false;
  QUrl m_server;

  QTcpServer m_listener;
  QString m_verifier;
  QString m_state;
  QTimer m_deadline;

  QString m_deviceCode;
  QTimer m_pollTimer;
  int m_pollFailures = 0;
};
