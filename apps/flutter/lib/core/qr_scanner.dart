import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/scanner.g.dart';

export '../platform/scanner.g.dart' show ScannerView;

/// The camera reading QR codes, behind `pigeons/scanner.dart`, so tests and
/// platforms without one can stand in for it.
abstract interface class QrScanner {
  /// False on a device without a camera, or without the bridge.
  Future<bool> hasCamera();

  Future<bool> cameraAllowed();

  /// Asks for the camera, and answers whether it's allowed now.
  Future<bool> requestCamera();

  Future<void> openAppSettings();

  /// Starts the camera; throws when it can't.
  Future<ScannerView> start();

  Future<void> stop();

  /// What QR codes in the picture hold, while it runs.
  Stream<String> get codes;
}

/// The Android side, `ScannerBridge.kt`.
final class PlatformQrScanner implements QrScanner, ScannerEvents {
  PlatformQrScanner() {
    ScannerEvents.setUp(this);
  }

  final _api = ScannerApi();
  final _scanned = StreamController<String>.broadcast();

  @override
  Stream<String> get codes => _scanned.stream;

  @override
  void scanned(String text) => _scanned.add(text);

  @override
  Future<bool> hasCamera() async {
    try {
      return await _api.hasCamera();
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> cameraAllowed() => _api.cameraAllowed();

  @override
  Future<bool> requestCamera() => _api.requestCamera();

  @override
  Future<void> openAppSettings() => _api.openAppSettings();

  @override
  Future<ScannerView> start() => _api.start();

  @override
  Future<void> stop() async {
    try {
      await _api.stop();
    } on MissingPluginException {
      // Nothing was started.
    }
  }

  void dispose() {
    ScannerEvents.setUp(null);
    unawaited(_scanned.close());
  }
}

final qrScannerProvider = Provider<QrScanner>((ref) {
  final scanner = PlatformQrScanner();
  ref.onDispose(scanner.dispose);
  return scanner;
});

/// Whether there's a camera to scan with, asked once a page needs it.
final cameraPresentProvider = FutureProvider.autoDispose<bool>(
  (ref) => ref.watch(qrScannerProvider).hasCamera(),
);
