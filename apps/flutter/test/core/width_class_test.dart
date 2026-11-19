import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/width_class.dart';

void main() {
  test(
    'phones are compact, tablets medium in portrait and expanded in landscape',
    () {
      expect(WidthClass.of(412), WidthClass.compact);
      expect(WidthClass.of(599.9), WidthClass.compact);
      expect(WidthClass.of(600), WidthClass.medium);
      expect(WidthClass.of(800), WidthClass.medium);
      expect(WidthClass.of(840), WidthClass.expanded);
      expect(WidthClass.of(1280), WidthClass.expanded);
    },
  );
}
