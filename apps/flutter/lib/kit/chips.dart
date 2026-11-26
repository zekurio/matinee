import 'package:flutter/widgets.dart';

import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class ChoiceChip extends StatelessWidget {
  const ChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
    this.count,
  });

  final String label;
  final bool selected;
  final VoidCallback? onPressed;
  final String? count;

  @override
  Widget build(BuildContext context) => _Chip(
    label: label,
    active: selected,
    onPressed: onPressed,
    count: count,
    exclusive: true,
  );
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.active,
    required this.onPressed,
    required this.count,
    required this.exclusive,
  });

  final String label;
  final bool active;
  final VoidCallback? onPressed;
  final String? count;
  final bool exclusive;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      shape: KitRadius.pill,
      button: !exclusive,
      checked: exclusive ? active : null,
      toggled: exclusive ? null : active,
      inMutuallyExclusiveGroup: exclusive ? true : null,
      builder: (context, state) {
        final hot = state != PressState.idle;
        // The web's `smallChip`, at the height it takes for a finger.
        final text = KitText.px13.style(weight: FontWeight.w500);
        return Opacity(
          opacity: onPressed == null ? .5 : 1,
          child: PressFill(
            constraints: const BoxConstraints(minHeight: 40),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: active ? colors.foreground : null,
              borderRadius: KitRadius.pill,
              border: Border.all(
                color: active
                    ? const Color(0x00000000)
                    : colors.foreground.withValues(alpha: hot ? .3 : .15),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 6,
              children: [
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.copyWith(
                      color: active
                          ? colors.background
                          : colors.foreground.withValues(alpha: hot ? 1 : .8),
                    ),
                  ),
                ),
                if (count case final count?)
                  Text(
                    count,
                    maxLines: 1,
                    style: text.copyWith(
                      color: active
                          ? colors.background.withValues(alpha: .7)
                          : colors.mutedForeground,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
