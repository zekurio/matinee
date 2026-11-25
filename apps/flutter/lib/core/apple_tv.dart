import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:shared_preferences_platform_interface/types.dart';

import '../api/matinee_api.dart' show DevicePlatform;
import '../platform/apple_tv.g.dart';
import 'device.dart';
import 'network_monitor.dart';
import 'session_store.dart';

// What an Apple TV does its own way. tvOS runs Flutter on an engine patched
// for it (README.md, Apple TV), which the plugins know nothing of: none of
// them has a tvOS side, and no plugin registrant runs. So the app keeps its
// settings and tokens through a channel of its own, and reads the Siri
// Remote as that engine sends it.

/// The Apple TV's storage, opened in `main` before anything reads a
/// setting.
final class AppleTv {
  AppleTv._(this.secrets, this.cacheFolder);

  /// Makes the app's settings go to tvOS's defaults from here on, and
  /// answers with where the rest is kept.
  static Future<AppleTv> open([AppleTvApi? api]) async {
    final host = api ?? AppleTvApi();
    SharedPreferencesAsyncPlatform.instance = AppleTvPreferences(
      host,
      await host.preferences(),
    );
    return AppleTv._(
      AppleTvSecretStore(host),
      Directory(await host.cacheFolder()),
    );
  }

  /// The Keychain, for the session tokens.
  final SecretStore secrets;

  /// For what the app can fetch again. tvOS empties it when it needs room.
  final Directory cacheFolder;

  /// An Apple TV is on its network or of no use, and the app tries a saved
  /// server again whenever it comes to the front.
  NetworkMonitor get network => const _Wired();
}

final class _Wired implements NetworkMonitor {
  const _Wired();

  @override
  Future<NetworkStatus> status() async => const NetworkStatus({'network'});

  @override
  Stream<NetworkStatus> get changes => const Stream.empty();
}

/// shared_preferences over tvOS's defaults, read once and answered from
/// memory after. tvOS keeps an app's defaults under a megabyte, which the
/// settings and the server list are far below; a TV keeps no downloads and
/// nothing of what Home showed last.
base class AppleTvPreferences extends SharedPreferencesAsyncPlatform {
  AppleTvPreferences(this._api, Map<String, Object> values)
    : _values = {...values};

  final AppleTvApi _api;
  final Map<String, Object> _values;

  Future<void> _set(String key, Object value) {
    _values[key] = value;
    return _api.setPreference(key, value);
  }

  bool _allowed(String key, PreferencesFilters filter) =>
      filter.allowList?.contains(key) ?? true;

  @override
  Future<void> setString(
    String key,
    String value,
    SharedPreferencesOptions options,
  ) => _set(key, value);

  @override
  Future<void> setBool(
    String key,
    bool value,
    SharedPreferencesOptions options,
  ) => _set(key, value);

  @override
  Future<void> setDouble(
    String key,
    double value,
    SharedPreferencesOptions options,
  ) => _set(key, value);

  @override
  Future<void> setInt(
    String key,
    int value,
    SharedPreferencesOptions options,
  ) => _set(key, value);

  @override
  Future<void> setStringList(
    String key,
    List<String> value,
    SharedPreferencesOptions options,
  ) => _set(key, [...value]);

  @override
  Future<String?> getString(
    String key,
    SharedPreferencesOptions options,
  ) async => _values[key] as String?;

  @override
  Future<bool?> getBool(String key, SharedPreferencesOptions options) async =>
      _values[key] as bool?;

  @override
  Future<double?> getDouble(
    String key,
    SharedPreferencesOptions options,
  ) async => _values[key] as double?;

  @override
  Future<int?> getInt(String key, SharedPreferencesOptions options) async =>
      _values[key] as int?;

  @override
  Future<List<String>?> getStringList(
    String key,
    SharedPreferencesOptions options,
  ) async => _list(_values[key]);

  /// The channel hands a list over as a list of anything.
  static List<String>? _list(Object? value) =>
      value == null ? null : (value as List<Object?>).cast<String>().toList();

  @override
  Future<void> clear(
    ClearPreferencesParameters parameters,
    SharedPreferencesOptions options,
  ) async {
    final gone = [
      for (final key in _values.keys)
        if (_allowed(key, parameters.filter)) key,
    ];
    for (final key in gone) {
      _values.remove(key);
      await _api.setPreference(key, null);
    }
  }

  @override
  Future<Map<String, Object>> getPreferences(
    GetPreferencesParameters parameters,
    SharedPreferencesOptions options,
  ) async => {
    for (final MapEntry(:key, :value) in _values.entries)
      if (_allowed(key, parameters.filter))
        key: value is List<Object?> ? _list(value)! : value,
  };

  @override
  Future<Set<String>> getKeys(
    GetPreferencesParameters parameters,
    SharedPreferencesOptions options,
  ) async => {
    for (final key in _values.keys)
      if (_allowed(key, parameters.filter)) key,
  };
}

