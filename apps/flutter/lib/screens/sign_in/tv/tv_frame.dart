import 'package:flutter/widgets.dart';

import '../../../kit/kit.dart';

/* What the TV's sign-in screens are made of, laid out as Google TV's setup:
   the mark and name at the top left, what this step is about on the left,
   and the things to pick on the right, both centred down the screen. */

/// The room a TV's picture loses at its edges.
const tvOverscanHorizontal = 32.0;
const tvOverscanVertical = 27.0;

/// A TV screen before signing in. [side] takes the left's room under the
/// heading, like a code to type; [split] is how much of the width the left
/// gets. [backdrop] fills the screen behind it all, like the server's login
/// backdrop.
class TvAuthFrame extends StatelessWidget {
  const TvAuthFrame({
    super.key,
    required this.title,
    required this.children,
    this.description,
    this.split = .42,
    this.backdrop,
    this.side = const [],
  });

  final String title;
  final String? description;
  final double split;
  final Widget? backdrop;
  final List<Widget> side;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ?backdrop,
          FocusTraversalGroup(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: tvOverscanHorizontal,
                vertical: tvOverscanVertical,
              ),
              child: Row(
                spacing: 64,
                children: [
                  Expanded(
                    flex: (split * 100).round(),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            title,
                            style: KitText.px36.style(
                              color: colors.foreground,
                              weight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (description case final text?)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              text,
                              style: KitText.base.style(
                                color: colors.mutedForeground,
                              ),
                            ),
                          ),
                        ...side,
                      ],
                    ),
                  ),
                  Expanded(
                    flex: 100 - (split * 100).round(),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: children,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const PositionedDirectional(
            top: tvOverscanVertical + 16,
            start: tvOverscanHorizontal,
            child: ExcludeSemantics(child: _TvBrand()),
          ),
        ],
      ),
    );
  }
}

class _TvBrand extends StatelessWidget {
  const _TvBrand();

  @override
  Widget build(BuildContext context) => const Logo(height: 24);
}

/// A row to pick on a TV, a large target that fills with the text color
/// while it has focus. [quiet] rows have no resting fill; [subtitle] sits
/// under the title.
class TvListItem extends StatelessWidget {
  const TvListItem({
    super.key,
    required this.title,
    required this.onPressed,
    this.icon,
    this.subtitle,
    this.trailing,
    this.quiet = false,
    this.autofocus = false,
    this.focusNode,
  });

  final String title;
  final String? subtitle;
  final String? icon;
  final Widget? trailing;
  final VoidCallback? onPressed;
  final bool quiet;
  final bool autofocus;
  final FocusNode? focusNode;

  static const _shape = BorderRadius.all(Radius.circular(14));

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      autofocus: autofocus,
      focusNode: focusNode,
      shape: _shape,
      showFocusRing: false,
      label: subtitle == null ? title : '$title, $subtitle',
      builder: (context, state) {
        final focused =
            state == PressState.focused ||
            state == PressState.pressed ||
            state == PressState.hovered;
        final content = focused ? colors.background : colors.foreground;
        final muted = focused
            ? colors.background.withValues(alpha: .7)
            : colors.mutedForeground;
        return AnimatedScale(
          scale: focused ? 1.03 : 1,
          duration: const Duration(milliseconds: 120),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: _shape,
              color: focused
                  ? colors.foreground
                  : colors.foreground.withValues(alpha: quiet ? 0 : .07),
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: subtitle == null ? 60 : 72,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  spacing: 16,
                  children: [
                    if (icon case final name?)
                      KitIcon(name, size: 24, color: content),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.xl.style(
                              color: content,
                              weight: FontWeight.w600,
                            ),
                          ),
                          if (subtitle case final text?)
                            Text(
                              text,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: KitText.px15.style(
                                color: muted,
                                weight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (trailing case final widget?)
                      DefaultTextStyle(
                        style: KitText.sm.style(color: content),
                        child: widget,
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// A small heading over a group of rows.
class TvListHeading extends StatelessWidget {
  const TvListHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 20, top: 12),
    child: Text(
      text,
      style: KitText.px15.style(
        color: MatineeTheme.of(context).mutedForeground,
        weight: FontWeight.w500,
      ),
    ),
  );
}

/// A short message under a list, such as what went wrong.
class TvNote extends StatelessWidget {
  const TvNote(this.text, {super.key, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: 20, top: 4, bottom: 4),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Semantics(
          liveRegion: danger,
          child: Text(
            text,
            style: KitText.base.style(
              color: danger ? colors.danger : colors.mutedForeground,
            ),
          ),
        ),
      ),
    );
  }
}
