import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// A page opened over the tabs: under the status bar a 64 band with Back, the
/// title, and [actions] at the end, then [child] filling the rest. Without
/// [onBack] there's no Back, as on a page that's the first of its stack.
class PageFrame extends StatelessWidget {
  const PageFrame({
    super.key,
    required this.child,
    this.title,
    this.onBack,
    this.backLabel,
    this.actions = const [],
  }) : assert(onBack == null || backLabel != null);

  final Widget child;
  final String? title;
  final VoidCallback? onBack;
  final String? backLabel;
  final List<Widget> actions;

  static const barHeight = 64.0;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final back = onBack;
    final title = this.title;
    return ColoredBox(
      color: colors.background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SafeArea(
            bottom: false,
            child: SizedBox(
              height: barHeight,
              child: Padding(
                padding: EdgeInsetsDirectional.only(
                  start: back == null ? 16 : 4,
                  end: 4,
                ),
                child: Row(
                  children: [
                    if (back != null)
                      PageBarButton(
                        icon: Lucide.arrowLeft,
                        label: backLabel!,
                        onPressed: back,
                      ),
                    Expanded(
                      child: title == null
                          ? const SizedBox.shrink()
                          : Padding(
                              padding: EdgeInsetsDirectional.only(
                                start: back == null ? 0 : 4,
                              ),
                              child: Semantics(
                                header: true,
                                child: Text(
                                  title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: KitText.xl
                                      .style(
                                        color: colors.foreground,
                                        weight: FontWeight.w600,
                                      )
                                      .copyWith(
                                        letterSpacing: KitText.xl.size * -.025,
                                      ),
                                ),
                              ),
                            ),
                    ),
                    ...actions,
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// An icon in a bar, with nothing around it: 24 across in 48 square to tap,
/// in a page's bar and a tab's header alike. Pressing dims it; with [count]
/// above zero, a filled accent badge at the icon's top-end corner says how
/// many things, as the filter button does.
class PageBarButton extends StatelessWidget {
  const PageBarButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.count = 0,
    this.focusNode,
  });

  final String icon;
  final String label;
  final VoidCallback? onPressed;

  /// The badge's number, and no badge at zero.
  final int count;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      focusNode: focusNode,
      shape: KitRadius.pill,
      builder: (context, state) => SizedBox.square(
        dimension: 48,
        child: Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              KitIcon(
                icon,
                size: 24,
                color: state == PressState.pressed
                    ? colors.mutedForeground
                    : colors.foreground,
              ),
              if (count > 0)
                PositionedDirectional(
                  top: -6,
                  end: -8,
                  child: _CountBadge(count),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// How many filters are on, at an icon's corner: a filled accent circle
/// with the number in its foreground, grown with the text so it stays
/// legible at the largest size.
class _CountBadge extends StatelessWidget {
  const _CountBadge(this.count);

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final size = math.max(
      16.0,
      MediaQuery.textScalerOf(context)
          .clamp(maxScaleFactor: 1.6)
          .scale(KitText.px11.lineHeight),
    );
    return ExcludeSemantics(
      child: Container(
        height: size,
        constraints: BoxConstraints(minWidth: size),
        padding: const EdgeInsets.symmetric(horizontal: 3),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.accent,
          borderRadius: KitRadius.pill,
        ),
        child: Text(
          '$count',
          maxLines: 1,
          style: KitText.px11.style(
            color: colors.accentForeground,
            weight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
