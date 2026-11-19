#pragma once

#include "app/settings.h"
#include "bridge/bridge.h"
#include "os/sleep_inhibitor.h"
#include "servers/server_store.h"

#include <QObject>
#include <QQmlApplicationEngine>
#include <QQuickWebEngineProfile>
#include <QUrl>

#include <memory>
#include <optional>

class Discovery;
class MediaControls;
class MpvPlayer;
class VideoOutput;
class QQuickWindow;
class RequestInterceptor;
class SecretStore;
class ServerApi;
class SignIn;

// The app: one window that shows either the app's own pages or a
// server's web app, with mpv under it, and everything those two talk to
// through the bridge.
class Application : public QObject {
  Q_OBJECT
  Q_PROPERTY(QQuickWebEngineProfile *profile READ profile CONSTANT)
  Q_PROPERTY(Bridge *bridge READ bridge CONSTANT)
  Q_PROPERTY(QString transportScript READ transportScript CONSTANT)
  Q_PROPERTY(double scale READ scale NOTIFY scaleChanged)
  Q_PROPERTY(bool videoShown READ videoShown NOTIFY videoShownChanged)
  Q_PROPERTY(bool videoUnderWindow READ videoUnderWindow CONSTANT)

public:
  struct Options {
    bool fullscreen = false;
    bool verbose = false;
  };

  explicit Application(const Options &options, QObject *parent = nullptr);
  ~Application() override;

  // Opens the window. False when the app can't run, with the reason
  // logged.
  bool start();
  // Brings the window to the front, for a second start of the app.
  void activate();

  QQuickWebEngineProfile *profile() const { return m_profile; }
  Bridge *bridge() const { return m_bridge; }
  // The script that gives a page `window.matineeDesktop`.
  QString transportScript() const { return m_transportScript; }
  double scale() const { return m_settings->values().scale; }
  // A frame of the video is there to see under the page.
  bool videoShown() const { return m_videoShown; }
  // The video is on a surface of mpv's own under the window, so the
  // window has to be see-through for it and not only the page.
  bool videoUnderWindow() const { return m_videoUnderWindow; }

  // Called by the window, in Main.qml.
  Q_INVOKABLE void pageChanged(const QUrl &url);
  Q_INVOKABLE void loadFailed(const QUrl &url, const QString &error);
  Q_INVOKABLE bool allowsNavigation(const QUrl &url);
  Q_INVOKABLE void openExternally(const QUrl &url);
  Q_INVOKABLE void setFullscreen(bool fullscreen);
  Q_INVOKABLE void showServers();
  Q_INVOKABLE void mediaKey(const QString &action);
  Q_INVOKABLE void pageCrashed(int status, int code);
  Q_INVOKABLE void pageLogged(int level, const QString &message, int line,
                              const QString &source);
  Q_INVOKABLE void windowClosing();

Q_SIGNALS:
  // Tells the window which page to load.
  void navigate(const QUrl &url);
  void scaleChanged();
  void videoShownChanged();

private:
  // Why the app's own pages show: ShellReason in the bridge protocol.
  enum class ShellReason { Welcome, Servers, SignedOut, Unreachable };

  void setUpProfile();
  void registerMethods();
  void registerPlayerMethods();
  void registerServerMethods();

  void openServer(const SavedServer &server);
  void connectTo(const SavedServer &server, const QString &token);
  void showShell(ShellReason reason, const std::optional<SavedServer> &server);
  void leavePlayer();
  void setMediaMetadata(const QJsonObject &metadata);
  QJsonObject shellState() const;
  QJsonObject appInfo() const;

  Options m_options;
  Settings *m_settings;
  ServerStore *m_servers;
  SecretStore *m_secrets;
  ServerApi *m_api = nullptr;
  Discovery *m_discovery = nullptr;
  SignIn *m_signIn = nullptr;
  Bridge *m_bridge;
  MpvPlayer *m_player;
  MediaControls *m_mediaControls;
  QQuickWebEngineProfile *m_profile = nullptr;
  RequestInterceptor *m_interceptor = nullptr;
  QString m_userAgent;
  QString m_transportScript;

  std::unique_ptr<QQmlApplicationEngine> m_engine;
  QQuickWindow *m_window = nullptr;
  VideoOutput *m_output = nullptr;
  bool m_videoUnderWindow = false;
  std::unique_ptr<SleepInhibitor> m_sleep;
  // What the window was before it went full screen.
  bool m_wasMaximized = false;
  bool m_videoShown = false;

  // Where the web app loads from: the server, or MATINEE_WEB_APP.
  QUrl webAppUrl() const;

  // The server whose web app shows, with its session's token. Unset
  // while the app's own pages show.
  std::optional<SavedServer> m_server;
  // A web app to show in place of the server's own, for working on one
  // the server doesn't have yet. From MATINEE_WEB_APP.
  QUrl m_webApp;
  QString m_token;
  ShellReason m_shellReason = ShellReason::Welcome;
  std::optional<SavedServer> m_shellServer;
  // Counts artwork requests, so only the latest one's picture is shown.
  int m_artworkRequest = 0;
};
