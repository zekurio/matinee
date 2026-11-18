#include "web/shell_scheme.h"

#include <QFile>
#include <QFileInfo>
#include <QMimeDatabase>
#include <QWebEngineUrlRequestJob>
#include <QWebEngineUrlScheme>

namespace {

const QByteArray schemeName = QByteArrayLiteral("matinee-shell");
const QString host = QStringLiteral("app");
// Where CMake puts the built pages in the program's resources.
const QString root = QStringLiteral(":/shell");

// The pages load only what's built in with them, and talk to no server:
// the shell makes their requests for them.
const QByteArray contentSecurityPolicy = QByteArrayLiteral(
    "default-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'none'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'");

QByteArray contentType(const QString &path) {
  // The few kinds a built page has, by name: what the system's database
  // calls a script differs from one machine to the next, and a browser
  // only runs modules of a JavaScript type.
  const QString suffix = QFileInfo(path).suffix().toLower();
  if (suffix == QLatin1String("html")) return QByteArrayLiteral("text/html");
  if (suffix == QLatin1String("js") || suffix == QLatin1String("mjs")) {
    return QByteArrayLiteral("text/javascript");
  }
  if (suffix == QLatin1String("css")) return QByteArrayLiteral("text/css");
  if (suffix == QLatin1String("svg")) return QByteArrayLiteral("image/svg+xml");
  if (suffix == QLatin1String("json")) return QByteArrayLiteral("application/json");
  if (suffix == QLatin1String("woff2")) return QByteArrayLiteral("font/woff2");
  return QMimeDatabase().mimeTypeForFile(path, QMimeDatabase::MatchExtension).name().toUtf8();
}

} // namespace

ShellScheme::ShellScheme(QObject *parent) : QWebEngineUrlSchemeHandler(parent) {}

void ShellScheme::registerScheme() {
  QWebEngineUrlScheme scheme(schemeName);
  scheme.setSyntax(QWebEngineUrlScheme::Syntax::Host);
  scheme.setFlags(QWebEngineUrlScheme::SecureScheme | QWebEngineUrlScheme::CorsEnabled |
                  QWebEngineUrlScheme::FetchApiAllowed);
  QWebEngineUrlScheme::registerScheme(scheme);
}

QByteArray ShellScheme::scheme() { return schemeName; }

QUrl ShellScheme::entry() {
  QUrl url;
  url.setScheme(QString::fromLatin1(schemeName));
  url.setHost(host);
  url.setPath(QStringLiteral("/"));
  return url;
}

bool ShellScheme::owns(const QUrl &url) {
  return url.scheme() == QLatin1String(schemeName) && url.host() == host;
}

void ShellScheme::requestStarted(QWebEngineUrlRequestJob *job) {
  const QUrl url = job->requestUrl();
  if (job->requestMethod() != "GET" || !owns(url)) {
    job->fail(QWebEngineUrlRequestJob::RequestDenied);
    return;
  }
  QString path = url.path();
  // A resource path can't climb out of the pages' directory, but nothing
  // asks for one that tries either.
  if (path.contains(QLatin1String(".."))) {
    job->fail(QWebEngineUrlRequestJob::UrlInvalid);
    return;
  }
  if (path.isEmpty() || path.endsWith(QLatin1Char('/'))) {
    path += QStringLiteral("index.html");
  }
  auto *file = new QFile(root + path, job);
  if (!file->open(QIODevice::ReadOnly)) {
    job->fail(QWebEngineUrlRequestJob::UrlNotFound);
    return;
  }
  job->setAdditionalResponseHeaders(
      {{QByteArrayLiteral("Content-Security-Policy"), contentSecurityPolicy},
       {QByteArrayLiteral("X-Content-Type-Options"), QByteArrayLiteral("nosniff")}});
  job->reply(contentType(path), file);
}
