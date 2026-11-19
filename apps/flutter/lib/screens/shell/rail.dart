import 'package:flutter/widgets.dart';

import '../../kit/kit.dart';

/// The tabs down the left edge, for a tablet in landscape: the same
/// items and state as the bottom bar, each its icon over its name.
class ShellRail extends StatelessWidget {
  const ShellRail({
    super.key,
    required this.items,
    required this.state,
    required this.onSelected,
  });

  final List<TabBarItem> items;
  final TabBarState state;
  final ValueChanged<Object> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(right: BorderSide(color: colors.border)),
      ),
      child: SafeArea(
        right: false,
        child: SizedBox(
          width: 88,
          child: ValueListenableBuilder<Object?>(
            valueListenable: state,
            builder: (context, selected, _) => Column(
              spacing: 4,
              children: [
                const SizedBox(height: 12),
                for (final item in items)
                  _RailItem(
                    item: item,
                    selected: item.id == selected,
                    onPressed: () {
                      state.select(item.id);
                      onSelected(item.id);
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    required this.item,
    required this.selected,
    required this.onPressed,
  });

  final TabBarItem item;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      selected: selected,
      label: item.label,
      shape: KitRadius.control,
      builder: (context, pressState) {
        final color = selected || pressState == PressState.hovered
            ? colors.foreground
            : colors.mutedForeground;
        return ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              spacing: 4,
              children: [
                AnimatedContainer(
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : const Duration(milliseconds: 200),
                  width: 56,
                  height: 32,
                  decoration: BoxDecoration(
                    color: selected ? colors.secondary : null,
                    borderRadius: KitRadius.pill,
                  ),
                  alignment: Alignment.center,
                  child: KitIcon(item.icon, size: 22, color: color),
                ),
                Text(item.label, style: KitText.xs.style(color: color)),
              ],
            ),
          ),
        );
      },
    );
  }
}
