import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/l10n/app_localizations_de.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/media/format.dart';

void main() {
  test('sizes keep one decimal under ten, and bytes none', () {
    final l = AppLocalizationsEn();
    expect(formatBytes(0, l), '0 B');
    expect(formatBytes(5, l), '5 B');
    expect(formatBytes(999, l), '999 B');
    expect(formatBytes(4200, l), '4.2 kB');
    expect(formatBytes(42000000, l), '42 MB');
    expect(formatBytes(7700000000, l), '7.7 GB');
    expect(formatBytes(7700000000, AppLocalizationsDe()), '7,7 GB');
  });
}