/// [SecretStore] over the Keychain. A read that fails throws, which the
/// session takes as a token it can't read, not as one that's gone.
final class AppleTvSecretStore implements SecretStore {
  const AppleTvSecretStore(this._api);

  final AppleTvApi _api;

  @override
  Future<String?> read(String key) => _api.secret(key);

  @override
  Future<void> write(String key, String value) => _api.setSecret(key, value);

  @override
  Future<void> delete(String key) => _api.setSecret(key, null);
}

/// Menu on the Siri Remote, which the engine sends as Escape: Back, as
/// Android's is.
class AppleTvBackIntent extends Intent {
  const AppleTvBackIntent();
}

/// The Siri Remote. The engine sends the clicks of its ring, Select, and
/// Menu as keys (arrows, Select, Escape), and where a finger is on its
/// touch surface as messages. This turns a swipe into arrow keys, Menu into
/// Back, and tells the engine when Menu is the system's, to leave the app.
///
/// How far a finger travels for one step matches tvOS's own focus engine:
/// the focused control's size along the swipe plus 155 points, between 200
/// and 700, and 400 with nothing to measure. A drag repeats no faster than
/// every 60 ms.
final class AppleTvRemote {
  AppleTvRemote({
    void Function(LogicalKeyboardKey key)? press,
    Rect? Function()? focused,
    DateTime Function()? now,
    Future<Object?> Function(Object? message)? tellEngine,
    Future<bool> Function()? popRoute,
  }) : _press = press ?? _pressKey,
       _focused = focused ?? _focusedRect,
       _now = now ?? DateTime.now,
       _tellEngine = tellEngine ?? _navigation.send,
       _popRoute = popRoute ?? _systemBack;

  static const _touches = BasicMessageChannel<Object?>(
    'flutter/gamepadtouchevent',
    JSONMessageCodec(),
  );
  static const _navigation = BasicMessageChannel<Object?>(
    'flutter/tvos_system_navigation',
    JSONMessageCodec(),
  );

  static const _fallbackTravel = 400.0;
  static const _extraTravel = 155.0;
  static const _minTravel = 200.0;
  static const _maxTravel = 700.0;
  static const _repeat = Duration(milliseconds: 60);

  final void Function(LogicalKeyboardKey key) _press;
  final Rect? Function() _focused;
  final DateTime Function() _now;
  final Future<Object?> Function(Object? message) _tellEngine;
  final Future<bool> Function() _popRoute;

  Offset? _anchor;
  DateTime? _stepped;

  /// The pages that say the next Back leaves the app.
  final _leaving = <Object>{};

  /// A Back nothing took, so the next Menu is the system's.
  bool _unhandled = false;
  bool? _told;

