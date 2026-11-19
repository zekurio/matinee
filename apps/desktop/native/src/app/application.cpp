#include "app/application.h"

#include "app/paths.h"
#include "os/media_controls.h"
#include "player/mpv_player.h"
#include "player/video_output.h"
#include "servers/discovery.h"
#include "servers/secret_store.h"
#include "servers/server_api.h"
#include "servers/sign_in.h"
#include "version.h"
#include "web/request_interceptor.h"
#include "web/shell_scheme.h"

#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QLoggingCategory>
#include <QNetworkReply>
#include <QQmlContext>
#include <QQuickWebEngineDownloadRequest>
#include <QQuickWebEngineProfile>
#include <QQuickWindow>
#include <QSaveFile>
#include <QScreen>
#include <QStandardPaths>
#include <QTimer>
#include <QtWebEngineCore/qtwebenginecoreglobal.h>

Q_LOGGING_CATEGORY(lcApp, "matinee.app")
Q_LOGGING_CATEGORY(lcPage, "matinee.page")

namespace {

// The contract's REST path for ending the session a request carries.
const QString signOutPath = QStringLiteral("/api/v1/auth/sign-out");

// How long a crashed page gets before it's loaded again, so a page that
// crashes on load doesn't spin.
constexpr int reloadAfterCrashMs = 1000;

QString platformName() {
#if defined(Q_OS_WIN)
  return QStringLiteral("windows");
#elif defined(Q_OS_MACOS)
  return QStringLiteral("macos");
#else
  return QStringLiteral("linux");
#endif
}

QString resourceText(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    qCCritical(lcApp) << "Missing from the program:" << path;
    return {};
  }
  return QString::fromUtf8(file.readAll());
}

QJsonValue orNull(const std::optional<SavedServer> &server) {
  return server ? QJsonValue(server->toJson()) : QJsonValue(QJsonValue::Null);
}

std::optional<PlayerSubtitle> subtitleFrom(const QJsonValue &value, const QUrl &server) {
  if (value.isNull()) return PlayerSubtitle{};
  const QJsonObject object = value.toObject();
  const QString kind = object.value(QLatin1String("kind")).toString();
  if (kind == QLatin1String("stream")) {
    const QJsonValue index = object.value(QLatin1String("index"));
    if (!index.isDouble() || index.toInt() < 0) return std::nullopt;
    return PlayerSubtitle{PlayerSubtitle::Kind::Stream, index.toInt(), {}};
  }
  if (kind == QLatin1String("external")) {
    const QJsonValue path = object.value(QLatin1String("url"));
    const QUrl url = serverUrl(server, path.toString());
    if (!path.isString() || !sameOrigin(url, server)) return std::nullopt;
    return PlayerSubtitle{PlayerSubtitle::Kind::External, 0, url};
  }
  return std::nullopt;
}

} // namespace

Application::Application(const Options &options, QObject *parent)
    : QObject(parent), m_options(options), m_settings(new Settings(this)),
      m_servers(new ServerStore(this)), m_secrets(new SecretStore(this)),
      m_bridge(new Bridge(this)), m_player(new MpvPlayer(this)),
      m_mediaControls(MediaControls::create(this)) {}

Application::~Application() {
  // The window goes first: closing it frees mpv's render context on the
  // render thread, which has to happen before mpv itself goes.
  m_sleep.reset();
  m_engine.reset();
  delete m_output;
  delete m_player;
}

