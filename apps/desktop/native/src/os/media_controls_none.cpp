#include "os/media_controls.h"

namespace {

// For systems whose media controls aren't built yet. Media keys still
// reach the page while the window has the keyboard.
class NoMediaControls : public MediaControls {
public:
  using MediaControls::MediaControls;

  void setMetadata(const std::optional<MediaMetadata> &) override {}
  void setState(const PlayerState &) override {}
};

} // namespace

MediaControls *MediaControls::create(QObject *parent) {
  return new NoMediaControls(parent);
}
