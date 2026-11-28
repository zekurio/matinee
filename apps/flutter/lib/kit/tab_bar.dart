import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/widgets.dart';

import 'floating_surface.dart';
import 'icon.dart';
import 'motion.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class TabBarItem {
  const TabBarItem({required this.id, required this.icon, required this.label});

  final Object id;
  final String icon;
  final String label;

  @override
  bool operator ==(Object other) =>
      other is TabBarItem &&
      other.id == id &&
      other.icon == icon &&
      other.label == label;

  @override
  int get hashCode => Object.hash(id, icon, label);
}

/// Share one state between pages to retain the selected tab across navigation.
class TabBarState extends ValueNotifier<Object?> {
  TabBarState([super.value]);

  void select(Object id) => value = id;
}

/// The tabs along the bottom of a phone's screen.
///
/// The router builds the shell, and with it this bar, on every navigation,
/// opening a page or going back included. While its tabs, its state, and
/// what it depends on stay the same, the bar keeps what it built, so none
/// of it builds again in that frame.
class TabBar extends StatefulWidget {
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
  State<TabBar> createState() => _TabBarState();
}

class _TabBarState extends State<TabBar> {
  Widget? _built;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _built = null;
  }

  @override
  void didUpdateWidget(TabBar old) {
    super.didUpdateWidget(old);
    if (widget.state != old.state || !listEquals(widget.items, old.items)) {
      _built = null;
    }
  }

  @override
  Widget build(BuildContext context) => _built ??= _build(context);

  List<TabBarItem> get items => widget.items;

  TabBarState get state => widget.state;

  Widget _build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Semantics(
      container: true,
      child: FloatingSurface(
        border: Border(top: BorderSide(color: colors.border)),
        color: colors.background,
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
                                  // The bar's latest, as what it built stays.
                                  widget.onSelected?.call(item.id);
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
  ///
  /// The answer is kept for the next build, since the router builds the
  /// shell, and this bar, on every navigation, and measuring the labels
  /// again each time costs a page's first frame half a millisecond.
  bool _labelsFit(BuildContext context, double width) {
    final style = DefaultTextStyle.of(context).style
        .merge(KitText.xs.style(weight: FontWeight.w500));
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    final key = (
      labels: items.map((item) => item.label).join('\u0000'),
      style: style,
      scaler: scaler,
      direction: direction,
      width: width,
    );
    final last = _lastFit;
    if (last != null && last.key == key) return last.fits;
    final fits = items.every((item) {
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
    _lastFit = (key: key, fits: fits);
    return fits;
  }
}

/// What [_TabBarState._labelsFit] measured last, and for what.
({
  ({
    String labels,
    TextStyle style,
    TextScaler scaler,
    TextDirection direction,
    double width,
  })
  key,
  bool fits,
})?
_lastFit;

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
    final motion = KitMotion.of(context, KitMotion.enter);
    return PressIndication(
      onPressed: onPressed,
      selected: selected,
      label: item.label,
      showFocusRing: false,
      builder: (context, state) => ExcludeSemantics(
        child: Padding(
          padding: showLabel
              ? const EdgeInsets.only(top: 12, bottom: 16)
              : const EdgeInsets.symmetric(vertical: 24),
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(end: selected ? 1 : 0),
            duration: motion,
            curve: KitMotion.easing,
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
                spacing: 4,
                children: [
                  AnimatedScale(
                    scale: state == PressState.pressed ? .92 : 1,
                    duration: motion,
                    child: SizedBox(
                      width: 64,
                      height: 32,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          if (progress > 0)
                            Container(
                              width: 32 + 32 * progress,
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
                          KitIcon(item.icon, size: 24, color: color),
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
