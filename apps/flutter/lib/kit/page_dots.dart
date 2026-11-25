import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class PageDots extends StatelessWidget {
  const PageDots({
    super.key,
    required this.count,
    required this.current,
    this.onSelected,
    this.labelForPage,
  }) : assert(count >= 0),
       assert(count == 0 || (current >= 0 && current < count)),
       assert(onSelected == null || labelForPage != null);

  final int count;
  final int current;
  final ValueChanged<int>? onSelected;
  final String Function(int)? labelForPage;

  @override
  Widget build(BuildContext context) {
    if (count < 2) return const SizedBox.shrink();
    final color = MatineeTheme.of(context).foreground;
    final motion = KitMotion.of(context, KitMotion.enter);
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: onSelected == null ? 6 : 0,
      children: [
        for (var index = 0; index < count; index++)
          _Dot(
            color: color,
            duration: motion,
            active: index == current,
            onPressed: onSelected == null ? null : () => onSelected!(index),
            label: labelForPage?.call(index),
          ),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({
    required this.color,
    required this.duration,
    required this.active,
    required this.onPressed,
    required this.label,
  });

  final Color color;
  final Duration duration;
  final bool active;
  final VoidCallback? onPressed;
  final String? label;

  @override
  Widget build(BuildContext context) {
    Widget dot({Color? ring}) => AnimatedContainer(
      duration: duration,
      width: active ? 20 : 6,
      height: 6,
      decoration: BoxDecoration(
        color: color.withValues(alpha: active ? 1 : .4),
        borderRadius: KitRadius.pill,
        boxShadow: ring == null
            ? null
            : [BoxShadow(color: ring, spreadRadius: 2)],
      ),
    );
    return onPressed == null
        ? dot()
        : PressIndication(
            onPressed: onPressed,
            label: label,
            selected: active,
            showFocusRing: false,
            builder: (context, state) => SizedBox(
              height: 32,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Center(
                  widthFactor: 1,
                  child: dot(
                    ring: state == PressState.focused
                        ? MatineeTheme.of(context).accent
                        : null,
                  ),
                ),
              ),
            ),
          );
  }
}
