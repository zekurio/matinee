import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/apple_tv.dart';
import 'package:matinee/platform/apple_tv.g.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

/// tvOS's defaults and Keychain, in memory, as the channel hands them over:
/// a list comes back as a list of anything.
final class _Tv implements AppleTvApi {
  final defaults = <String, Object>{};
  final keychain = <String, String>{};
  bool keychainLocked = false;

  // Pigeon's own names.
  @override
  // ignore: non_constant_identifier_names
  BinaryMessenger? get pigeonVar_binaryMessenger => null;

  @override
  // ignore: non_constant_identifier_names
  String get pigeonVar_messageChannelSuffix => '';

  @override
  Future<Map<String, Object>> preferences() async => {
    for (final MapEntry(:key, :value) in defaults.entries)
      key: value is List ? List<Object?>.of(value) : value,
  };

  @override
  Future<void> setPreference(String key, Object? value) async {
    if (value == null) {
      defaults.remove(key);
    } else {
      defaults[key] = value;
    }
  }

  @override
  Future<String?> secret(String key) async {
    if (keychainLocked) throw PlatformException(code: 'keychain');
    return keychain[key];
  }

  @override
  Future<void> setSecret(String key, String? value) async {
    if (value == null) {
      keychain.remove(key);
    } else {
      keychain[key] = value;
    }
  }

  @override
  Future<String> cacheFolder() async => '/caches';
}

/// A remote whose presses, engine messages, and Back a test reads.
final class _Remote {
  _Remote({this.focused}) {
    remote = AppleTvRemote(
      press: pressed.add,
      focused: () => focused,
      now: () => clock,
      tellEngine: (message) async {
        told.add((message! as Map)['menuPassthroughEnabled'] as bool);
        return true;
      },
      popRoute: () async => handlesBack,
    );
  }

  late final AppleTvRemote remote;
  final pressed = <LogicalKeyboardKey>[];
  final told = <bool>[];
  Rect? focused;
  bool handlesBack = true;
  DateTime clock = DateTime(2026);

  Future<void> touch(String type, [double x = 0, double y = 0]) =>
      remote.touch({'type': type, 'x': x, 'y': y});

  void wait(int milliseconds) =>
      clock = clock.add(Duration(milliseconds: milliseconds));
}

