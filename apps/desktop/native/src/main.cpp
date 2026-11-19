#include "app/application.h"
#include "app/single_instance.h"
#include "version.h"
#include "web/shell_scheme.h"

#include <QCommandLineParser>
#include <QGuiApplication>
#include <QIcon>
#include <QSurfaceFormat>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>

#ifdef Q_OS_WIN
#include <QtCore/qt_windows.h>

#include <cstdio>
#endif

namespace {

// Turns on the app's own debug output. Many desktops switch all debug
// output off through QT_LOGGING_RULES, which outranks anything set in the
// program, so the rule goes on the end of that. Before the application
// object, which reads it.
void logVerbosely() {
  QByteArray rules = qgetenv("QT_LOGGING_RULES");
  if (!rules.isEmpty()) rules += ';';
  qputenv("QT_LOGGING_RULES", rules + "matinee.*.debug=true");

#ifdef Q_OS_WIN
  // A Windows program with a window has no terminal, and Qt logs to the
  // debugger there. A log that was asked for goes where stderr was sent,
  // as with `2> matinee.log`, or else to the terminal the app was started
  // from.
  qputenv("QT_FORCE_STDERR_LOGGING", "1");
  const HANDLE sent = GetStdHandle(STD_ERROR_HANDLE);
  if ((!sent || sent == INVALID_HANDLE_VALUE) && AttachConsole(ATTACH_PARENT_PROCESS)) {
    FILE *terminal = nullptr;
    freopen_s(&terminal, "CONOUT$", "w", stderr);
  }
#endif
}

} // namespace

int main(int argc, char *argv[]) {
  for (int i = 1; i < argc; ++i) {
    if (qstrcmp(argv[i], "--verbose") == 0) logVerbosely();
  }

  QCoreApplication::setApplicationName(QStringLiteral("matinee-desktop"));
  QCoreApplication::setApplicationVersion(QStringLiteral(MATINEE_VERSION));
  QGuiApplication::setApplicationDisplayName(QStringLiteral("Matinee"));
  QGuiApplication::setDesktopFileName(QStringLiteral("io.github.zekurio.matinee"));

#ifdef Q_OS_MACOS
  // For the video in the window. macOS hands out OpenGL 2.1 unless asked
  // for a core profile, and 4.1 is the newest it has.
  QSurfaceFormat format = QSurfaceFormat::defaultFormat();
  format.setVersion(4, 1);
  format.setProfile(QSurfaceFormat::CoreProfile);
  QSurfaceFormat::setDefaultFormat(format);
#endif

  // Qt WebEngine shares its pages' textures with the window's context,
  // where the window draws with OpenGL.
  QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

  // Both before the application object, or they come too late.
  ShellScheme::registerScheme();
  QtWebEngineQuick::initialize();

  QGuiApplication app(argc, argv);
  QGuiApplication::setWindowIcon(QIcon(QStringLiteral(":/icons/matinee.svg")));

#ifdef Q_OS_LINUX
  // Linux means Wayland here. X11 has no HDR and no way to put the video
  // under the window that this app builds on.
  if (QGuiApplication::platformName() != QLatin1String("wayland")) {
    qCritical("Matinee needs a Wayland session. This one is %ls.",
              qUtf16Printable(QGuiApplication::platformName()));
    return 1;
  }
#endif

  QCommandLineParser parser;
  parser.setApplicationDescription(QStringLiteral("Matinee for the desktop"));
  parser.addHelpOption();
  parser.addVersionOption();
  const QCommandLineOption fullscreen(QStringLiteral("fullscreen"),
                                      QStringLiteral("Open full screen."));
  const QCommandLineOption verbose(
      QStringLiteral("verbose"),
      QStringLiteral("Log what mpv and the pages say, for a bug report."));
  parser.addOptions({fullscreen, verbose});
  parser.process(app);

  SingleInstance instance;
  if (!instance.claim()) return 0;

  Application application(
      {.fullscreen = parser.isSet(fullscreen), .verbose = parser.isSet(verbose)});
  QObject::connect(&instance, &SingleInstance::activated, &application,
                   &Application::activate);
  if (!application.start()) return 1;
  return QGuiApplication::exec();
}
