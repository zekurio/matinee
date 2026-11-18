#pragma once

#include "player/player_state.h"

#include <QJsonObject>
#include <QObject>
#include <QString>

#include <optional>

// What plays, as the page describes it: MediaMetadata in the bridge
// protocol.
struct MediaMetadata {
  QString title;
  QString subtitle;
  // The artwork as a file on this machine, once it's fetched. Empty
  // without one.
  QString artworkFile;
  // The file's length in seconds, when the source's own isn't it.
  std::optional<double> duration;
  // Where in the file the source's time 0 is.
  double offset = 0;
  bool hasPrevious = false;
  bool hasNext = false;
};

// The system's media controls: what plays, shown in the desktop's panel
// or lock screen, with the buttons and media keys that go with it. The
// controls show what mpv does and ask for changes; the page carries those
// out, as for its own buttons.
class MediaControls : public QObject {
  Q_OBJECT

public:
  // The controls of the system this runs on. On one without any built
  // yet, an object that does nothing.
  static MediaControls *create(QObject *parent);

  // Nothing clears the controls.
  virtual void setMetadata(const std::optional<MediaMetadata> &metadata) = 0;
  virtual void setState(const PlayerState &state) = 0;

Q_SIGNALS:
  // A MediaAction of the bridge protocol.
  void action(const QJsonObject &action);
  // The controls asked to see the app's window.
  void raiseRequested();
  void quitRequested();

protected:
  using QObject::QObject;
};
