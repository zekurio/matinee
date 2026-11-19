import 'package:flutter/services.dart';

import '../platform/device.g.dart';

/// This APK installs over the Kotlin app, and existing installs start
/// fresh: on the first launch the platform deletes the Kotlin app's
/// preference files and downloads folder, and keeps a marker so it never
/// runs again. Await it in `main` before anything reads storage. Answers
/// whether it ran; where the bridge isn't there, there's nothing to delete.
Future<bool> freshStart() async {
  try {
    return await DeviceApi().freshStart();
  } on MissingPluginException {
    return false;
  } on PlatformException {
    return false;
  }
}
