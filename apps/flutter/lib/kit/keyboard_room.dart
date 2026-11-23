import 'package:flutter/widgets.dart';

/// Room for the on-screen keyboard: [child] ends where the keyboard starts,
/// so a field under it scrolls into view rather than staying covered. The
/// page frame, the dialog, the sheet, and the sign-in layout each have one,
/// which is why a screen never reads the keyboard's inset itself. Inside,
/// the inset reads as none, so one within another doesn't make room twice.
class KeyboardRoom extends StatelessWidget {
  const KeyboardRoom({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: MediaQuery.removeViewInsets(
      context: context,
      removeBottom: true,
      child: child,
    ),
  );
}