bool Application::start() {
  if (!m_player->start(m_settings->values(), m_options.verbose)) return false;
  const bool underWindow = VideoOutput::underWindow(*m_player);
  if (underWindow) {
    m_player->presentUnderWindow();
    // Where the window shows the video through itself, that takes an
    // alpha channel, asked for before the window is made.
    m_videoUnderWindow = VideoOutput::showsThroughWindow();
    if (m_videoUnderWindow) QQuickWindow::setDefaultAlphaBuffer(true);
  } else {
    // mpv draws into the window with OpenGL, so Qt Quick has to draw the
    // window with it too, whatever it would pick for the system.
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);
  }
  qCInfo(lcApp) << "Video shows" << (underWindow ? "under the window" : "in the window");

  if (qEnvironmentVariableIsSet("MATINEE_WEB_APP")) {
    m_webApp = QUrl(qEnvironmentVariable("MATINEE_WEB_APP"), QUrl::StrictMode);
    qCWarning(lcApp).noquote() << "Showing the web app at" << m_webApp.toString()
                               << "in place of each server's own";
  }

  setUpProfile();
  m_api = new ServerApi(m_userAgent, this);
  m_discovery = new Discovery(m_api, this);
  m_signIn = new SignIn(m_api, this);
  registerMethods();

  m_engine = std::make_unique<QQmlApplicationEngine>();
  m_engine->rootContext()->setContextProperty(QStringLiteral("app"), this);
  m_engine->load(QUrl(QStringLiteral("qrc:/qml/Main.qml")));
  m_window = m_engine->rootObjects().isEmpty()
                 ? nullptr
                 : qobject_cast<QQuickWindow *>(m_engine->rootObjects().constFirst());
  if (!m_window) {
    qCCritical(lcApp) << "The window didn't load";
    return false;
  }

  m_output = VideoOutput::create(m_player, m_window);
  connect(m_output, &VideoOutput::readyChanged, m_player, &MpvPlayer::setRenderReady);

  connect(m_player, &MpvPlayer::stateChanged, this, [this](const QJsonObject &patch) {
    const PlayerState &state = m_player->state();
    m_output->setActive(state.phase != PlayerState::Phase::Idle &&
                        state.phase != PlayerState::Phase::Failed);
    m_mediaControls->setState(state);
    m_bridge->emitEvent(QStringLiteral("player.state"), patch, Bridge::Scope::Web);
  });
  m_sleep = std::make_unique<SleepInhibitor>(m_window);
  connect(m_player, &MpvPlayer::pictureChanged, this, [this](bool hasPicture) {
    m_videoShown = hasPicture;
    Q_EMIT videoShownChanged();
  });
  connect(m_player, &MpvPlayer::playingChanged, this,
          [this](bool playing) { m_sleep->setActive(playing); });

  connect(m_mediaControls, &MediaControls::action, this, [this](const QJsonObject &action) {
    m_bridge->emitEvent(QStringLiteral("media.action"), action, Bridge::Scope::Web);
  });
  connect(m_mediaControls, &MediaControls::raiseRequested, this, &Application::activate);
  connect(m_mediaControls, &MediaControls::quitRequested, qApp, &QCoreApplication::quit,
          Qt::QueuedConnection);

  connect(m_settings, &Settings::changed, this, [this](const DesktopSettings &values) {
    m_player->applySettings(values);
    Q_EMIT scaleChanged();
    m_bridge->emitEvent(QStringLiteral("settings.changed"), values.toJson(),
                        Bridge::Scope::Both);
  });

  const auto followScreen = [this] {
    if (const QScreen *screen = m_window->screen()) {
      m_player->setDisplayRefreshRate(screen->refreshRate());
    }
  };
  connect(m_window, &QQuickWindow::screenChanged, this, followScreen);
  followScreen();

  const WindowPlacement placement = m_settings->window();
  if (placement.geometry.isValid()) m_window->setGeometry(placement.geometry);
  if (m_options.fullscreen || m_settings->values().startFullscreen) {
    m_wasMaximized = placement.maximized;
    m_window->showFullScreen();
  } else if (placement.maximized) {
    m_window->showMaximized();
  } else {
    m_window->show();
  }

  if (const std::optional<SavedServer> server = m_servers->current()) openServer(*server);
  else showShell(ShellReason::Welcome, std::nullopt);
  return true;
}

void Application::activate() {
  if (!m_window) return;
  if (m_window->visibility() == QWindow::Minimized) m_window->showNormal();
  m_window->raise();
  m_window->requestActivate();
}

