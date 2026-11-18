#include "servers/sign_in.h"

#include <QCryptographicHash>
#include <QDesktopServices>
#include <QLocale>
#include <QLoggingCategory>
#include <QRandomGenerator>
#include <QSysInfo>
#include <QTcpSocket>
#include <QUrlQuery>

Q_LOGGING_CATEGORY(lcSignIn, "matinee.signin")

namespace {

// The contract's REST paths, under OPENAPI_PATH, and the page from
// paths.ts.
const QString tokenPath = QStringLiteral("/api/v1/auth/app/token");
const QString devicePath = QStringLiteral("/api/v1/auth/device");
const QString devicePollPath = QStringLiteral("/api/v1/auth/device/token");
const QString authorizePagePath = QStringLiteral("/authorize");
const QString callbackPath = QStringLiteral("/callback");

// How long the approval page may stay open before the app stops waiting.
// The device grant's codes last ten minutes on the server; the browser
// gets the same.
constexpr int browserDeadlineMs = 10 * 60 * 1000;

// How many polls in a row may get no answer before the server counts as
// gone.
constexpr int maxPollFailures = 5;

// The contract's DeviceName takes at most 64 characters.
constexpr int maxDeviceNameLength = 64;

// RFC 7636's unreserved characters, without the ones a URL might mangle.
QString randomText(int length) {
  static const QLatin1String alphabet(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
  QString text;
  text.reserve(length);
  for (int i = 0; i < length; ++i) {
    text.append(QLatin1Char(alphabet[QRandomGenerator::system()->bounded(alphabet.size())]));
  }
  return text;
}

QString platform() {
#if defined(Q_OS_WIN)
  return QStringLiteral("windows");
#elif defined(Q_OS_MACOS)
  return QStringLiteral("macos");
#else
  return QStringLiteral("linux");
#endif
}

QString deviceName() { return QSysInfo::machineHostName().left(maxDeviceNameLength); }

// The page the browser shows once it has brought the code back.
QByteArray callbackPage(bool accepted) {
  const bool german = QLocale::system().language() == QLocale::German;
  const QString title = accepted ? (german ? QStringLiteral("Angemeldet")
                                           : QStringLiteral("Signed in"))
                                 : (german ? QStringLiteral("Anmeldung fehlgeschlagen")
                                           : QStringLiteral("Sign-in failed"));
  const QString text =
      accepted ? (german ? QStringLiteral("Du kannst diesen Tab schließen und zu Matinee zurückkehren.")
                         : QStringLiteral("You can close this tab and go back to Matinee."))
               : (german ? QStringLiteral("Dieser Link gehört zu keiner laufenden Anmeldung. Starte sie in Matinee neu.")
                         : QStringLiteral("This link isn't for a sign-in that's running. Start again in Matinee."));
  const QByteArray body =
      QStringLiteral(
          "<!doctype html><html lang=\"%1\"><meta charset=\"utf-8\">"
          "<meta name=\"viewport\" content=\"width=device-width\">"
          "<meta name=\"color-scheme\" content=\"light dark\"><title>%2</title>"
          "<body style=\"font:16px system-ui,sans-serif;display:grid;"
          "place-content:center;min-height:100vh;margin:0;text-align:center\">"
          "<h1 style=\"font-size:20px\">%2</h1><p>%3</p></body></html>")
          .arg(german ? QStringLiteral("de") : QStringLiteral("en"), title, text)
          .toUtf8();
  return (accepted ? QByteArrayLiteral("HTTP/1.1 200 OK\r\n")
                   : QByteArrayLiteral("HTTP/1.1 400 Bad Request\r\n")) +
         "Content-Type: text/html; charset=utf-8\r\nContent-Length: " +
         QByteArray::number(body.size()) +
         "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" + body;
}

} // namespace

SignIn::SignIn(ServerApi *api, QObject *parent) : QObject(parent), m_api(api) {
  m_deadline.setSingleShot(true);
  connect(&m_deadline, &QTimer::timeout, this, [this] { fail(Failure::Expired); });
  m_pollTimer.setSingleShot(true);
  connect(&m_pollTimer, &QTimer::timeout, this, &SignIn::poll);
  connect(&m_listener, &QTcpServer::newConnection, this, &SignIn::acceptCallback);
}

void SignIn::start(const QUrl &server, Method method,
                   std::function<void(const QJsonObject &, const QString &)> started) {
  reset();
  m_running = true;
  m_server = server;
  if (method == Method::Browser) startBrowser(std::move(started));
  else startCode(std::move(started));
}

void SignIn::cancel() { reset(); }

void SignIn::startBrowser(std::function<void(const QJsonObject &, const QString &)> started) {
  // Only this machine can reach it, and the system picks a free port.
  if (!m_listener.listen(QHostAddress::LocalHost, 0)) {
    reset();
    started({}, QStringLiteral("Couldn't listen for the browser: ") + m_listener.errorString());
    return;
  }
  m_verifier = randomText(64);
  m_state = randomText(32);
  const QByteArray challenge =
      QCryptographicHash::hash(m_verifier.toLatin1(), QCryptographicHash::Sha256)
          .toBase64(QByteArray::Base64UrlEncoding | QByteArray::OmitTrailingEquals);

  QUrlQuery query;
  query.addQueryItem(QStringLiteral("redirect_uri"),
                     QStringLiteral("http://127.0.0.1:%1%2")
                         .arg(m_listener.serverPort())
                         .arg(callbackPath));
  query.addQueryItem(QStringLiteral("state"), m_state);
  query.addQueryItem(QStringLiteral("code_challenge"), QString::fromLatin1(challenge));
  query.addQueryItem(QStringLiteral("code_challenge_method"), QStringLiteral("S256"));
  query.addQueryItem(QStringLiteral("platform"), platform());
  if (const QString name = deviceName(); !name.isEmpty()) {
    query.addQueryItem(QStringLiteral("device_name"),
                       QString::fromLatin1(QUrl::toPercentEncoding(name)));
  }
  QUrl page = serverUrl(m_server, authorizePagePath);
  page.setQuery(query);

  m_deadline.start(browserDeadlineMs);
  if (!QDesktopServices::openUrl(page)) {
    // The page shows the address, for the person to open themselves.
    qCWarning(lcSignIn) << "No browser opened for the sign-in";
  }
  started({{QStringLiteral("method"), QStringLiteral("browser")},
           {QStringLiteral("url"), page.toString(QUrl::FullyEncoded)}},
          {});
}

void SignIn::acceptCallback() {
  while (QTcpSocket *socket = m_listener.nextPendingConnection()) {
    connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
      if (!socket->canReadLine()) return;
      // "GET /callback?code=…&state=… HTTP/1.1"
      const QList<QByteArray> request = socket->readLine().split(' ');
      const QUrl target = request.size() >= 2 ? QUrl::fromEncoded(request.at(1)) : QUrl();
      const QUrlQuery query(target);
      const QString code = query.queryItemValue(QStringLiteral("code"));
      const bool ours = m_running && !m_state.isEmpty() &&
                        request.value(0) == "GET" && target.path() == callbackPath &&
                        query.queryItemValue(QStringLiteral("state")) == m_state &&
                        !code.isEmpty();
      socket->write(callbackPage(ours));
      socket->disconnectFromHost();
      // Anything else on the port isn't the server's answer, so the
      // sign-in keeps waiting for it.
      if (!ours) return;
      // One answer per sign-in.
      m_state = QString();
      m_listener.close();
      redeem(code);
    });
  }
}

