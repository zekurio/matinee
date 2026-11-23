import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What the app has to carry about the licenses of what it's built from,
/// for the licenses page: the project's own license, and every package's,
/// Dart's and Flutter's from [LicenseRegistry] (the NOTICES file the build
/// writes), with what that file can't know added here: the native
/// libraries the build bundles, the fonts, and the icons.

/// The name the project's own license goes by in the list.
const projectPackage = 'Matinee';

/// A license the build bundles that Flutter's NOTICES leaves out: the
/// [packages] it covers, a [copyright] line before it when the license's
/// text has none, and the [asset] its text is in.
typedef BundledLicense = ({
  List<String> packages,
  String? copyright,
  String asset,
});

const _gpl = 'LICENSE';
const _apache = 'assets/licenses/apache-2.0.txt';

/// What every build carries: the project's license, the fonts, and the
/// icons drawn from lucide.
const commonLicenses = <BundledLicense>[
  (packages: [projectPackage], copyright: null, asset: _gpl),
  (
    packages: ['Red Hat Text'],
    copyright: null,
    asset: 'assets/licenses/red-hat-text-ofl.txt',
  ),
  (
    packages: ['Unbounded'],
    copyright: null,
    asset: 'assets/licenses/unbounded-ofl.txt',
  ),
  (
    packages: ['Lucide'],
    copyright: null,
    asset: 'assets/licenses/lucide-isc.txt',
  ),
];

/// The native libraries the Android build bundles, from
/// `android/app/build.gradle.kts`. libmpv and Jellyfin's FFmpeg decoder
/// are GPL builds, which is why the app is GPL-3.0.
const androidLicenses = <BundledLicense>[
  (
    packages: ['libmpv (mpv-android)'],
    copyright:
        'Copyright © mpv contributors. Built by edde746/mpv-build, with '
        'FFmpeg, libass, and the other libraries the AAR carries notices '
        'for, under the GNU General Public License, version 3.',
    asset: _gpl,
  ),
  (
    packages: ['FFmpeg (Jellyfin Media3 FFmpeg decoder)'],
    copyright:
        'Copyright © the FFmpeg developers and Jellyfin contributors. A GPL '
        'build of FFmpeg, under the GNU General Public License, version 3.',
    asset: _gpl,
  ),
  (
    packages: ['AndroidX Media3'],
    copyright: 'Copyright © The Android Open Source Project',
    asset: _apache,
  ),
  (
    packages: ['AndroidX CameraX'],
    copyright: 'Copyright © The Android Open Source Project',
    asset: _apache,
  ),
  (
    packages: ['AndroidX WorkManager'],
    copyright: 'Copyright © The Android Open Source Project',
    asset: _apache,
  ),
  (
    packages: ['AndroidX Core'],
    copyright: 'Copyright © The Android Open Source Project',
    asset: _apache,
  ),
  (packages: ['ZXing'], copyright: 'Copyright © ZXing authors', asset: _apache),
  (
    packages: ['OkHttp', 'Okio'],
    copyright: 'Copyright © Square, Inc.',
    asset: _apache,
  ),
  (
    packages: ['Kotlin', 'kotlinx.coroutines'],
    copyright: 'Copyright © JetBrains s.r.o. and Kotlin contributors',
    asset: _apache,
  ),
];

/// The native libraries the iOS build links, from the MPVKit Swift package
/// in `ios/Runner.xcodeproj`, a GPL build like Android's.
const iosLicenses = <BundledLicense>[
  (
    packages: ['libmpv (MPVKit)'],
    copyright:
        'Copyright © mpv contributors. Built by edde746/mpv-build, with '
        'FFmpeg, libass, and the other libraries it carries notices for, '
        'under the GNU General Public License, version 3.',
    asset: _gpl,
  ),
];

/// One package and the license texts that cover it.
@immutable
final class PackageLicenses {
  const PackageLicenses(this.package, this.licenses);

  final String package;

  /// Each license's paragraphs, as [LicenseEntry.paragraphs] has them.
  final List<List<LicenseParagraph>> licenses;
}

/// Where the licenses come from: [LicenseRegistry], which tests replace.
final licenseRegistryProvider = Provider<Stream<LicenseEntry> Function()>(
  (ref) =>
      () => LicenseRegistry.licenses,
);

/// The text of the bundled [asset], read afresh. Not `loadString`, which
/// hands a text as long as the GPL's to another isolate, costing more than
/// the decoding, and keeps every text it read for as long as the app runs.
Future<String> loadAssetText(String asset) async {
  final bytes = await rootBundle.load(asset);
  return utf8.decode(
    bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
  );
}

/// The licenses the build bundles that NOTICES doesn't have, the native
/// libraries of the [platform] among them.
Stream<LicenseEntry> bundledLicenses(TargetPlatform platform) async* {
  final native = switch (platform) {
    TargetPlatform.android => androidLicenses,
    TargetPlatform.iOS => iosLicenses,
    _ => const <BundledLicense>[],
  };
  for (final license in [...commonLicenses, ...native]) {
    final text = await loadAssetText(license.asset);
    final copyright = license.copyright;
    yield LicenseEntryWithLineBreaks(
      license.packages,
      copyright == null ? text : '$copyright\n\n$text',
    );
  }
}

/// Every package's licenses, the project's first and the rest by name, each
/// package once with every license that covers it.
final licensesProvider = FutureProvider.autoDispose<List<PackageLicenses>>((
  ref,
) async {
  final registry = ref.watch(licenseRegistryProvider);
  final byPackage = <String, List<List<LicenseParagraph>>>{};
  Future<void> take(Stream<LicenseEntry> entries) async {
    await for (final entry in entries) {
      final paragraphs = entry.paragraphs.toList();
      for (final package in entry.packages) {
        byPackage.putIfAbsent(package, () => []).add(paragraphs);
      }
    }
  }

  await take(bundledLicenses(defaultTargetPlatform));
  await take(registry());
  final names = byPackage.keys.where((name) => name != projectPackage).toList()
    ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
  return [
    for (final name in [projectPackage, ...names])
      PackageLicenses(name, byPackage[name]!),
  ];
}, retry: (_, _) => null);
