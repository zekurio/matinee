#include "os/linux/mpris.h"

MediaControls *MediaControls::create(QObject *parent) { return new Mpris(parent); }
