import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/matinee_api.dart';
import 'address.dart';
import 'session.dart';

/// The accents the server in use gives the Matinee theme, from the
/// branding an admin set (`auth.config`'s `themeAccents`), as the web's
/// `followServerThemeAccents`. Null until known, and for a server with none,
/// where the kit's preset shows as it is.
///
/// They are those of the server on screen: the one in use, or the one
/// whose sign-in shows while it's being added.
///
/// Each server's last answer is kept on the device, so its colour shows
/// at once on the next start and stays while the server can't be
/// reached. The server is asked again whenever the one in use changes,
/// whenever it's reached again, and when the app comes back to the
/// foreground ([refresh]).
final serverAccentsProvider =
    NotifierProvider<ServerAccentsNotifier, ThemeAccents?>(
      ServerAccentsNotifier.new,
    );

/// Accents the admin's Branding page shows before they're saved, over the
/// server's, while the page is open.
final accentPreviewProvider = NotifierProvider<AccentPreview, ThemeAccents?>(
  AccentPreview.new,
);

class AccentPreview extends Notifier<ThemeAccents?> {
  @override
  ThemeAccents? build() => null;

  void show(ThemeAccents? accents) {
    // A page leaving as the app closes finds it gone already.
    if (ref.mounted) state = accents;
  }
}

class ServerAccentsNotifier extends Notifier<ThemeAccents?> {
  static const _prefix = 'matinee.accents.';
  final _preferences = SharedPreferencesAsync();

  /// Moves on each build, so an answer for the server before is dropped.
  int _generation = 0;

  /// The server the accents shown are for.
  String? _origin;

  @override
  ThemeAccents? build() {
    final auth = ref.watch(authStateProvider);
    final origin = _originOf(auth);
    final mine = ++_generation;
    final same = origin == _origin;
    _origin = origin;
    if (origin == null) return null;
    // A sign-in screen has the answer already, and wears it: the screen is
    // that server's, one being added as much as the one in use.
    if (auth is SignedOut) {
      unawaited(_keep(origin, auth.config.themeAccents));
      return auth.config.themeAccents;
    }
    unawaited(_load(mine, origin, ask: auth is SignedIn));
    // Another server's colour never shows for this one.
    return same ? stateOrNull : null;
  }

  /// Asks the server in use again, as on coming back to the foreground.
  Future<void> refresh() async {
    final auth = ref.read(authStateProvider);
    final origin = _originOf(auth);
    if (origin == null || auth is! SignedIn) return;
    await _ask(_generation, origin);
  }

  /// The server [auth] is about, by its origin key, or null with none.
  static String? _originOf(AuthState auth) {
    final server = switch (auth) {
      NoServer() => null,
      Connecting(:final server) ||
      Unreachable(:final server) ||
      SignedOut(:final server) ||
      SignedIn(:final server) ||
      Offline(:final server) => server,
    };
    if (server == null) return null;
    final url = Uri.tryParse(server);
    return url == null || !url.hasAuthority ? server : originKey(url);
  }

  Future<void> _load(int mine, String origin, {required bool ask}) async {
    final kept = await _read(origin);
    if (!ref.mounted || mine != _generation) return;
    if (kept != null) _show(kept);
    if (ask) await _ask(mine, origin);
  }

  Future<void> _ask(int mine, String origin) async {
    final api = ref.read(apiProvider);
    if (api == null) return;
    final ThemeAccents accents;
    try {
      accents = (await api.auth.config()).themeAccents;
    } on Object {
      // Unreachable or refused: the last known colour stays.
      return;
    }
    if (!ref.mounted || mine != _generation) return;
    _show(accents);
    await _keep(origin, accents);
  }

  /// Sets [accents] unless they're what shows, which would build the
  /// whole app again for nothing.
  void _show(ThemeAccents accents) {
    final shown = stateOrNull;
    if (shown?.light == accents.light && shown?.dark == accents.dark) return;
    state = accents;
  }

  Future<ThemeAccents?> _read(String origin) async {
    try {
      final saved = await _preferences.getString('$_prefix$origin');
      if (saved == null) return null;
      final parts = saved.split('|');
      if (parts.length != 2) return null;
      return ThemeAccents(
        light: parts.first.isEmpty ? null : parts.first,
        dark: parts.last.isEmpty ? null : parts.last,
      );
    } on Object {
      return null;
    }
  }

  Future<void> _keep(String origin, ThemeAccents accents) async {
    try {
      await _preferences.setString(
        '$_prefix$origin',
        '${accents.light ?? ''}|${accents.dark ?? ''}',
      );
    } on Object {
      // Only the next start's first frame misses it.
    }
  }
}
