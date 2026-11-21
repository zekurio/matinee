import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

/// The neutral gradient that stands in for a picture that hasn't loaded or
/// doesn't exist, the same one for the same [key], as the Kotlin app's
/// `toneBrush`: four soft lifts of the raised surface toward the text color,
/// from the top left to the bottom right.
LinearGradient toneGradient(KitColors colors, String key) {
  final lift = _lifts[_hash(key) % _lifts.length];
  return LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color.lerp(colors.surfaceRaised, colors.text, lift)!,
      Color.lerp(colors.surfaceRaised, colors.text, lift / 3)!,
    ],
  );
}

const _lifts = [.07, .09, .11, .10];

/// Java's `String.hashCode`, so a title gets the tone it had in the Kotlin
/// app.
int _hash(String key) {
  var hash = 0;
  for (final unit in key.codeUnits) {
    hash = (hash * 31 + unit).toSigned(32);
  }
  return hash;
}

/// A box filled with [key]'s tone, under [child].
class Tone extends StatelessWidget {
  const Tone({super.key, required this.toneKey, this.radius, this.child});

  final String toneKey;
  final BorderRadius? radius;
  final Widget? child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: toneGradient(MatineeTheme.of(context), toneKey),
      borderRadius: radius,
    ),
    child: child,
  );
}
