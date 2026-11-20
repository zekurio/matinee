import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// An entry in the TV's drawer: an [icon], or [leading] in its place, like
/// the signed-in person's picture.
class TvDrawerEntry {
  const TvDrawerEntry({
    required this.key,
    required this.label,
    this.icon,
    this.leading,
  });

  final String key;
  final String label;
  final String? icon;
  final Widget? leading;
}

/// Whether the drawer has focus, and the way into it.
class TvDrawerController extends ChangeNotifier {
  TvDrawerController() {
    scope.addListener(_changed);
  }

  final scope = TvOverlayScopeNode(debugLabel: 'drawer');
  final _nodes = <String, FocusNode>{};
  String current = '';
  bool _open = false;

  bool get isOpen => _open;

  FocusNode _node(String key) =>
      _nodes.putIfAbsent(key, () => FocusNode(debugLabel: 'drawer $key'));

  void _changed() {
    if (scope.hasFocus == _open) return;
    _open = scope.hasFocus;
    notifyListeners();
  }

  /// Focuses the current page's entry.
  void open() {
    final node = _nodes[current] ?? _nodes.values.firstOrNull;
    node?.requestFocus();
  }

  @override
  void dispose() {
    scope.removeListener(_changed);
    scope.dispose();
    for (final node in _nodes.values) {
      node.dispose();
    }
    super.dispose();
  }
}

const _rowHeight = 48.0;
const _railIcon = _rowHeight;
const _expanded = 236.0;

/// The TV's navigation, as Wholphin's and the Kotlin app's: a rail of icons
/// at the left edge that grows into a labelled drawer over the page while
/// it has focus. The [current] page's entry is marked. Only Left from a
/// page's edge, or [TvDrawerController.open], comes in; the shell hands
/// focus back on Right or Back.
class TvDrawer extends StatelessWidget {
  const TvDrawer({
    super.key,
    required this.controller,
    required this.top,
    required this.entries,
    required this.bottom,
    required this.current,
    required this.onPick,
  });

  final TvDrawerController controller;
  final TvDrawerEntry top;
  final List<TvDrawerEntry> entries;
  final TvDrawerEntry bottom;
  final String current;
  final ValueChanged<TvDrawerEntry> onPick;

  @override
  Widget build(BuildContext context) {
    controller.current = current;
    final colors = MatineeTheme.of(context);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final open = controller.isOpen;
        return TweenAnimationBuilder<double>(
          tween: Tween(end: open ? 1 : 0),
          duration: open ? TvMotion.enter : TvMotion.exit,
          builder: (context, shade, child) => CustomPaint(
            painter: _Shade(colors.background, shade),
            child: child,
          ),
          child: FocusScope(
            node: controller.scope,
            child: Padding(
              padding: const EdgeInsetsDirectional.only(
                start: Overscan.railCenter - _railIcon / 2,
                top: Overscan.vertical,
                bottom: Overscan.vertical,
              ),
              child: AnimatedContainer(
                duration: TvMotion.move,
                curve: TvMotion.easing,
                width: open ? _expanded : _railIcon,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 6,
                  children: [
                    _entry(top, open),
                    const SizedBox(height: 18),
                    for (final entry in entries) _entry(entry, open),
                    const Spacer(),
                    _entry(bottom, open),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _entry(TvDrawerEntry entry, bool open) => _Entry(
    key: ValueKey(entry.key),
    entry: entry,
    node: controller._node(entry.key),
    selected: entry.key == current,
    open: open,
    onPick: onPick,
  );
}

class _Entry extends StatelessWidget {
  const _Entry({
    super.key,
    required this.entry,
    required this.node,
    required this.selected,
    required this.open,
    required this.onPick,
  });

  final TvDrawerEntry entry;
  final FocusNode node;
  final bool selected;
  final bool open;
  final ValueChanged<TvDrawerEntry> onPick;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final tint = selected
        ? colors.accent
        : colors.foreground.withValues(alpha: open ? .8 : .45);
    return TvFocusable(
      focusNode: node,
      label: entry.label,
      selected: selected,
      onPressed: () => onPick(entry),
      builder: (context, focused) => TvControl(
        focused: focused,
        scale: TvFocus.rowScale,
        rest: selected && !open
            ? colors.foreground.withValues(alpha: .1)
            : const Color(0x00000000),
        content: tint,
        builder: (context, content) => SizedBox(
          height: _rowHeight,
          child: Row(
            children: [
              SizedBox(
                width: _railIcon,
                height: _rowHeight,
                child: Center(
                  child:
                      entry.leading ??
                      KitIcon(
                        entry.icon ?? Lucide.house,
                        size: 24,
                        color: content,
                      ),
                ),
              ),
              if (open)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 6,
                      end: 18,
                    ),
                    child: Text(
                      entry.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.facts.style(
                        color: focused
                            ? colors.background
                            : selected
                            ? colors.accent
                            : colors.foreground.withValues(alpha: .85),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Over the page, a shade the labels read on, deepest at the left.
class _Shade extends CustomPainter {
  const _Shade(this.color, this.shade);

  final Color color;
  final double shade;

  @override
  void paint(Canvas canvas, Size size) {
    if (shade <= 0) return;
    const reach = (Overscan.railCenter + _expanded + 48) * 4;
    final rect = Rect.fromLTWH(0, 0, reach, size.height);
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          colors: [
            color.withValues(alpha: .98 * shade),
            color.withValues(alpha: .94 * shade),
            color.withValues(alpha: .7 * shade),
            color.withValues(alpha: .6 * shade),
          ],
          stops: const [0, .25, .5, 1],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_Shade old) => old.color != color || old.shade != shade;
}
