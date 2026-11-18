#pragma once

#include <QUrl>
#include <QWebEngineUrlSchemeHandler>

// Serves the app's own pages, which are built into the program, at
// matinee-shell://app/. A scheme of its own gives them an origin, so
// their storage and the bridge's rules are theirs alone.
class ShellScheme : public QWebEngineUrlSchemeHandler {
  Q_OBJECT

public:
  explicit ShellScheme(QObject *parent = nullptr);

  // Tells Qt WebEngine about the scheme. Before the application object
  // exists, or it has no effect.
  static void registerScheme();

  static QByteArray scheme();
  // The address of the pages' entry.
  static QUrl entry();
  // Whether `url` is one of the app's own pages.
  static bool owns(const QUrl &url);

  void requestStarted(QWebEngineUrlRequestJob *job) override;
};
