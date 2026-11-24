import 'package:flutter/widgets.dart';

/// How everything in the app moves, phone, tablet, TV, and player alike:
/// the web's timings and curves. A part that animates takes its time and
/// curve from here, through [of] where the system can ask for less motion.
///
/// Pages that open over others move the platform's way, from the theme.
/// What changes in place, a tab for another, a spinner for what it waited
/// on, a placeholder for its picture, fades.
abstract final class KitMotion {
  /// The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long,
  /// soft landing. For what arrives or moves.
  static const easing = Cubic(.22, 1, .36, 1);

  /// The web's ease-in, for things on their way out.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  /// A sheet, a panel, or a scroll travelling.
  static const move = Duration(milliseconds: 280);

  /// Something appearing, or one state fading into the next.
  static const enter = Duration(milliseconds: 200);

  /// The same going away, quicker.
  static const exit = Duration(milliseconds: 150);

  /// A color or a selection changing.
  static const color = Duration(milliseconds: 120);

  /// [duration], or none when the system asks for less motion.
  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
}

/// Fades from what it showed to [child] whenever [value], the state
/// [child] shows, changes: a page's spinner into what it loaded, or into
/// what went wrong. While [value] stays, [child] changes in place, however
/// its widgets change. The first state shows without a fade, so a page
/// whose data is already there opens as it is.
class FadeSwitcher extends StatelessWidget {
  const FadeSwitcher({super.key, required this.value, required this.child});

  final Object? value;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final child = KeyedSubtree(key: ValueKey(value), child: this.child);
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return AnimatedSwitcher(
      duration: KitMotion.enter,
      reverseDuration: KitMotion.exit,
      switchInCurve: KitMotion.easing,
      switchOutCurve: KitMotion.exitEasing,
      // The incoming child on top, each laid out as if it were alone.
      layoutBuilder: (current, previous) =>
          Stack(fit: StackFit.passthrough, children: [...previous, ?current]),
      child: child,
    );
  }
}

/// Fades [child] in from nothing whenever [value] changes, the last of it
/// gone at once: a tab taking the place of another. Its first build shows
/// without a fade.
class FadeOnChange extends StatefulWidget {
  const FadeOnChange({super.key, required this.value, required this.child});

  final Object? value;
  final Widget child;

  @override
  State<FadeOnChange> createState() => _FadeOnChangeState();
}

class _FadeOnChangeState extends State<FadeOnChange>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: KitMotion.enter,
    value: 1,
  );
  late final _opacity = CurvedAnimation(
    parent: _controller,
    curve: KitMotion.easing,
  );

  @override
  void didUpdateWidget(FadeOnChange old) {
    super.didUpdateWidget(old);
    if (widget.value == old.value) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = 1;
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _opacity.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      FadeTransition(opacity: _opacity, child: widget.child);
}
