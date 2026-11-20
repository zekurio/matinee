import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/qr_scanner.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/link_device.dart';

import '../media/harness.dart';
import 'home_backend.dart';

/// The camera, as a test drives it: QR codes come when [show] says.
final class FakeScanner implements QrScanner {
  FakeScanner({this.camera = true, this.allowed = true, this.grants = true});

  final bool camera;
  bool allowed;

  /// What the prompt answers.
  bool grants;
  var requests = 0;
  var settingsOpened = 0;
  var startFails = false;
  var running = false;
  final _codes = StreamController<String>.broadcast();

  void show(String text) => _codes.add(text);

  @override
  Stream<String> get codes => _codes.stream;

  @override
  Future<bool> hasCamera() async => camera;

  @override
  Future<bool> cameraAllowed() async => allowed;

  @override
  Future<bool> requestCamera() async {
    requests++;
    return allowed = grants;
  }

  @override
  Future<void> openAppSettings() async => settingsOpened++;

  @override
  Future<ScannerView> start() async {
    if (startFails) throw PlatformException(code: 'camera');
    running = true;
    return ScannerView(
      textureId: 1,
      width: 1280,
      height: 720,
      quarterTurns: 1,
      mirrored: false,
    );
  }

  @override
  Future<void> stop() async => running = false;
}

const _code = 'BCDF-GHJK';
const _device = '/api/v1/auth/device/$_code';

HomeBackend _backend() => HomeBackend()
  ..answers[_device] = {
    'userCode': _code,
    'deviceName': 'Living room',
    'platform': 'androidtv',
    'expiresAt': '2026-11-20T10:00:00.000Z',
  }
  ..answers['$_device/approve'] = null;

Future<FakeScanner> _pump(
  WidgetTester tester,
  HomeBackend backend, {
  FakeScanner? scanner,
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
}) async {
  final camera = scanner ?? FakeScanner();
  await pumpScreen(
    tester,
    const LinkDeviceScreen(),
    client: backend.client,
    size: size,
    colors: colors,
    overrides: [qrScannerProvider.overrideWithValue(camera)],
  );
  return camera;
}

Future<void> _scan(
  WidgetTester tester,
  FakeScanner scanner,
  String text,
) async {
  scanner.show(text);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFont);

  testWidgets('scans the code and approves the device', (tester) async {
    final backend = _backend();
    final scanner = await _pump(tester, backend);
    expect(scanner.running, isTrue);
    expect(find.text('Point the camera at the QR code on the TV.'), findsOne);
    expect(find.text('Or enter the code'), findsOneWidget);
    await _scan(tester, scanner, '$server/link?code=bcdfghjk');
    expect(scanner.running, isFalse);
    expect(find.text('Living room'), findsOneWidget);
    expect(find.text('Android TV'), findsOneWidget);
    expect(
      find.text('This device wants to use Matinee as ada.', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Code $_code', findRichText: true), findsOneWidget);
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    expect(backend.asked, contains('$_device/approve'));
    expect(find.text('Signed in'), findsOneWidget);
    expect(
      find.text(
        'Living room is signed in as ada. It may take a few seconds to '
        'notice.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('says when a QR code is something else', (tester) async {
    final scanner = await _pump(tester, _backend());
    await _scan(tester, scanner, 'https://example.org/menu');
    expect(find.text("That QR code isn't a Matinee sign-in."), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Point the camera at the QR code on the TV.'), findsOne);
  });

  testWidgets('asks for the camera, then sends to the settings', (
    tester,
  ) async {
    final scanner = await _pump(
      tester,
      _backend(),
      scanner: FakeScanner(allowed: false, grants: false),
    );
    expect(scanner.requests, 1);
    expect(
      find.text('Allow the camera to scan the code the TV shows.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Allow camera'));
    await tester.pumpAndSettle();
    expect(scanner.requests, 2);
    await tester.tap(find.text('Allow camera'));
    await tester.pumpAndSettle();
    expect(scanner.requests, 2);
    expect(scanner.settingsOpened, 1);
    // Allowed there, and back in the app.
    scanner.allowed = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(scanner.running, isTrue);
  });

  testWidgets("a camera that won't start says so", (tester) async {
    await _pump(tester, _backend(), scanner: FakeScanner()..startFails = true);
    expect(find.text("Couldn't start the camera."), findsOneWidget);
  });

  testWidgets('without a camera, the code is typed', (tester) async {
    final backend = _backend();
    await _pump(tester, backend, scanner: FakeScanner(camera: false));
    expect(find.text('Enter the code your TV or app shows.'), findsOneWidget);
    expect(find.text('Or enter the code'), findsNothing);
    await tester.enterText(find.byType(EditableText), 'BCD');
    await tester.pump();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the 8 letters the device shows.'), findsOneWidget);
    expect(backend.asked, isNot(contains(_device)));
    await tester.enterText(find.byType(EditableText), 'bcdf ghjk');
    await tester.testTextInput.receiveAction(TextInputAction.go);
    await tester.pumpAndSettle();
    expect(backend.asked, contains(_device));
    expect(find.text('Living room'), findsOneWidget);
  });

  testWidgets('a code from another server explains', (tester) async {
    final backend = _backend()..answers.remove(_device);
    final scanner = await _pump(tester, backend);
    await _scan(tester, scanner, 'https://other.example.org/link?code=$_code');
    expect(find.text("That code doesn't work"), findsOneWidget);
    expect(
      find.text(
        'The code came from https://other.example.org, and this app is '
        'signed in to $server.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Scan again'));
    await tester.pumpAndSettle();
    expect(find.text('Or enter the code'), findsOneWidget);
    expect(scanner.running, isTrue);
  });

  testWidgets('a failed lookup tries again', (tester) async {
    final backend = _backend()..failing[_device] = 'Down for upkeep';
    await _pump(tester, backend, scanner: FakeScanner(camera: false));
    await tester.enterText(find.byType(EditableText), _code);
    await tester.pump();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't look up that code"), findsOneWidget);
    expect(find.text('Down for upkeep'), findsOneWidget);
    expect(find.text('Enter another code'), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Living room'), findsOneWidget);
  });

  testWidgets('a refused approval stays, saying why', (tester) async {
    final backend = _backend()..failing['$_device/approve'] = 'Not allowed';
    final scanner = await _pump(tester, backend);
    await _scan(tester, scanner, _code);
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't approve the device. Not allowed"), findsOne);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Or enter the code'), findsOneWidget);
  });

  for (final (name, approve, size, colors) in [
    ('scan_phone_dark', false, const Size(412, 915), matineeDark),
    ('approve_phone_dark', true, const Size(412, 915), matineeDark),
    ('approve_tablet_light', true, const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('linking a device, $name', (tester) async {
      final scanner = await _pump(
        tester,
        _backend(),
        size: size,
        colors: colors,
      );
      if (approve) await _scan(tester, scanner, _code);
      await expectLater(
        find.byType(LinkDeviceScreen),
        matchesGoldenFile('goldens/link_device_$name.png'),
      );
    });
  }
}
