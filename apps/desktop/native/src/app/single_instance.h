#pragma once

#include <QLocalServer>
#include <QObject>

// Keeps the app to one running copy per user. A second start tells the
// first to show its window and ends.
class SingleInstance : public QObject {
  Q_OBJECT

public:
  explicit SingleInstance(QObject *parent = nullptr);

  // True when this is the only copy, which then listens for others. False
  // when another copy runs and was told to show itself.
  bool claim();

Q_SIGNALS:
  // Another copy was started.
  void activated();

private:
  QLocalServer m_server;
};
