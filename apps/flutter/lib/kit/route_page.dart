import 'package:flutter/material.dart';

/// A page that slides in the platform's way, from the theme: on iOS
/// Cupertino's slide, which brings the swipe back from the screen's edge.
Page<void> kitPage({
  required LocalKey key,
  required String? name,
  required Widget child,
}) => MaterialPage<void>(key: key, name: name, child: child);
