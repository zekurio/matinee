import 'package:flutter/material.dart';

/// A page that opens over another as the theme says: on Android the kit's
/// cover and uncover (`page_motion.dart`), on iOS Cupertino's
/// slide, which brings the swipe back from the screen's edge.
Page<void> kitPage({
  required LocalKey key,
  required String? name,
  required Widget child,
}) => MaterialPage<void>(key: key, name: name, child: child);
