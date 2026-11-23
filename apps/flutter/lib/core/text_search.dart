/// Text as a search compares it: lowercased, with the accents and marks
/// taken off, so "Amélie" is found by "amelie", "Mädchen" by "madchen",
/// and "Straße" by "strasse". It leaves the letters' order and everything
/// else as it is.
String foldSearchText(String text) {
  final folded = StringBuffer();
  for (final rune in text.toLowerCase().runes) {
    // A letter written with its accent as a separate mark.
    if (rune >= 0x0300 && rune <= 0x036f) continue;
    folded.write(_folded[rune] ?? String.fromCharCode(rune));
  }
  return folded.toString();
}

/// The Latin letters with a mark, and the few that stand for two, each as
/// the plain letters a search types in their place.
const _folded = <int, String>{
  // A.
  0x00e0: 'a', 0x00e1: 'a', 0x00e2: 'a', 0x00e3: 'a', 0x00e4: 'a',
  0x00e5: 'a', 0x0101: 'a', 0x0103: 'a', 0x0105: 'a', 0x01ce: 'a',
  0x00e6: 'ae',
  // C.
  0x00e7: 'c', 0x0107: 'c', 0x0109: 'c', 0x010b: 'c', 0x010d: 'c',
  // D.
  0x010f: 'd', 0x0111: 'd', 0x00f0: 'd',
  // E.
  0x00e8: 'e', 0x00e9: 'e', 0x00ea: 'e', 0x00eb: 'e', 0x0113: 'e',
  0x0115: 'e', 0x0117: 'e', 0x0119: 'e', 0x011b: 'e',
  // G.
  0x011d: 'g', 0x011f: 'g', 0x0121: 'g', 0x0123: 'g',
  // I.
  0x00ec: 'i', 0x00ed: 'i', 0x00ee: 'i', 0x00ef: 'i', 0x0129: 'i',
  0x012b: 'i', 0x012d: 'i', 0x012f: 'i', 0x01d0: 'i', 0x0131: 'i',
  // L.
  0x013a: 'l', 0x013c: 'l', 0x013e: 'l', 0x0142: 'l',
  // N.
  0x00f1: 'n', 0x0144: 'n', 0x0146: 'n', 0x0148: 'n', 0x0149: 'n',
  // O.
  0x00f2: 'o', 0x00f3: 'o', 0x00f4: 'o', 0x00f5: 'o', 0x00f6: 'o',
  0x014d: 'o', 0x014f: 'o', 0x0151: 'o', 0x01d2: 'o', 0x00f8: 'o',
  0x0153: 'oe',
  // R.
  0x0155: 'r', 0x0159: 'r',
  // S.
  0x015b: 's', 0x015d: 's', 0x015f: 's', 0x0219: 's', 0x00df: 'ss',
  0x017f: 's',
  // T.
  0x0163: 't', 0x0165: 't', 0x021b: 't', 0x0167: 't', 0x00fe: 'th',
  // U.
  0x00f9: 'u', 0x00fa: 'u', 0x00fb: 'u', 0x00fc: 'u', 0x0169: 'u',
  0x016b: 'u', 0x016d: 'u', 0x016f: 'u', 0x0171: 'u', 0x0173: 'u',
  0x01d4: 'u',
  // Y.
  0x00fd: 'y', 0x00ff: 'y', 0x0177: 'y',
  // Z.
  0x017a: 'z', 0x017c: 'z', 0x017e: 'z',
};
