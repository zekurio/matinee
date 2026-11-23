import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/home/home_layout.dart';

void main() {
  test('the showcase goes by the shorter side, so a phone on its side '
      'keeps the phone card', () {
    expect(ShowcaseLayout.shows(const Size(914, 411)), isFalse);
    expect(ShowcaseLayout.shows(const Size(599, 900)), isFalse);
    expect(ShowcaseLayout.shows(const Size(600, 900)), isTrue);
    expect(ShowcaseLayout.shows(const Size(1280, 800)), isTrue);
  });
}
