import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// The last card of a TV row whose heading would lead to the rest on a
/// phone: a heading can't take focus on a TV, so this does. [label] says
/// what it opens, "See all", and [detail] which, the row's name. It's a
/// picture card's size, [width] by [aspect], and grows as one does.
class TvSeeAllCard extends StatelessWidget {
  const TvSeeAllCard({
    super.key,
    required this.label,
    required this.detail,
    required this.onPressed,
    this.width = TvCards.posterWidth,
    this.aspect = 2 / 3,
    this.focusNode,
    this.onFocused,
  });

  final String label;
  final String detail;
  final VoidCallback onPressed;
  final double? width;
  final double aspect;
  final FocusNode? focusNode;
  final VoidCallback? onFocused;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return SizedBox(
      width: width,
      child: AspectRatio(
        aspectRatio: aspect,
        child: TvFocusable(
          focusNode: focusNode,
          onPressed: onPressed,
          label: '$label, $detail',
          onFocusChange: (focused) {
            if (focused) onFocused?.call();
          },
          builder: (context, focused) => TvPictureFocus(
            focused: focused,
            child: ColoredBox(
              color: colors.secondary,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  spacing: 10,
                  children: [
                    DecoratedBox(
                      decoration: ShapeDecoration(
                        shape: const CircleBorder(),
                        color: colors.foreground.withValues(alpha: .12),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: KitIcon(
                          Lucide.chevronRight,
                          size: 24,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TvType.label.style(color: colors.foreground),
                    ),
                    Text(
                      detail,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TvType.caption.style(
                        color: colors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A box at the start of a [TvListItem], ticked while [checked], for a
/// choice of several, as a show's seasons to request. It takes the row's
/// content color, so it reads on the focused row's fill.
class TvCheckBox extends StatelessWidget {
  const TvCheckBox({super.key, required this.checked});

  final bool checked;

  static const size = 24.0;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final color = DefaultTextStyle.of(context).style.color ?? colors.foreground;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.all(Radius.circular(6)),
        color: checked ? color : null,
        border: Border.all(color: color.withValues(alpha: .7), width: 2),
      ),
      child: checked
          ? KitIcon(
              Lucide.check,
              size: 16,
              // The check in whichever of the two the fill is further from.
              color:
                  _apart(color, colors.background) >
                      _apart(color, colors.foreground)
                  ? colors.background
                  : colors.foreground,
            )
          : null,
    );
  }
}

/// How far apart two colours are in lightness.
double _apart(Color a, Color b) =>
    (a.computeLuminance() - b.computeLuminance()).abs();

/// A list row whose value Left and Right step, as a range's low or high
/// end: [label] at its start, [value] at its end between arrows while
/// it's focused. [onStep] gets -1 or 1; held, the remote repeats it.
class TvStepRow extends StatelessWidget {
  const TvStepRow({
    super.key,
    required this.label,
    required this.value,
    required this.onStep,
    this.autofocus = false,
    this.focusNode,
  });

  final String label;
  final String value;
  final ValueChanged<int> onStep;
  final bool autofocus;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TvFocusable(
      autofocus: autofocus,
      focusNode: focusNode,
      label: label,
      value: value,
      button: false,
      onKey: (event) {
        final step = switch (event.logicalKey) {
          LogicalKeyboardKey.arrowLeft => -1,
          LogicalKeyboardKey.arrowRight => 1,
          _ => 0,
        };
        if (step == 0) return KeyEventResult.ignored;
        if (event is! KeyUpEvent) onStep(step);
        return KeyEventResult.handled;
      },
      builder: (context, focused) => TvControl(
        focused: focused,
        radius: TvListItems.radius,
        rest: colors.foreground.withValues(alpha: .07),
        scale: TvFocus.rowScale,
        builder: (context, content) {
          final arrow = focused ? content : const Color(0x00000000);
          return SizedBox(
            height: TvListItems.height,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: TvListItems.inset,
              ),
              child: Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.facts.style(color: content),
                    ),
                  ),
                  GestureDetector(
                    onTap: focused ? () => onStep(-1) : null,
                    child: KitIcon(Lucide.chevronLeft, size: 20, color: arrow),
                  ),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 72),
                    child: Text(
                      value,
                      maxLines: 1,
                      textAlign: TextAlign.center,
                      style: TvType.label.style(color: content),
                    ),
                  ),
                  GestureDetector(
                    onTap: focused ? () => onStep(1) : null,
                    child: KitIcon(Lucide.chevronRight, size: 20, color: arrow),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
