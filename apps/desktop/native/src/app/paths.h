#pragma once

#include <QString>

// Where the app keeps its files. Each is created on first use.
//
// MATINEE_DESKTOP_DIR puts all three under one directory instead, as
// `config`, `cache`, and `data`: for the tests, and for keeping a copy of
// the app to itself.
namespace paths {

// Settings and the list of servers: ~/.config/matinee-desktop on Linux.
QString config();

// Files that can be made again, like mpv's shader cache.
QString cache();

// The web view's storage and the token file used without a keychain.
QString data();

} // namespace paths
