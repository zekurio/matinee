import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/screens/tv/tv_shell.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../../core/fakes.dart';
import '../../media/harness.dart' show server;
import '../home_backend.dart';

const tvDevice = Device(
  formFactor: FormFactor.tv,
  name: 'Living room',
  model: 'tv',
  osVersion: '16',
  appVersion: '1',
  platform: 'androidtv',
);

/// The sizes a TV page is checked at: the 960 by 540 the Kotlin app is
/// laid out for, and a 1080p screen at one pixel per point.
const tvSizes = [Size(960, 540), Size(1920, 1080)];

/// Loads the app's font once, so text measures as it does on a TV.
void loadTvFont() {
  setUpAll(() async {
    await (FontLoader(
      KitText.family,
    )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
  });
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    FocusManager.instance.highlightStrategy =
        FocusHighlightStrategy.alwaysTraditional;
    TvClock.now = () => DateTime(2026, 11, 20, 20, 45);
  });
}

/// The signed-in app on a TV at [size], talking to [backend], with the
/// drawer's Movies and Shows.
Future<void> pumpTv(
  WidgetTester tester,
  HomeBackend backend, {
  Size size = const Size(960, 540),
  String? location,
}) async {
  backend.answers.putIfAbsent(
    '/api/v1/titles/browse',
    () => {
      'items': <Object>[],
      'total': 2,
      'kinds': {'movie': 1, 'show': 1},
    },
  );
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  // A TV's system is dark, so the theme follows it there.
  tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
  final user = User.fromJson(userJson('ada'));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        deviceProvider.overrideWithValue(tvDevice),
        authStateProvider.overrideWithValue(
          SignedIn('https://media.example.com', user),
        ),
        apiProvider.overrideWithValue(
          MatineeApi(base: server, client: backend.client),
        ),
        artworkLoaderProvider.overrideWithValue(
          ArtworkLoader(backend.client, const NoArtworkCache()),
        ),
        removingServersProvider.overrideWithValue(const {}),
        savedServersProvider.overrideWithValue([
          SavedServer(
            origin: '$server/',
            address: '$server',
            name: null,
            user: user,
            active: true,
          ),
        ]),
      ],
      child: const MatineeApp(),
    ),
  );
  await settle(tester);
}

/// Lets loads, timers, and animations finish.
Future<void> settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
  // The shell's refocus and a page's opening wait a little.
  await tester.pump(const Duration(milliseconds: 200));
  await tester.pumpAndSettle();
}

/// Presses [key] on the remote and lets what it does finish.
Future<void> press(WidgetTester tester, LogicalKeyboardKey key) async {
  await tester.sendKeyEvent(key);
  await settle(tester);
}

Future<void> right(WidgetTester tester, [int times = 1]) async {
  for (var i = 0; i < times; i++) {
    await press(tester, LogicalKeyboardKey.arrowRight);
  }
}

Future<void> left(WidgetTester tester, [int times = 1]) async {
  for (var i = 0; i < times; i++) {
    await press(tester, LogicalKeyboardKey.arrowLeft);
  }
}

Future<void> down(WidgetTester tester, [int times = 1]) async {
  for (var i = 0; i < times; i++) {
    await press(tester, LogicalKeyboardKey.arrowDown);
  }
}

Future<void> up(WidgetTester tester, [int times = 1]) async {
  for (var i = 0; i < times; i++) {
    await press(tester, LogicalKeyboardKey.arrowUp);
  }
}

Future<void> select(WidgetTester tester) =>
    press(tester, LogicalKeyboardKey.select);

/// The remote's Back, as the system sends it.
Future<bool> back(WidgetTester tester) async {
  final handled = await tester.binding.handlePopRoute();
  await settle(tester);
  return handled;
}

/// What has focus, by its label: a card's name, a button's words.
String? focusedLabel() {
  final context = FocusManager.instance.primaryFocus?.context;
  if (context == null) return null;
  String? label;
  context.visitAncestorElements((element) {
    final widget = element.widget;
    if (widget is Semantics && widget.properties.label != null) {
      label = widget.properties.label;
      return false;
    }
    return true;
  });
  return label;
}

/// The focus node's debug label, as a memory's `row/key`.
String? focusedKey() => FocusManager.instance.primaryFocus?.debugLabel;