void SignIn::redeem(const QString &code) {
  const int attempt = m_attempt;
  m_api->post(m_server, tokenPath,
              {{QStringLiteral("code"), code}, {QStringLiteral("codeVerifier"), m_verifier}},
              [this, attempt](const ApiResponse &response) {
                if (attempt != m_attempt) return;
                if (!response.reached) fail(Failure::Unreachable);
                else if (!response.ok()) fail(Failure::Denied, response.message);
                else finish(response);
              });
}

void SignIn::startCode(std::function<void(const QJsonObject &, const QString &)> started) {
  const int attempt = m_attempt;
  QJsonObject device{{QStringLiteral("platform"), platform()}};
  if (const QString name = deviceName(); !name.isEmpty()) {
    device.insert(QStringLiteral("name"), name);
  }
  m_api->post(m_server, devicePath, device,
              [this, attempt, started = std::move(started)](const ApiResponse &response) {
                if (attempt != m_attempt) return;
                const QJsonObject code = response.body.toObject();
                m_deviceCode = code.value(QLatin1String("deviceCode")).toString();
                const int interval = code.value(QLatin1String("interval")).toInt();
                if (!response.ok() || m_deviceCode.isEmpty() || interval <= 0) {
                  reset();
                  started({}, response.reached
                                  ? QStringLiteral("The server gave no code: ") + response.message
                                  : QStringLiteral("The server didn't answer"));
                  return;
                }
                m_pollFailures = 0;
                m_pollTimer.setInterval(interval * 1000);
                m_pollTimer.start();
                started({{QStringLiteral("method"), QStringLiteral("code")},
                         {QStringLiteral("userCode"), code.value(QLatin1String("userCode"))},
                         {QStringLiteral("verificationUri"),
                          code.value(QLatin1String("verificationUri"))},
                         {QStringLiteral("verificationUriComplete"),
                          code.value(QLatin1String("verificationUriComplete"))},
                         {QStringLiteral("expiresIn"), code.value(QLatin1String("expiresIn"))}},
                        {});
              });
}

void SignIn::poll() {
  const int attempt = m_attempt;
  m_api->post(m_server, devicePollPath, {{QStringLiteral("deviceCode"), m_deviceCode}},
              [this, attempt](const ApiResponse &response) {
                if (attempt != m_attempt) return;
                if (!response.reached) {
                  if (++m_pollFailures >= maxPollFailures) fail(Failure::Unreachable);
                  else m_pollTimer.start();
                  return;
                }
                m_pollFailures = 0;
                // The server answers 404 once the code ran out.
                if (response.status == 404) {
                  fail(Failure::Expired);
                } else if (!response.ok()) {
                  fail(Failure::Failed, response.message);
                } else if (response.body.toObject().value(QLatin1String("status")).toString() ==
                           QLatin1String("approved")) {
                  finish(response);
                } else {
                  m_pollTimer.start();
                }
              });
}

void SignIn::finish(const ApiResponse &session) {
  const QJsonObject body = session.body.toObject();
  const QString token = body.value(QLatin1String("token")).toString();
  const QJsonObject user = body.value(QLatin1String("user")).toObject();
  if (token.isEmpty() || user.value(QLatin1String("username")).toString().isEmpty()) {
    fail(Failure::Failed);
    return;
  }
  const QUrl server = m_server;
  reset();
  Q_EMIT approved(server, token, user);
}

void SignIn::fail(Failure reason, const QString &message) {
  if (!m_running) return;
  reset();
  Q_EMIT failed(reason, message);
}

void SignIn::reset() {
  ++m_attempt;
  m_running = false;
  m_listener.close();
  m_deadline.stop();
  m_pollTimer.stop();
  m_verifier = QString();
  m_state = QString();
  m_deviceCode = QString();
}