void Application::setUpProfile() {
  m_profile = new QQuickWebEngineProfile(QStringLiteral("matinee"), this);
  m_profile->setPersistentStoragePath(
      QDir(paths::data()).filePath(QStringLiteral("web")));
  m_profile->setCachePath(QDir(paths::cache()).filePath(QStringLiteral("web")));
  m_profile->setPersistentCookiesPolicy(QQuickWebEngineProfile::AllowPersistentCookies);
  // The server tells its clients apart by this, for the sessions list and
  // the statistics, and mpv sends the same.
  m_userAgent = m_profile->httpUserAgent() +
                QStringLiteral(" MatineeDesktop/" MATINEE_VERSION);
  m_profile->setHttpUserAgent(m_userAgent);

  m_interceptor = new RequestInterceptor(this);
  m_profile->setUrlRequestInterceptor(m_interceptor);
  m_profile->installUrlSchemeHandler(ShellScheme::scheme(), new ShellScheme(this));

  // The bridge's page end, which Main.qml puts in front of every page's
  // own scripts: Qt's channel code and transport.js, in a function, so
  // what they define stays out of the page's globals.
  m_transportScript =
      QStringLiteral("(() => {\n%1\nconst matineeBridgeProtocol = %2;\n%3\n})()")
          .arg(resourceText(QStringLiteral(":/qtwebchannel/qwebchannel.js")))
          .arg(MATINEE_BRIDGE_PROTOCOL)
          .arg(resourceText(QStringLiteral(":/bridge/transport.js")));

  // A file the web app offers to save goes to the downloads folder, under
  // a name that's free there.
  connect(m_profile, &QQuickWebEngineProfile::downloadRequested, this,
          [](QQuickWebEngineDownloadRequest *download) {
            download->setDownloadDirectory(
                QStandardPaths::writableLocation(QStandardPaths::DownloadLocation));
            download->accept();
          });
}

void Application::pageChanged(const QUrl &url) {
  const Bridge::Page page = ShellScheme::owns(url)
                                ? Bridge::Page::Shell
                                : m_server && sameOrigin(url, webAppUrl())
                                      ? Bridge::Page::Web
                                      : Bridge::Page::Other;
  if (page != m_bridge->page() && m_bridge->page() == Bridge::Page::Web) leavePlayer();
  m_bridge->setPage(page);
}

void Application::loadFailed(const QUrl &url, const QString &error) {
  qCWarning(lcApp).noquote() << "Couldn't load" << url.toString(QUrl::RemoveQuery) << error;
  // A page of the server that didn't load. One of the app's own can't
  // fail short of a broken build.
  if (m_server && sameOrigin(url, webAppUrl())) {
    showShell(ShellReason::Unreachable, m_server);
  }
}

bool Application::allowsNavigation(const QUrl &url) {
  if (ShellScheme::owns(url)) return true;
  if (m_server && sameOrigin(url, webAppUrl())) return true;
  // Everything else belongs in a browser, where its sign-ins and
  // extensions are.
  openExternally(url);
  return false;
}

void Application::openExternally(const QUrl &url) {
  const QString scheme = url.scheme();
  if (scheme == QLatin1String("http") || scheme == QLatin1String("https") ||
      scheme == QLatin1String("mailto")) {
    QDesktopServices::openUrl(url);
  }
}

void Application::setFullscreen(bool fullscreen) {
  if (!m_window) return;
  const bool is = m_window->visibility() == QWindow::FullScreen;
  if (fullscreen == is) return;
  if (fullscreen) {
    m_wasMaximized = m_window->visibility() == QWindow::Maximized;
    m_window->showFullScreen();
  } else if (m_wasMaximized) {
    m_window->showMaximized();
  } else {
    m_window->showNormal();
  }
}

void Application::showServers() { showShell(ShellReason::Servers, m_server); }

void Application::mediaKey(const QString &action) {
  m_bridge->emitEvent(QStringLiteral("media.action"),
                      QJsonObject{{QStringLiteral("action"), action}}, Bridge::Scope::Web);
}

void Application::pageCrashed(int status, int code) {
  qCWarning(lcApp) << "The page's process ended" << status << code;
  leavePlayer();
  // Whatever the view shows, loaded again.
  QTimer::singleShot(reloadAfterCrashMs, this, [this] {
    Q_EMIT navigate(m_server ? serverUrl(webAppUrl(), QStringLiteral("/"))
                             : ShellScheme::entry());
  });
}

void Application::pageLogged(int level, const QString &message, int line,
                             const QString &source) {
  // Info, warning, error, in WebEngineView's order.
  if (level >= 2) {
    qCWarning(lcPage).noquote() << message << QStringLiteral("(%1:%2)").arg(source).arg(line);
  } else {
    qCDebug(lcPage).noquote() << message << QStringLiteral("(%1:%2)").arg(source).arg(line);
  }
}

