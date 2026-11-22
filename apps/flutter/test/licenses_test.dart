import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/licenses.dart';

void main() {
  test('every library the Android build bundles has its license here', () {
    // Each dependency's group, and the entry that carries its license.
    const carried = {
      'edde746:mpv-android': 'libmpv (mpv-android)',
      'androidx.media3': 'AndroidX Media3',
      'org.jellyfin.media3': 'FFmpeg (Jellyfin Media3 FFmpeg decoder)',
      'org.jetbrains.kotlinx': 'kotlinx.coroutines',
      'androidx.camera': 'AndroidX CameraX',
      'com.google.zxing': 'ZXing',
      'androidx.work': 'AndroidX WorkManager',
      'com.squareup.okhttp3': 'OkHttp',
    };
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    final groups = [
      for (final match in RegExp(
        r'^\s*implementation\("([^":]+)(:[^":]+)?',
        multiLine: true,
      ).allMatches(gradle))
        match[1] == 'edde746' ? 'edde746${match[2]}' : match[1]!,
    ];
    expect(groups, isNotEmpty);
    final packages = {
      for (final license in androidLicenses) ...license.packages,
    };
    for (final group in groups) {
      expect(
        carried[group],
        isNotNull,
        reason: '$group is bundled; add its license to androidLicenses',
      );
      expect(packages, contains(carried[group]));
    }
  });
}