  /// The play and pause keys are the platform's on an Apple TV: it sends
  /// each press once, as a media command, however tvOS delivered it. The
  /// same press as a key would toggle a second time.
  static bool ownsKey(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.mediaPlayPause ||
      key == LogicalKeyboardKey.mediaPlay ||
      key == LogicalKeyboardKey.mediaPause;

  void start() {
    _touches.setMessageHandler(touch);
    HardwareKeyboard.instance.addHandler(_key);
  }

  void stop() {
    _touches.setMessageHandler(null);
    HardwareKeyboard.instance.removeHandler(_key);
  }

  /// One message of the touch surface: `started`, `move`, `ended`, or
  /// `cancelled`, with where the finger is.
  @visibleForTesting
  Future<Object?> touch(Object? message) async {
    if (message is! Map<Object?, Object?>) return null;
    final x = message['x'];
    final y = message['y'];
    switch (message['type']) {
      case 'started' when x is num && y is num:
        _anchor = Offset(x.toDouble(), y.toDouble());
        _stepped = null;
      case 'move' when x is num && y is num:
        _moved(Offset(x.toDouble(), y.toDouble()));
      // Where the finger lifts isn't read: it turns as it leaves, which
      // would be a step back the other way.
      case 'ended' || 'cancelled':
        _anchor = null;
    }
    return null;
  }

  void _moved(Offset at) {
    final anchor = _anchor;
    if (anchor == null) return;
    final now = _now();
    final stepped = _stepped;
    if (stepped != null && now.difference(stepped) < _repeat) {
      // What a flick travels while it slows doesn't count toward the next
      // step.
      _anchor = at;
      return;
    }
    final size = _focused();
    final delta = at - anchor;
    final across = delta.dx.abs() / _travel(size?.width);
    final along = delta.dy.abs() / _travel(size?.height);
    if (across < 1 && along < 1) return;
    _press(
      across >= along
          ? (delta.dx < 0
                ? LogicalKeyboardKey.arrowLeft
                : LogicalKeyboardKey.arrowRight)
          : (delta.dy < 0
                ? LogicalKeyboardKey.arrowUp
                : LogicalKeyboardKey.arrowDown),
    );
    _anchor = at;
    _stepped = now;
  }

  static double _travel(double? extent) =>
      extent == null || !extent.isFinite || extent <= 0
      ? _fallbackTravel
      : (extent + _extraTravel).clamp(_minTravel, _maxTravel);

  static Rect? _focusedRect() {
    final node = FocusManager.instance.primaryFocus;
    if (node == null || node is FocusScopeNode) return null;
    final box = node.context?.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    final rect = node.rect;
    return rect.isFinite && !rect.isEmpty ? rect : null;
  }

  /// Back as the system sends it on Android, over the navigation channel,
  /// and whether anything took it.
  static Future<bool> _systemBack() {
    const codec = JSONMethodCodec();
    final taken = Completer<bool>();
    ui.channelBuffers.push(
      SystemChannels.navigation.name,
      codec.encodeMethodCall(const MethodCall('popRoute')),
      (reply) =>
          taken.complete(reply != null && codec.decodeEnvelope(reply) == true),
    );
    return taken.future;
  }

  /// A key pressed and let go, through the framework as the engine's own
  /// keys go: to the keyboard's listeners, then to what has focus.
  static void _pressKey(LogicalKeyboardKey key) {
    final physical = switch (key) {
      LogicalKeyboardKey.arrowLeft => PhysicalKeyboardKey.arrowLeft,
      LogicalKeyboardKey.arrowRight => PhysicalKeyboardKey.arrowRight,
      LogicalKeyboardKey.arrowUp => PhysicalKeyboardKey.arrowUp,
      _ => PhysicalKeyboardKey.arrowDown,
    };
    // Held on the ring at the same time: that press is already under way.
    if (HardwareKeyboard.instance.physicalKeysPressed.contains(physical)) {
      return;
    }
    final send = ui.PlatformDispatcher.instance.onKeyData;
    if (send == null) return;
    for (final type in const [ui.KeyEventType.down, ui.KeyEventType.up]) {
      send(
        ui.KeyData(
          timeStamp: Duration(
            microseconds: DateTime.now().microsecondsSinceEpoch,
          ),
          type: type,
          physical: physical.usbHidUsage,
          logical: key.keyId,
          character: null,
          // Sent on at once, with no raw event to wait for.
          synthesized: true,
        ),
      );
    }
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  /// Back, as Android's: the pages' `PopScope`s get it. When nothing took
  /// it there is nothing left to close, and the next Menu leaves the app.
  Future<void> back() async {
    _unhandled = false;
    if (!await _popRoute()) _unhandled = true;
    _tell();
  }

  /// [page] says whether Back on it would leave the app, as Home with its
  /// drawer open does. tvOS has no way for an app to leave by itself: Menu
  /// has to go to the system untouched, so the engine has to know before
  /// the press.
  void leavesOnBack(Object page, {required bool leaves}) {
    if (leaves ? _leaving.add(page) : _leaving.remove(page)) _tell();
  }

  bool _key(KeyEvent event) {
    // Anything else pressed, and the person isn't leaving after all.
    if (_unhandled &&
        event is KeyDownEvent &&
        event.logicalKey != LogicalKeyboardKey.escape) {
      _unhandled = false;
      _tell();
    }
    return false;
  }

  void _tell() {
    final passes = _unhandled || _leaving.isNotEmpty;
    if (passes == _told) return;
    _told = passes;
    unawaited(
      _tellEngine({'menuPassthroughEnabled': passes}).catchError((Object _) {
        // An engine without the channel keeps Menu, and the app stays open.
        _told = null;
        return null;
      }),
    );
  }
}

/// The Siri Remote, on an Apple TV; null everywhere else.
final appleTvRemoteProvider = Provider<AppleTvRemote?>((ref) {
  if (ref.watch(deviceProvider).platform != DevicePlatform.tvos) return null;
  final remote = AppleTvRemote()..start();
  ref.onDispose(remote.stop);
  return remote;
});