void Application::windowClosing() {
  if (!m_window) return;
  const QWindow::Visibility visibility = m_window->visibility();
  WindowPlacement placement = m_settings->window();
  // A full screen or maximized window's size isn't the size to come back
  // to, so the last one it had as a window stays.
  if (visibility == QWindow::Windowed) placement.geometry = m_window->geometry();
  placement.maximized = visibility == QWindow::Maximized ||
                        (visibility == QWindow::FullScreen && m_wasMaximized);
  m_settings->setWindow(placement);
}

void Application::openServer(const SavedServer &server) {
  m_secrets->read(server.id, [this, server](const QString &token) {
    if (token.isEmpty()) showShell(ShellReason::SignedOut, server);
    else connectTo(server, token);
  });
}

void Application::connectTo(const SavedServer &server, const QString &token) {
  m_server = server;
  m_token = token;
  m_servers->setCurrent(server.id);
  m_interceptor->setSession(webAppUrl(), token);
  m_player->setCredentials(m_userAgent, token);
  Q_EMIT navigate(serverUrl(webAppUrl(), QStringLiteral("/")));
}

QUrl Application::webAppUrl() const {
  if (m_webApp.isValid()) return m_webApp;
  return m_server ? m_server->url : QUrl();
}

void Application::showShell(ShellReason reason, const std::optional<SavedServer> &server) {
  leavePlayer();
  m_shellReason = reason;
  m_shellServer = server;
  m_server.reset();
  m_token = QString();
  m_interceptor->setSession({}, {});
  m_player->setCredentials(m_userAgent, {});
  Q_EMIT navigate(ShellScheme::entry());
}

void Application::leavePlayer() {
  m_player->stop();
  ++m_artworkRequest;
  m_mediaControls->setMetadata(std::nullopt);
}

QJsonObject Application::shellState() const {
  QString reason;
  switch (m_shellReason) {
  case ShellReason::Welcome:
    reason = QStringLiteral("welcome");
    break;
  case ShellReason::Servers:
    reason = QStringLiteral("servers");
    break;
  case ShellReason::SignedOut:
    reason = QStringLiteral("signed-out");
    break;
  case ShellReason::Unreachable:
    reason = QStringLiteral("unreachable");
    break;
  }
  return {{QStringLiteral("reason"), reason}, {QStringLiteral("server"), orNull(m_shellServer)}};
}

QJsonObject Application::appInfo() const {
  return {
      {QStringLiteral("version"), QStringLiteral(MATINEE_VERSION)},
      {QStringLiteral("protocol"), MATINEE_BRIDGE_PROTOCOL},
      {QStringLiteral("platform"), platformName()},
      {QStringLiteral("mpv"), m_player->version()},
      {QStringLiteral("qt"), QString::fromLatin1(qVersion())},
      {QStringLiteral("chromium"), QString::fromLatin1(qWebEngineChromiumVersion())},
      {QStringLiteral("features"), QJsonArray()},
  };
}

void Application::registerMethods() {
  using Scope = Bridge::Scope;

  m_bridge->handle(QStringLiteral("app.info"), Scope::Both,
                   [this](const Bridge::Call &call) { call.resolve(appInfo()); });
  m_bridge->handle(QStringLiteral("app.quit"), Scope::Both, [](const Bridge::Call &call) {
    call.resolve();
    // After the answer is on its way.
    QMetaObject::invokeMethod(qApp, &QCoreApplication::quit, Qt::QueuedConnection);
  });
  m_bridge->handle(QStringLiteral("settings.get"), Scope::Both,
                   [this](const Bridge::Call &call) {
                     call.resolve(m_settings->values().toJson());
                   });
  m_bridge->handle(QStringLiteral("settings.set"), Scope::Both,
                   [this](const Bridge::Call &call) {
                     if (!m_settings->apply(call.params())) {
                       call.invalid();
                       return;
                     }
                     call.resolve(m_settings->values().toJson());
                   });
  m_bridge->handle(QStringLiteral("settings.audioDevices"), Scope::Both,
                   [this](const Bridge::Call &call) {
                     QJsonArray devices;
                     const QList<AudioDevice> list = m_player->audioDevices();
                     for (const AudioDevice &device : list) {
                       devices.append(
                           QJsonObject{{QStringLiteral("name"), device.name},
                                       {QStringLiteral("description"), device.description}});
                     }
                     call.resolve(devices);
                   });

  registerPlayerMethods();
  registerServerMethods();
}

