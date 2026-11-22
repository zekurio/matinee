import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only the app and kit depend on Material or Cupertino', () {
    final forbidden = RegExp(
      r"""\b(?:import|export)\s+(?:r?['"][^'"]+['"]\s*if\s*\([^)]*\)\s+)*r?['"]package:flutter/(?:material|cupertino)\.dart['"]""",
    );
    final violations =
        Directory('lib')
            .listSync(recursive: true)
            .whereType<File>()
            .where(
              (file) =>
                  file.path.endsWith('.dart') &&
                  file.path != 'lib/app.dart' &&
                  !file.path.startsWith('lib/kit/') &&
                  forbidden.hasMatch(file.readAsStringSync()),
            )
            .map((file) => file.path)
            .toList()
          ..sort();

    expect(
      violations,
      isEmpty,
      reason: 'Screens use Flutter widgets and the Matinee kit.',
    );
  });
}
