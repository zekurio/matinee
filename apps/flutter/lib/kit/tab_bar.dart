import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import 'glass.dart';
import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class TabBarItem {
  const TabBarItem({
    required this.id,
    required this.icon,
    required this.label,
    this.picture,
  });

  final Object id;
  final String icon;
  final String label;

  /// Drawn in the icon's place when set, like the account's picture. It
  /// gets the icon's 22 by 22.
  final Widget? picture;
}

/// Share one state between pages to retain the selected tab across navigation.
class TabBarState extends ValueNotifier<Object?> {
  TabBarState([super.value]);

  void select(Object id) => value = id;
}

final _blur = ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20);

class TabBar extends StatelessWidget {
  const TabBar({
    super.key,
    required this.items,
    required this.state,
    this.onSelected,
  });

  final List<TabBarItem> items;
  final TabBarState state;
  final ValueChanged<Object>? onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Semantics(
      container: true,
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
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final labels = _labelsFit(
                      context,
                      constraints.maxWidth / items.length,
                    );
                    return ValueListenableBuilder<Object?>(
                      valueListenable: state,
                      builder: (context, selected, child) => Row(
                        children: [
                          for (final item in items)
                            Expanded(
                              key: ValueKey(item.id),
                              child: _Tab(
                                item: item,
                                selected: item.id == selected,
                                showLabel: labels,
                                onPressed: () {
                                  state.select(item.id);
                                  onSelected?.call(item.id);
                                },
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Whether every label fits under its icon in a tab [width] wide. When
  /// one doesn't, as on a small phone, with large text, or in a longer
  /// language, every tab shows only its icon, so they stay alike; screen
  /// readers still read the names.
  bool _labelsFit(BuildContext context, double width) {
    final style = DefaultTextStyle.of(context).style
        .merge(KitText.xs.style(weight: FontWeight.w500));
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    return items.every((item) {
      final painter = TextPainter(
        text: TextSpan(text: item.label, style: style),
        textScaler: scaler,
        textDirection: direction,
        maxLines: 1,
      )..layout();
      final fits = painter.width <= width - 8;
      painter.dispose();
      return fits;
    });
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.item,
    required this.selected,
    required this.showLabel,
    required this.onPressed,
  });

  final TabBarItem item;
  final bool selected;
  final bool showLabel;
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
          padding: showLabel
              ? const EdgeInsets.only(top: 6, bottom: 4)
              : const EdgeInsets.symmetric(vertical: 8),
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
                          if (item.picture case final picture?)
                            SizedBox.square(dimension: 22, child: picture)
                          else
                            KitIcon(item.icon, size: 22, color: color),
                        ],
                      ),
                    ),
                  ),
                  if (showLabel)
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
