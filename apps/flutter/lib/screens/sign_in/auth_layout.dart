import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';

/// The web's auth screen for a phone, and for a tablet, which keeps the
/// phone's design: the logo in the top corner, and the form below the
/// middle at the phone's width, centered however wide the window is.
/// [backdrop] fills the screen behind them, edge to edge.
class AuthLayout extends StatelessWidget {
  const AuthLayout({super.key, required this.children, this.backdrop});

  /// The form's width, wherever it sits.
  static const formWidth = 420.0;

  final List<Widget> children;
  final Widget? backdrop;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ?backdrop,
          SafeArea(
            // The form moves up for the keyboard; the backdrop stays put.
            child: KeyboardRoom(
              child: Stack(
                children: [
                  const PositionedDirectional(
                    top: 0,
                    start: 0,
                    child: AuthBrand(),
                  ),
                  LayoutBuilder(
                    // Centered while it fits, scrolling once it doesn't.
                    builder: (context, box) => SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 26,
                        vertical: 96,
                      ),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: math.max(0, box.maxHeight - 192),
                        ),
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                              maxWidth: formWidth - 52,
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: children,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The logo, in the top corner of the sign-in screens.
class AuthBrand extends StatelessWidget {
  const AuthBrand({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 24),
    child: Logo(height: 22, label: AppLocalizations.of(context).appName),
  );
}

/// A heading and the line under it, as every auth screen opens.
class AuthHeading extends StatelessWidget {
  const AuthHeading({
    super.key,
    required this.title,
    this.description,
    this.centered = false,
  });

  final String title;
  final String? description;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final align = centered ? TextAlign.center : TextAlign.start;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Semantics(
          header: true,
          child: Text(
            title,
            textAlign: align,
            style: KitText.px28.style(
              color: colors.foreground,
              weight: FontWeight.w600,
            ),
          ),
        ),
        if (description case final text?)
          Text(
            text,
            textAlign: align,
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
      ],
    );
  }
}

/// A line of what went wrong, in the danger color.
class AuthError extends StatelessWidget {
  const AuthError(this.message, {super.key, this.centered = false});

  final String message;
  final bool centered;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Text(
      message,
      textAlign: centered ? TextAlign.center : TextAlign.start,
      style: KitText.sm.style(color: MatineeTheme.of(context).danger),
    ),
  );
}

/// A button's contents while it works: a spinner beside the label.
class BusyLabel extends StatelessWidget {
  const BusyLabel({
    super.key,
    required this.busy,
    required this.label,
    required this.color,
  });

  final bool busy;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    spacing: 8,
    children: [
      if (busy) Spinner(size: 18, color: color),
      Flexible(child: Text(label)),
    ],
  );
}

/// The screen between an auth state and the route that follows it, for a
/// frame.
class AuthBlank extends StatelessWidget {
  const AuthBlank({super.key});

  @override
  Widget build(BuildContext context) =>
      ColoredBox(color: MatineeTheme.of(context).background);
}
