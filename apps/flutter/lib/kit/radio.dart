import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// One of a few choices in a sheet or a panel, the Android kit's
/// `RadioRow`: the round mark, then [label], with [detail] under it, the
/// whole row one target. A row in a group of them, of which one at most is
/// [selected].
class RadioRow extends StatelessWidget {
  const RadioRow({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
    this.detail,
  });

  final String label;
  final String? detail;
  final bool selected;

  /// Null leaves the row as it is, for a choice that's the only one.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final detail = this.detail;
    return PressIndication(
      onPressed: onPressed,
      button: false,
      checked: selected,
      inMutuallyExclusiveGroup: true,
      label: [label, ?detail].join(', '),
      shape: KitRadius.control,
      builder: (context, state) => PressFill(
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          color: colors.foreground.withValues(
            alpha: switch (state) {
              PressState.pressed => .1,
              PressState.idle => 0,
              _ => .06,
            },
          ),
        ),
        child: ExcludeSemantics(
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Row(
                spacing: 14,
                children: [
                  PressFill(
                    width: 18,
                    height: 18,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: selected ? colors.accent : colors.inputHover,
                        width: selected ? 1.5 : 1,
                      ),
                    ),
                    // The dot grows in when it's picked, and shrinks away.
                    child: AnimatedScale(
                      scale: selected ? 1 : 0,
                      duration: KitMotion.of(context, KitMotion.enter),
                      curve: KitMotion.easing,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: colors.accent,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          label,
                          style: KitText.base.style(color: colors.foreground),
                        ),
                        if (detail != null)
                          Text(
                            detail,
                            style: KitText.sm.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
