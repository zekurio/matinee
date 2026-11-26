import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

/// The neutral gradient that stands in for a picture that hasn't loaded or
/// doesn't exist, the same one for the same [key]: one of the web's four
/// tones in `picture.tsx`, steps far enough apart that neighbouring shows
/// look different, each leaning its own way. A light theme lifts the
/// raised surface toward the text colour instead, so the stand-in stays
/// soft on a light page.
LinearGradient toneGradient(KitColors colors, String key) {
  final index = _hash(key).abs() % _tones.length;
  if (colors.isDark) return _tones[index];
  final lift = _lifts[index];
  return LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color.lerp(colors.surfaceRaised, colors.text, lift)!,
      Color.lerp(colors.surfaceRaised, colors.text, lift / 3)!,
    ],
  );
}

/// The web's `bg-gradient-to-br`, `-tr`, `-b`, and `-bl` tones.
const _tones = [
  LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF26262A), Color(0xFF1A1A1D)],
  ),
  LinearGradient(
    begin: Alignment.bottomLeft,
    end: Alignment.topRight,
    colors: [Color(0xFF2B2B2F), Color(0xFF1E1E21)],
  ),
  LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF303035), Color(0xFF1C1C1F)],
  ),
  LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF2D2D32), Color(0xFF202023)],
  ),
];

const _lifts = [.07, .09, .11, .10];

/// JavaScript's `(hash * 31 + code) | 0`, as the web's `tone` hashes.
int _hash(String key) {
  var hash = 0;
  for (final unit in key.codeUnits) {
    hash = (hash * 31 + unit).toSigned(32);
  }
  return hash;
}

/// A box filled with [key]'s tone, under [child].
class Tone extends StatelessWidget {
  const Tone({super.key, required this.toneKey, this.child});

  final String toneKey;
  final Widget? child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: toneGradient(MatineeTheme.of(context), toneKey),
    ),
    child: child,
  );
}
