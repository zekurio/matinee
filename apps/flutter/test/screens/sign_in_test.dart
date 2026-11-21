import 'dart:async';
import 'dart:io';

import 'package:flutter/rendering.dart' show RenderParagraph;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/app.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/server_discovery.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/sign_in_state.dart';
import 'package:matinee/core/unreachability.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/router.dart';
import 'package:matinee/screens/shell/header.dart';
import 'package:matinee/screens/sign_in/auth_layout.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';

const _tv = Device(
  formFactor: FormFactor.tv,
  name: 'Living room',
  model: 'tv',
  osVersion: '16',
  appVersion: '1',
  platform: 'androidtv',
);

/// A launch with `a.example` saved and signed in, ended, so a test can launch
/// again from what's saved.
Future<Harness> _saved({String host = 'a.example'}) async {
  final harness = Harness();
  harness.backend
    ..hosts.add(host)
    ..tokens['token-a'] = 'ada';
  await harness.launch();
  await harness.until<NoServer>();
  expect(await harness.session.connect(host), isNull);
  await harness.until<SignedOut>();
  harness.session.signedIn(appSession('token-a', 'ada'));
  await harness.until<SignedIn>();
  await harness.quit();
  return harness;
}

/// The app on [harness]'s session, the way `main` makes it. Servers found
/// nearby are [nearby]; a code's polling waits until [poll] says so.
Future<void> _show(
  WidgetTester tester,
  Harness harness, {
  Device device = const Device.fallback(),
  Size size = const Size(412, 915),
  List<DiscoveredServer> nearby = const [],
  Future<void> Function(Duration)? poll,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.runAsync(
    () => harness.launch(
      device: device,
      overrides: [
        serverDiscoveryProvider.overrideWithValue(
          () => Stream.fromIterable(nearby),
        ),
        deviceCodeDelayProvider.overrideWithValue(
          poll ?? (_) => Completer<void>().future,
        ),
      ],
    ),
  );
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: harness.container,
      child: const MatineeApp(),
    ),
  );
  await _settle(tester);
}

/// Lets the session's work and the router's follow it.
Future<void> _settle(WidgetTester tester) async {
  // Spinners never stop, so there's no pumpAndSettle: a few frames, with
  // enough time in them for a sheet to open.
  for (var i = 0; i < 2; i++) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }
}

/// Runs [work] on the real clock, then lets the screens catch up.
Future<T> _async<T>(WidgetTester tester, Future<T> Function() work) async {
  final result = (await tester.runAsync(work)) as T;
  await _settle(tester);
  return result;
}

/// Lets the app run until the session is in state [T]: what a tap starts
/// runs in the test's own clock, which only a frame moves.
Future<T> _reach<T extends AuthState>(
  WidgetTester tester,
  Harness harness,
) async {
  for (var i = 0; i < 10 && harness.auth is! T; i++) {
    await _settle(tester);
  }
  expect(harness.auth, isA<T>());
  return harness.auth as T;
}

Future<void> _end(WidgetTester tester, Harness harness) async {
  await tester.pumpWidget(const SizedBox());
  await tester.runAsync(harness.quit);
}

Finder _field() => find.byType(EditableText);

/// Whether focus is on the control that shows [text].
bool _focusedIn(WidgetTester tester, String text) {
  final focused = FocusManager.instance.primaryFocus?.context;
  if (focused == null) return false;
  var found = false;
  tester.element(find.text(text)).visitAncestorElements((element) {
    found = element == focused;
    return !found;
  });
  return found;
}

