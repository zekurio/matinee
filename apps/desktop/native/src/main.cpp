#include "app/application.h"
#include "app/single_instance.h"
#include "version.h"
#include "web/shell_scheme.h"

#include <QCommandLineParser>
#include <QGuiApplication>
#include <QIcon>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>

namespace {

// Turns on the app's own debug output. Many desktops switch all debug
// output off through QT_LOGGING_RULES, which outranks anything set in the
// program, so the rule goes on the end of that. Before the application
// object, which reads it.
void logVerbosely() {
  QByteArray rules = qgetenv("QT_LOGGING_RULES");
  if (!rules.isEmpty()) rules += ';';
  qputenv("QT_LOGGING_RULES", rules + "matinee.*.debug=true");
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