void main() {
  group('the settings', () {
    late _Tv tv;

    setUp(() async {
      tv = _Tv();
      final previous = SharedPreferencesAsyncPlatform.instance;
      addTearDown(() => SharedPreferencesAsyncPlatform.instance = previous);
      tv.defaults['matinee.kept'] = 'before';
      tv.defaults['matinee.list'] = ['a', 'b'];
      await AppleTv.open(tv);
    });

    test('are read from the defaults and written back', () async {
      final preferences = SharedPreferencesAsync();
      expect(await preferences.getString('matinee.kept'), 'before');
      expect(await preferences.getStringList('matinee.list'), ['a', 'b']);

      await preferences.setBool('matinee.flag', true);
      await preferences.setInt('matinee.count', 3);
      await preferences.setDouble('matinee.level', 0.5);
      await preferences.remove('matinee.kept');

      expect(tv.defaults, {
        'matinee.list': ['a', 'b'],
        'matinee.flag': true,
        'matinee.count': 3,
        'matinee.level': 0.5,
      });
      expect(await preferences.getKeys(), {
        'matinee.list',
        'matinee.flag',
        'matinee.count',
        'matinee.level',
      });
    });

    // The session's own store reads everything at once, lists included.
    test('open as the cached store the session reads', () async {
      final cached = await SharedPreferencesWithCache.create(
        cacheOptions: const SharedPreferencesWithCacheOptions(),
      );
      expect(cached.getString('matinee.kept'), 'before');
      expect(cached.getStringList('matinee.list'), ['a', 'b']);
    });
  });

  test("a Keychain that can't be read throws, and deletes nothing", () async {
    final tv = _Tv()..keychain['token'] = 'secret';
    final secrets = AppleTvSecretStore(tv);
    expect(await secrets.read('token'), 'secret');
    tv.keychainLocked = true;
    await expectLater(secrets.read('token'), throwsA(isA<PlatformException>()));
    expect(tv.keychain, {'token': 'secret'});
    tv.keychainLocked = false;
    await secrets.delete('token');
    expect(tv.keychain, isEmpty);
  });

  group('a swipe on the remote', () {
    test('is one arrow key per step of travel, in its direction', () async {
      final remote = _Remote();
      await remote.touch('started', 500, 500);
      await remote.touch('move', 700, 510);
      expect(remote.pressed, isEmpty);
      await remote.touch('move', 905, 520);
      expect(remote.pressed, [LogicalKeyboardKey.arrowRight]);

      remote.wait(100);
      await remote.touch('move', 900, 100);
      expect(remote.pressed.last, LogicalKeyboardKey.arrowUp);
      remote.wait(100);
      await remote.touch('move', 480, 110);
      expect(remote.pressed.last, LogicalKeyboardKey.arrowLeft);
      remote.wait(100);
      await remote.touch('move', 470, 520);
      expect(remote.pressed.last, LogicalKeyboardKey.arrowDown);
      expect(remote.pressed, hasLength(4));
    });

    // A flick's tail used to count as a second step.
    test("doesn't step again on what it travels right after a step", () async {
      final remote = _Remote();
      await remote.touch('started', 0, 0);
      await remote.touch('move', 400, 0);
      remote.wait(20);
      await remote.touch('move', 900, 0);
      expect(remote.pressed, hasLength(1));
      remote.wait(100);
      await remote.touch('move', 1100, 0);
      expect(remote.pressed, hasLength(1));
      await remote.touch('move', 1300, 0);
      expect(remote.pressed, hasLength(2));
    });

    test('steps by the size of what has focus', () async {
      final remote = _Remote(focused: const Rect.fromLTWH(0, 0, 160, 90));
      await remote.touch('started', 0, 0);
      // 160 wide and 155 on top: 315 a step across.
      await remote.touch('move', 310, 0);
      expect(remote.pressed, isEmpty);
      await remote.touch('move', 320, 0);
      expect(remote.pressed, [LogicalKeyboardKey.arrowRight]);
      remote.wait(100);
      // 90 tall and 155 on top: 245 a step down.
      await remote.touch('move', 320, 250);
      expect(remote.pressed.last, LogicalKeyboardKey.arrowDown);
    });

    test('ends where the finger lifts, without a step', () async {
      final remote = _Remote();
      await remote.touch('started', 0, 0);
      await remote.touch('move', 300, 0);
      await remote.touch('ended', 900, 0);
      await remote.touch('move', 1800, 0);
      expect(remote.pressed, isEmpty);
    });
  });

  group('Menu', () {
    test('is the system\'s once Back had nothing to close', () async {
      final remote = _Remote();
      await remote.remote.back();
      expect(remote.told, [false]);

      remote.handlesBack = false;
      await remote.remote.back();
      expect(remote.told, [false, true]);
    });

    test('is the system\'s on the page that says Back leaves', () {
      final remote = _Remote();
      final home = Object();
      remote.remote.leavesOnBack(home, leaves: true);
      remote.remote.leavesOnBack(home, leaves: true);
      expect(remote.told, [true]);
      remote.remote.leavesOnBack(home, leaves: false);
      expect(remote.told, [true, false]);
    });
  });

  test('the play and pause keys are left to the platform', () {
    expect(AppleTvRemote.ownsKey(LogicalKeyboardKey.mediaPlayPause), isTrue);
    expect(AppleTvRemote.ownsKey(LogicalKeyboardKey.mediaFastForward), isFalse);
    expect(AppleTvRemote.ownsKey(LogicalKeyboardKey.select), isFalse);
  });
}