void Application::registerPlayerMethods() {
  using Scope = Bridge::Scope;

  m_bridge->handle(QStringLiteral("player.load"), Scope::Web, [this](const Bridge::Call &call) {
    const auto path = call.string(QLatin1String("url"));
    const auto start = call.number(QLatin1String("start"));
    const auto paused = call.boolean(QLatin1String("paused"));
    const auto delay = call.number(QLatin1String("subtitleDelay"));
    const QJsonValue audio = call.params().value(QLatin1String("audio"));
    if (!m_server || !path || !start || *start < 0 || !paused || !delay ||
        !(audio.isNull() || (audio.isDouble() && audio.toInt() >= 0))) {
      call.invalid();
      return;
    }
    // mpv opens far more than http: local files, devices, its own
    // playlists. A page only ever gets a path on its own server.
    const QUrl url = serverUrl(m_server->url, *path);
    const auto subtitle =
        subtitleFrom(call.params().value(QLatin1String("subtitle")), m_server->url);
    if (!sameOrigin(url, m_server->url) || !subtitle) {
      call.reject(Bridge::Error::Forbidden,
                  QStringLiteral("The app only plays from the server it's connected to."));
      return;
    }
    m_player->load({.url = url,
                    .start = *start,
                    .paused = *paused,
                    .audio = audio.isNull() ? std::nullopt : std::optional(audio.toInt()),
                    .subtitle = *subtitle,
                    .subtitleDelay = *delay});
    call.resolve();
  });
  m_bridge->handle(QStringLiteral("player.stop"), Scope::Web, [this](const Bridge::Call &call) {
    m_player->stop();
    call.resolve();
  });
  m_bridge->handle(QStringLiteral("player.state"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     call.resolve(m_player->state().toJson());
                   });
  m_bridge->handle(QStringLiteral("player.setPaused"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto paused = call.boolean(QLatin1String("paused"));
                     if (!paused) return call.invalid();
                     m_player->setPaused(*paused);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.seek"), Scope::Web, [this](const Bridge::Call &call) {
    const auto time = call.number(QLatin1String("time"));
    if (!time) return call.invalid();
    m_player->seek(std::max(0.0, *time));
    call.resolve();
  });
  m_bridge->handle(QStringLiteral("player.setSpeed"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto speed = call.number(QLatin1String("speed"));
                     if (!speed || *speed <= 0) return call.invalid();
                     m_player->setSpeed(*speed);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.setVolume"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto volume = call.number(QLatin1String("volume"));
                     const auto muted = call.boolean(QLatin1String("muted"));
                     if (!volume || !muted) return call.invalid();
                     m_player->setVolume(*volume, *muted);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.setAudio"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto index = call.number(QLatin1String("index"));
                     if (!index || *index < 0) return call.invalid();
                     m_player->setAudio(static_cast<int>(*index));
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.setSubtitle"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto subtitle = m_server
                                               ? subtitleFrom(call.params().value(
                                                                  QLatin1String("subtitle")),
                                                              m_server->url)
                                               : std::nullopt;
                     if (!subtitle) return call.invalid();
                     m_player->setSubtitle(*subtitle);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.setSubtitleDelay"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto seconds = call.number(QLatin1String("seconds"));
                     if (!seconds) return call.invalid();
                     m_player->setSubtitleDelay(*seconds);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.setSubtitleInset"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const auto bottom = call.number(QLatin1String("bottom"));
                     if (!bottom) return call.invalid();
                     m_player->setSubtitleInset(*bottom);
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("player.stats"), Scope::Web, [this](const Bridge::Call &call) {
    m_player->stats([call](const QJsonObject &stats) { call.resolve(stats); });
  });
  m_bridge->handle(QStringLiteral("media.setMetadata"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     const QJsonValue metadata = call.params().value(QLatin1String("metadata"));
                     if (metadata.isNull()) {
                       ++m_artworkRequest;
                       m_mediaControls->setMetadata(std::nullopt);
                     } else if (metadata.isObject() &&
                                metadata.toObject().value(QLatin1String("title")).isString()) {
                       setMediaMetadata(metadata.toObject());
                     } else {
                       return call.invalid();
                     }
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("shell.showServers"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     call.resolve();
                     showServers();
                   });
  m_bridge->handle(QStringLiteral("shell.signedOut"), Scope::Web,
                   [this](const Bridge::Call &call) {
                     call.resolve();
                     if (!m_server) return;
                     const SavedServer server = *m_server;
                     m_secrets->remove(server.id);
                     showShell(ShellReason::SignedOut, server);
                   });
}

void Application::setMediaMetadata(const QJsonObject &metadata) {
  const QJsonValue duration = metadata.value(QLatin1String("duration"));
  MediaMetadata media{
      .title = metadata.value(QLatin1String("title")).toString(),
      .subtitle = metadata.value(QLatin1String("subtitle")).toString(),
      .artworkFile = {},
      .duration = duration.isDouble() ? std::optional(duration.toDouble()) : std::nullopt,
      .offset = metadata.value(QLatin1String("offset")).toDouble(),
      .hasPrevious = metadata.value(QLatin1String("hasPrevious")).toBool(),
      .hasNext = metadata.value(QLatin1String("hasNext")).toBool(),
  };
  const int request = ++m_artworkRequest;
  m_mediaControls->setMetadata(media);

  // The desktop loads artwork itself, without the session, so it gets a
  // copy from this machine instead of the server's address.
  const QString artwork = metadata.value(QLatin1String("artwork")).toString();
  if (artwork.isEmpty() || !m_server) return;
  const QUrl url = serverUrl(m_server->url, artwork);
  if (!sameOrigin(url, m_server->url)) return;
  const QString file =
      QDir(paths::cache())
          .filePath(QStringLiteral("artwork-") +
                    QString::fromLatin1(
                        QCryptographicHash::hash(url.toEncoded(), QCryptographicHash::Sha1)
                            .toHex()));
  if (QFile::exists(file)) {
    media.artworkFile = file;
    m_mediaControls->setMetadata(media);
    return;
  }
  QNetworkRequest get(url);
  get.setHeader(QNetworkRequest::UserAgentHeader, m_userAgent);
  get.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  QNetworkReply *reply = m_api->network()->get(get);
  connect(reply, &QNetworkReply::finished, this, [this, reply, request, media, file]() mutable {
    reply->deleteLater();
    if (reply->error() != QNetworkReply::NoError) return;
    QSaveFile out(file);
    if (!out.open(QIODevice::WriteOnly) || out.write(reply->readAll()) < 0 || !out.commit()) {
      return;
    }
    // Something else plays by now.
    if (request != m_artworkRequest) return;
    media.artworkFile = file;
    m_mediaControls->setMetadata(media);
  });
}

void Application::registerServerMethods() {
  using Scope = Bridge::Scope;

  m_bridge->handle(QStringLiteral("shell.state"), Scope::Shell,
                   [this](const Bridge::Call &call) { call.resolve(shellState()); });
  m_bridge->handle(QStringLiteral("servers.list"), Scope::Shell,
                   [this](const Bridge::Call &call) { call.resolve(m_servers->toJson()); });
  m_bridge->handle(QStringLiteral("servers.probe"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     const auto address = call.string(QLatin1String("address"));
                     if (!address) return call.invalid();
                     m_api->probe(*address, [call](const ProbeResult &result) {
                       const auto failed = [&call](const char *reason) {
                         call.resolve(QJsonObject{{QStringLiteral("ok"), false},
                                                  {QStringLiteral("reason"),
                                                   QLatin1String(reason)}});
                       };
                       switch (result.outcome) {
                       case ProbeResult::Outcome::Server:
                         call.resolve(QJsonObject{{QStringLiteral("ok"), true},
                                                  {QStringLiteral("url"), result.url.toString()}});
                         break;
                       case ProbeResult::Outcome::Invalid:
                         failed("invalid");
                         break;
                       case ProbeResult::Outcome::Unreachable:
                         failed("unreachable");
                         break;
                       case ProbeResult::Outcome::NotMatinee:
                         failed("not-matinee");
                         break;
                       }
                     });
                   });
  m_bridge->handle(QStringLiteral("servers.discover"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     m_discovery->scan([call](const QList<DiscoveredServer> &servers) {
                       QJsonArray found;
                       for (const DiscoveredServer &server : servers) {
                         found.append(QJsonObject{{QStringLiteral("name"), server.name},
                                                  {QStringLiteral("url"), server.url.toString()}});
                       }
                       call.resolve(found);
                     });
                   });
  m_bridge->handle(QStringLiteral("servers.open"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     const auto id = call.string(QLatin1String("id"));
                     const auto server = id ? m_servers->find(*id) : std::nullopt;
                     if (!server) return call.invalid();
                     call.resolve();
                     openServer(*server);
                   });
  m_bridge->handle(QStringLiteral("servers.remove"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     const auto id = call.string(QLatin1String("id"));
                     const auto server = id ? m_servers->find(*id) : std::nullopt;
                     if (!server) return call.invalid();
                     // Ends the session on the server too, when it's there
                     // to hear it. Forgetting it here doesn't wait for that.
                     m_secrets->read(server->id, [this, server](const QString &token) {
                       if (!token.isEmpty()) {
                         m_api->post(server->url, signOutPath, {}, [](const ApiResponse &) {},
                                     token);
                       }
                       m_secrets->remove(server->id);
                     });
                     m_servers->remove(server->id);
                     if (m_shellServer && m_shellServer->id == server->id) {
                       m_shellServer.reset();
                       m_shellReason = m_servers->servers().isEmpty() ? ShellReason::Welcome
                                                                       : ShellReason::Servers;
                     }
                     call.resolve();
                   });
  m_bridge->handle(QStringLiteral("signIn.start"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     const auto address = call.string(QLatin1String("url"));
                     const auto method = call.string(QLatin1String("method"));
                     const QUrl url = address ? QUrl(*address, QUrl::StrictMode) : QUrl();
                     const bool browser = method == QLatin1String("browser");
                     if (!url.isValid() || url.host().isEmpty() ||
                         (!browser && method != QLatin1String("code")) ||
                         (url.scheme() != QLatin1String("http") &&
                          url.scheme() != QLatin1String("https"))) {
                       return call.invalid();
                     }
                     m_signIn->start(url,
                                     browser ? SignIn::Method::Browser : SignIn::Method::Code,
                                     [call](const QJsonObject &started, const QString &error) {
                                       if (error.isNull()) call.resolve(started);
                                       else call.reject(Bridge::Error::Failed, error);
                                     });
                   });
  m_bridge->handle(QStringLiteral("signIn.cancel"), Scope::Shell,
                   [this](const Bridge::Call &call) {
                     m_signIn->cancel();
                     call.resolve();
                   });

  connect(m_signIn, &SignIn::approved, this,
          [this](const QUrl &url, const QString &token, const QJsonObject &user) {
            const SavedServer server = m_servers->save(url, user);
            // Signing in again to a server replaces its session, so the one
            // before ends on the server too rather than linger there.
            m_secrets->read(server.id, [this, server, token](const QString &previous) {
              if (!previous.isEmpty() && previous != token) {
                m_api->post(server.url, signOutPath, {}, [](const ApiResponse &) {}, previous);
              }
              m_secrets->write(server.id, token);
            });
            m_bridge->emitEvent(QStringLiteral("signIn.result"),
                                QJsonObject{{QStringLiteral("status"), QStringLiteral("approved")},
                                            {QStringLiteral("server"), server.toJson()}},
                                Bridge::Scope::Shell);
            activate();
            connectTo(server, token);
          });
  connect(m_signIn, &SignIn::failed, this,
          [this](SignIn::Failure reason, const QString &message) {
            QString name;
            switch (reason) {
            case SignIn::Failure::Expired:
              name = QStringLiteral("expired");
              break;
            case SignIn::Failure::Denied:
              name = QStringLiteral("denied");
              break;
            case SignIn::Failure::Unreachable:
              name = QStringLiteral("unreachable");
              break;
            case SignIn::Failure::Failed:
              name = QStringLiteral("failed");
              break;
            }
            m_bridge->emitEvent(
                QStringLiteral("signIn.result"),
                QJsonObject{{QStringLiteral("status"), QStringLiteral("failed")},
                            {QStringLiteral("reason"), name},
                            {QStringLiteral("message"), message.isEmpty()
                                                            ? QJsonValue(QJsonValue::Null)
                                                            : QJsonValue(message)}},
                Bridge::Scope::Shell);
          });
}