void main() {
  setUpAll(() async {
    await (FontLoader(
      KitText.family,
    )..addFont(rootBundle.load('assets/fonts/red_hat_text.ttf'))).load();
  });

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  group('the session picks the screen', () {
    test('every state has its route, and the app is where it was', () {
      final user = User.fromJson(userJson('ada'));
      final config = AuthConfig.fromJson(configJson);
      expect(authRedirect(const NoServer(), Routes.home), Routes.connect);
      expect(authRedirect(const NoServer(), Routes.connect), isNull);
      expect(
        authRedirect(const Connecting('https://a.example'), Routes.connect),
        Routes.connecting,
      );
      expect(
        authRedirect(
          const Unreachable('https://a.example', Unreachability.refused),
          Routes.home,
        ),
        Routes.unreachable,
      );
      expect(
        authRedirect(SignedOut('https://a.example', config), '/settings'),
        Routes.signIn,
      );
      final signedIn = SignedIn('https://a.example', user);
      expect(authRedirect(signedIn, Routes.signIn), Routes.home);
      expect(authRedirect(signedIn, Routes.connecting), Routes.home);
      expect(authRedirect(signedIn, '/title/t1'), isNull);
      expect(
        authRedirect(Offline('https://a.example', user), Routes.unreachable),
        Routes.home,
      );
    });

    testWidgets('no server shows connect, which has no way back', (
      tester,
    ) async {
      final harness = Harness();
      await _show(tester, harness);

      expect(find.text('Connect to your server'), findsOneWidget);
      expect(find.text('media.example.com'), findsOneWidget);
      expect(find.textContaining('Back to'), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('a saved server is checked, then the tabs show', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      final gate = Completer<void>();
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..holdSession = gate;
      await _show(tester, harness);

      expect(find.text('Connecting to https://a.example…'), findsOneWidget);
      expect(find.byType(TabBar), findsNothing);

      gate.complete();
      await _settle(tester);

      expect(find.byType(TabBar), findsOneWidget);
      expect(find.byType(ShellHeader), findsOneWidget);
      expect(find.text('Connecting to https://a.example…'), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('signing out comes back to sign-in, and signing in leaves', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..codes['good'] = appSession('token-a', 'ada');
      await _show(tester, harness);
      expect(find.byType(TabBar), findsOneWidget);

      await _async(tester, harness.session.signOut);

      expect(find.byType(TabBar), findsNothing);
      expect(find.text('Sign in to Matinee'), findsOneWidget);
      expect(find.text('On a.example'), findsOneWidget);

      await tester.tap(find.text('Sign in with your browser'));
      await _reach<SignedIn>(tester, harness);

      expect(harness.browser.opened, hasLength(1));
      expect(find.text('Sign in to Matinee'), findsNothing);
      expect(find.byType(TabBar), findsOneWidget);
      await _end(tester, harness);
    });

    testWidgets('a server that does not answer can be tried again', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException(
          'Connection refused',
          osError: OSError('Connection refused', 111),
        );
      await _show(tester, harness);

      expect(find.text("Can't reach your server"), findsOneWidget);
      expect(find.text('a.example isn\'t answering.'), findsOneWidget);
      // There are no downloads to watch, so the way on is Try again.
      expect(find.text('Watch downloads'), findsNothing);
      expect(find.text('Change server'), findsOneWidget);
      final asked = harness.backend
          .to('a.example', '/api/v1/auth/session')
          .length;

      harness.backend.down.clear();
      await tester.tap(find.text('Try again'));
      await _reach<SignedIn>(tester, harness);

      expect(
        harness.backend.to('a.example', '/api/v1/auth/session').length,
        greaterThan(asked),
      );
      expect(find.byType(TabBar), findsOneWidget);
      expect(find.text("Can't reach your server"), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('offline mode shows the tabs without the server', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException('Connection refused');
      await _show(tester, harness);
      expect(find.text("Can't reach your server"), findsOneWidget);

      harness.session.setOfflineMode(on: true);
      await _settle(tester);

      expect(harness.auth, isA<Offline>());
      expect(find.byType(TabBar), findsOneWidget);
      await _end(tester, harness);
    });

    testWidgets('a sign-in the keystore can\'t read waits for a choice', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      saved!.secrets.unreadable.add('token:https://a.example/');
      final harness = Harness(prefs: saved.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await _show(tester, harness);
      expect(find.text("Couldn't read your sign-in"), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);

      await tester.tap(find.text('Sign in again'));
      await _reach<SignedOut>(tester, harness);
      expect(saved.secrets.values['token:https://a.example/'], 'token-a');
      await _end(tester, harness);
    });
  });

  group('connect', () {
    testWidgets('calls the session with the address and moves on to sign-in', (
      tester,
    ) async {
      final harness = Harness();
      harness.backend.hosts.add('media.example.com');
      await _show(tester, harness);
      expect(
        tester
            .widget<MatineeButton>(
              find.widgetWithText(MatineeButton, 'Connect'),
            )
            .onPressed,
        isNull,
        reason: 'nothing is typed yet',
      );

      await tester.enterText(_field(), ' media.example.com ');
      await tester.pump();
      await tester.tap(find.text('Connect'));
      await _reach<SignedOut>(tester, harness);

      final requests = harness.backend.to(
        'media.example.com',
        '/api/v1/auth/config',
      );
      expect(requests, hasLength(1));
      expect(requests.single.url.scheme, 'https');
      expect(find.text('Sign in to Matinee'), findsOneWidget);
      expect(find.text('On media.example.com'), findsOneWidget);
      await _end(tester, harness);
    });

    testWidgets('says what went wrong, and clears it when typing goes on', (
      tester,
    ) async {
      final harness = Harness();
      await _show(tester, harness);

      await tester.enterText(_field(), 'ghost.example.com');
      await tester.testTextInput.receiveAction(TextInputAction.go);
      await _async(tester, () => Future<void>.delayed(Duration.zero));
      await tester.pump();

      expect(find.textContaining("Couldn't reach"), findsOneWidget);
      expect(harness.auth, isA<NoServer>());

      await tester.enterText(_field(), 'ghost.example.com2');
      await tester.pump();
      expect(find.textContaining("Couldn't reach"), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('lists servers found nearby, and connects to the one picked', (
      tester,
    ) async {
      final harness = Harness();
      harness.backend.hosts.add('192.168.1.5');
      await _show(
        tester,
        harness,
        nearby: const [
          DiscoveredServer('Living room', 'http://192.168.1.5:8420'),
        ],
      );
      expect(find.text('On this network'), findsOneWidget);
      expect(find.text('Living room'), findsOneWidget);
      expect(find.text('192.168.1.5:8420'), findsOneWidget);

      await tester.tap(find.text('Living room'));
      final signedOut = await _reach<SignedOut>(tester, harness);

      expect(signedOut.server, 'http://192.168.1.5:8420');
      expect(find.text('Sign in to Matinee'), findsOneWidget);
      await _end(tester, harness);
    });

    testWidgets('asks for local network access and says where to allow it', (
      tester,
    ) async {
      final harness = Harness();
      harness.localNetwork
        ..needed = true
        ..answer = false;
      await _show(tester, harness);

      await tester.enterText(_field(), '192.168.1.5:8420');
      await tester.testTextInput.receiveAction(TextInputAction.go);
      await _async(tester, () => Future<void>.delayed(Duration.zero));
      await tester.pump();

      expect(harness.localNetwork.asked, greaterThan(0));
      expect(
        find.textContaining(
          'allow Matinee to find and connect to local devices',
        ),
        findsOneWidget,
      );
      await _end(tester, harness);
    });

    testWidgets('a second server offers to go back to the first', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await _show(tester, harness);
      expect(find.byType(TabBar), findsOneWidget);

      harness.session.addServer();
      await _settle(tester);

      expect(find.text('Connect to your server'), findsOneWidget);
      await tester.tap(find.text('Back to a.example'));
      await _settle(tester);

      expect(harness.auth, isA<SignedIn>());
      expect(find.byType(TabBar), findsOneWidget);
      await _end(tester, harness);
    });

    testWidgets('a tablet keeps the form at the phone\'s width, centered', (
      tester,
    ) async {
      final harness = Harness();
      await _show(tester, harness, size: const Size(1280, 800));

      final field = tester.getRect(find.byType(MatineeTextField));
      expect(field.width, lessThanOrEqualTo(AuthLayout.formWidth));
      expect(field.center.dx, closeTo(640, 1));
      await _end(tester, harness);
    });
  });

  group('sign in', () {
    testWidgets(
      'with a code shows the code, and going back shows the browser',
      (tester) async {
        final saved = await tester.runAsync(_saved);
        final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
        harness.backend
          ..hosts.add('a.example')
          ..tokens['token-a'] = 'ada';
        final waitForPoll = Completer<void>();
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await _show(
          tester,
          harness,
          size: const Size(320, 915),
          poll: (_) => waitForPoll.future,
        );
        await _async(tester, harness.session.signOut);
        expect(find.text('Sign in with a code'), findsOneWidget);

        await tester.tap(find.text('Sign in with a code'));
        await _settle(tester);

        expect(find.text('BCDF-GHJK'), findsOneWidget);
        expect(find.text('Enter this code at a.example/link'), findsOneWidget);
        expect(find.text('Waiting for approval…'), findsOneWidget);
        expect(find.text('Open the link page'), findsOneWidget);
        // A phone shows no QR code; the TV does.
        expect(find.byType(QrCodeCard), findsNothing);

        final code = find.text('BCDF-GHJK');
        expect(
          tester.renderObject<RenderParagraph>(code).didExceedMaxLines,
          isFalse,
        );
        final left = tester.getTopLeft(code).dx;
        expect(left, greaterThanOrEqualTo(0));
        expect(tester.getTopRight(code).dx, lessThanOrEqualTo(320));
        await tester.binding.handlePopRoute();
        await _settle(tester);
        waitForPoll.complete();
        await _settle(tester);
        expect(
          harness.backend.to('a.example', '/api/v1/auth/device/token'),
          isEmpty,
        );
        expect(find.text('Sign in with your browser'), findsOneWidget);
        await _end(tester, harness);
      },
    );

    testWidgets('the artwork rows fit the rotated backdrop on a tablet', (
      tester,
    ) async {
      final harness = Harness();
      harness.backend
        ..hosts.add('a.example')
        ..backdropTiles.add(
          const LoginBackdropTile(
            artwork: Artwork(id: 'poster', placeholder: null),
            kind: LoginBackdropKind.poster,
          ),
        );
      await _show(tester, harness, size: const Size(1280, 800));
      await _async(tester, () => harness.session.connect('a.example'));
      expect(find.byType(Image), findsWidgets);
      expect(tester.takeException(), isNull);
      await _end(tester, harness);
    });

    testWidgets('a code someone approves signs this device in', (tester) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..devicePolls.add(
          jsonResponse({
            'status': 'approved',
            'token': 'token-a',
            'user': userJson('ada'),
          }),
        );
      await _show(tester, harness, poll: (_) async {});
      await _async(tester, harness.session.signOut);

      await tester.tap(find.text('Sign in with a code'));
      await _reach<SignedIn>(tester, harness);

      expect(find.byType(TabBar), findsOneWidget);
      expect(find.text('Sign in with a code'), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('a failed browser sign-in says so', (tester) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      harness.browser.answer = (page) =>
          Uri.parse('matinee://auth/callback?code=good&state=somebody-else');
      await _show(tester, harness);
      await _async(tester, harness.session.signOut);

      await tester.tap(find.text('Sign in with your browser'));
      await _settle(tester);

      expect(
        find.text("That sign-in didn't come from this app. Try again."),
        findsOneWidget,
      );
      expect(harness.auth, isA<SignedOut>());
      await _end(tester, harness);
    });

    testWidgets('the server switcher lists the servers and adds one', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await _show(tester, harness);
      await _async(tester, harness.session.signOut);

      await tester.tap(find.text('Change server'));
      await _settle(tester);
      expect(find.text('Servers'), findsOneWidget);
      expect(find.text('Not signed in'), findsOneWidget);

      await tester.tap(find.text('Add server'));
      await _settle(tester);

      expect(harness.auth, isA<NoServer>());
      expect(find.text('Connect to your server'), findsOneWidget);
      expect(find.text('Servers'), findsNothing);
      await _end(tester, harness);
    });
  });

  group('a TV', () {
    testWidgets('picks a server from the list, and signs in with a QR code', (
      tester,
    ) async {
      final harness = Harness();
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      harness.backend.hosts.add('192.168.1.5');
      await _show(
        tester,
        harness,
        device: _tv,
        size: const Size(960, 540),
        nearby: const [DiscoveredServer('Matinee', 'http://192.168.1.5:8420')],
      );
      expect(find.text('Choose your server'), findsOneWidget);

      await tester.tap(find.text('192.168.1.5:8420'));
      await _reach<SignedOut>(tester, harness);

      expect(find.text('Sign in with your phone'), findsOneWidget);
      expect(find.byType(QrCodeCard), findsOneWidget);
      expect(find.text('BCDF-GHJK'), findsOneWidget);
      // The code is all a TV has: no browser button.
      expect(find.text('Sign in with your browser'), findsNothing);
      // One sentence says where to go, and nothing about the phone app.
      expect(
        find.textContaining('Scan the code, or go to', findRichText: true),
        findsOneWidget,
      );
      expect(
        find.textContaining('Settings › Account', findRichText: true),
        findsNothing,
      );
      // The way out sits small at the bottom left, and takes focus.
      expect(_focusedIn(tester, 'Change server'), isTrue);
      expect(find.text('192.168.1.5:8420'), findsOneWidget);
      final change = tester.getRect(find.text('Change server'));
      expect(change.bottom, greaterThan(540 - 27 - 48));
      await _end(tester, harness);
    });

    testWidgets('a code that ran out puts focus on getting a new one', (
      tester,
    ) async {
      final harness = Harness();
      harness.backend
        ..hosts.add('192.168.1.5')
        ..devicePolls.add(
          jsonResponse({
            'code': 'NOT_FOUND',
            'status': 404,
            'message': 'x',
          }, 404),
        );
      await _show(
        tester,
        harness,
        device: _tv,
        size: const Size(960, 540),
        nearby: const [DiscoveredServer('Matinee', 'http://192.168.1.5:8420')],
        poll: (_) async {},
      );
      await tester.tap(find.text('192.168.1.5:8420'));
      await _reach<SignedOut>(tester, harness);
      await _settle(tester);

      expect(find.text('That code expired.'), findsOneWidget);
      expect(find.text('Code expired'), findsOneWidget);
      expect(find.text('BCDF-GHJK'), findsNothing);
      expect(_focusedIn(tester, 'Get a new code'), isTrue);
      // Changing the server stays beside it.
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
      await tester.pump();
      expect(_focusedIn(tester, 'Change server'), isTrue);
      await _end(tester, harness);
    });

    testWidgets('types an address and reaches Connect with the D-pad', (
      tester,
    ) async {
      final harness = Harness();
      harness.backend.hosts.add('a.example');
      await _show(tester, harness, device: _tv, size: const Size(960, 540));
      expect(_focusedIn(tester, 'Enter server address'), isTrue);

      await tester.sendKeyEvent(LogicalKeyboardKey.select);
      await _settle(tester);
      expect(
        tester.widget<EditableText>(_field()).focusNode.hasPrimaryFocus,
        isTrue,
      );
      await tester.enterText(_field(), 'a.example');

      // A one-line field keeps the arrows for its caret unless the TV
      // hands them on.
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pump();
      expect(_focusedIn(tester, 'Connect'), isTrue);
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
      await tester.pump();
      expect(
        tester.widget<EditableText>(_field()).focusNode.hasPrimaryFocus,
        isTrue,
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pump();

      await tester.sendKeyEvent(LogicalKeyboardKey.select);
      await _reach<SignedOut>(tester, harness);
      await _end(tester, harness);
    });

    testWidgets('an unreachable server offers Try again, never downloads', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada'
        ..down['a.example'] = const SocketException('Connection refused');
      await _show(tester, harness, device: _tv, size: const Size(1280, 720));

      expect(find.text("Can't reach your server"), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('Watch downloads'), findsNothing);

      harness.backend.down.clear();
      await tester.tap(find.text('Try again'));
      await _reach<SignedIn>(tester, harness);

      expect(find.text("Can't reach your server"), findsNothing);
      await _end(tester, harness);
    });

    testWidgets('cancelling Add server goes back to where it started', (
      tester,
    ) async {
      final saved = await tester.runAsync(_saved);
      final harness = Harness(prefs: saved!.prefs, secrets: saved.secrets);
      harness.backend
        ..hosts.add('a.example')
        ..tokens['token-a'] = 'ada';
      await _show(tester, harness, device: _tv, size: const Size(960, 540));
      final router = harness.container.read(routerProvider);
      String location() =>
          router.routerDelegate.currentConfiguration.uri.toString();

      // From a page of its own, it comes back to that page.
      router.go('/title/t1');
      await _settle(tester);
      harness.session.addServer();
      await _settle(tester);
      expect(location(), Routes.connect);
      harness.session.cancelAdd();
      await _settle(tester);
      expect(location(), '/title/t1');

      // Settings' server panel names the page to come back to.
      router.go(Routes.home);
      await _settle(tester);
      harness.container
          .read(addServerReturnProvider.notifier)
          .remember('${Routes.settings}?category=server');
      harness.session.addServer();
      await _settle(tester);
      harness.session.cancelAdd();
      await _settle(tester);
      expect(location(), '${Routes.settings}?category=server');
      await _end(tester, harness);
    });
  });
}
