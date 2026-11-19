import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class TabBarItem {
  const TabBarItem({required this.id, required this.icon, required this.label});

  final Object id;
  final String icon;
  final String label;
}

/// Share one state between pages to retain the selected tab across navigation.
class TabBarState extends ValueNotifier<Object?> {
  TabBarState([super.value]);

  Object? get selected => value;

  void select(Object id) => value = id;
}

final _blur = ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20);

class TabBar extends StatelessWidget {
  const TabBar({
    super.key,
    required this.items,
    required this.state,
    this.onSelected,
    this.label,
  });

  final List<TabBarItem> items;
  final TabBarState state;
  final ValueChanged<Object>? onSelected;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Semantics(
      container: true,
      label: label,
      child: Glass(
        border: Border(top: BorderSide(color: colors.border)),
        tint: colors.background.withValues(alpha: .8),
        solid: colors.background,
        filter: _blur,
        child: SafeArea(
          top: false,
          child: Center(
            heightFactor: 1,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: ValueListenableBuilder<Object?>(
                  valueListenable: state,
                  builder: (context, selected, child) => Row(
                    children: [
                      for (final item in items)
                        Expanded(
                          key: ValueKey(item.id),
                          child: _Tab(
                            item: item,
                            selected: item.id == selected,
                            onPressed: () {
                              state.select(item.id);
                              onSelected?.call(item.id);
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
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
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 200);
    return PressIndication(
      onPressed: onPressed,
      selected: selected,
      label: item.label,
      showFocusRing: false,
      builder: (context, state) => ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(end: selected ? 1 : 0),
            duration: motion,
            curve: Curves.easeOut,
            builder: (context, progress, child) {
              final color = Color.lerp(
                state == PressState.hovered
                    ? colors.foreground
                    : colors.mutedForeground,
                colors.foreground,
                progress,
              );
              return Column(
                mainAxisSize: MainAxisSize.min,
                spacing: 2,
                children: [
                  AnimatedScale(
                    scale: state == PressState.pressed ? .92 : 1,
                    duration: motion,
                    child: SizedBox(
                      width: 56,
                      height: 32,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          if (progress > 0)
                            Container(
                              width: 28 + 28 * progress,
                              decoration: BoxDecoration(
                                borderRadius: KitRadius.pill,
                                color: colors.foreground.withValues(
                                  alpha: .1 * progress,
                                ),
                              ),
                            ),
                          if (state == PressState.focused)
                            DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: KitRadius.pill,
                                border: Border.all(
                                  color: colors.accent,
                                  width: 2,
                                ),
                              ),
                              child: const SizedBox.expand(),
                            ),
                          KitIcon(item.icon, size: 22, color: color),
                        ],
                      ),
                    ),
                  ),
                  Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.xs.style(
                      color: color,
                      weight: FontWeight.w500,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
