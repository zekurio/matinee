import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'l10n_test.dart' show readArb;

/// The characters the font at [path] has a glyph for, from its `cmap`
/// table: the Unicode subtables in format 4 (the basic plane) and 12 (all
/// of it), which is what a TrueType font for text carries.
Set<int> fontCharacters(String path) {
  final data = ByteData.sublistView(File(path).readAsBytesSync());
  int u16(int at) => data.getUint16(at);
  int u32(int at) => data.getUint32(at);

  int? cmap;
  for (var i = 0, tables = u16(4); i < tables; i++) {
    final record = 12 + 16 * i;
    if (String.fromCharCodes([
          for (var b = 0; b < 4; b++) data.getUint8(record + b),
        ]) ==
        'cmap') {
      cmap = u32(record + 8);
    }
  }
  if (cmap == null) throw StateError('$path has no cmap table');

  final characters = <int>{};
  for (var i = 0, subtables = u16(cmap + 2); i < subtables; i++) {
    final platform = u16(cmap + 4 + 8 * i);
    final encoding = u16(cmap + 6 + 8 * i);
    final unicode = platform == 0 || (platform == 3 && encoding != 0);
    if (!unicode) continue;
    final at = cmap + u32(cmap + 8 + 8 * i);
    switch (u16(at)) {
      case 4:
        final segments = u16(at + 6) ~/ 2;
        final ends = at + 14;
        final starts = ends + 2 * segments + 2;
        final deltas = starts + 2 * segments;
        final offsets = deltas + 2 * segments;
        for (var s = 0; s < segments; s++) {
          final start = u16(starts + 2 * s);
          final end = u16(ends + 2 * s);
          final delta = u16(deltas + 2 * s);
          final offset = u16(offsets + 2 * s);
          for (var c = start; c <= end && c != 0xFFFF; c++) {
            final int glyph;
            if (offset == 0) {
              glyph = (c + delta) & 0xFFFF;
            } else {
              final index = offsets + 2 * s + offset + 2 * (c - start);
              final raw = u16(index);
              glyph = raw == 0 ? 0 : (raw + delta) & 0xFFFF;
            }
            if (glyph != 0) characters.add(c);
          }
        }
      case 12:
        for (var g = 0, groups = u32(at + 12); g < groups; g++) {
          final group = at + 16 + 12 * g;
          final first = u32(group + 8);
          for (var c = u32(group); c <= u32(group + 4); c++) {
            if (first + c - u32(group) != 0) characters.add(c);
          }
        }
    }
  }
  return characters;
}

void main() {
  test('the bundled font draws every character of every string', () {
    final drawn = fontCharacters('assets/fonts/red_hat_text.ttf');
    // A sanity check of the reading: the font has these, and not these.
    expect(drawn, containsAll('Aa0·…–’äöüß'.runes));
    expect(drawn.contains('→'.runes.single), isFalse);
    expect(drawn.contains('★'.runes.single), isFalse);

    final missing = <String>[];
    for (final locale in ['en', 'de']) {
      for (final MapEntry(:key, :value) in readArb(locale).entries) {
        if (key.startsWith('@') || value is! String) continue;
        for (final rune in value.runes) {
          if (rune == 0x0A || drawn.contains(rune)) continue;
          final code = rune.toRadixString(16).toUpperCase().padLeft(4, '0');
          missing.add('$locale $key: "${String.fromCharCode(rune)}" (U+$code)');
        }
      }
    }
    expect(
      missing,
      isEmpty,
      reason:
          'Red Hat Text has no glyph for these, so they draw as boxes or in '
          "another font. Reword the string, or draw the kit's icon.",
    );
  });
}
