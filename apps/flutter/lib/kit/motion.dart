import 'package:flutter/widgets.dart';

/// How the touch screens move, on phones and tablets, and the player: after
/// Material 3's durations and Compose's FastOutSlowIn, as Findroid, a stock
/// Material 3 app, moves. A part that animates takes its time and curve
/// from here, through [of] where the system can ask for less motion. The
/// TV screens move as the web does, with [TvMotion].
///
/// These differ from the web's on purpose. The web's curve,
/// cubic-bezier(0.22, 1, 0.36, 1), covers three quarters of its way in the
/// first quarter of its time, so on a phone a 280 ms move read as over in
/// about 70 ms, and a 120 ms color change as a flash. FastOutSlowIn starts
/// gently and reaches nine tenths at two thirds of its time, so every value
/// here gives at least about 100 ms of change a person can see. Material's
/// springs aren't used: its standard spatial spring (damping 0.9, stiffness
/// 700) is nine tenths there in about 130 ms, nearly as sudden as the web's
/// curve, and Flutter's implicit animations, which most of these drive,
/// would keep none of a spring's velocity when retargeted.
///
/// Pages that open over others move as the theme says: on Android they
/// fade (`page_motion.dart`), on iOS they take Cupertino's slide. Tabs fade
/// the same way ([TabFade]). What changes in place, a spinner for what it
/// waited on, a placeholder for its picture, fades.
abstract final class KitMotion {
  /// A page or a tab fading in over the last, and out again: Findroid's
  /// `tween(300)`.
  static const page = Duration(milliseconds: 300);

  /// The page fade's curve, Compose's FastOutSlowIn, which `tween` takes by
  /// default.
  static const pageEasing = easing;

  /// FastOutSlowIn, cubic-bezier(0.4, 0, 0.2, 1), for what arrives, moves,
  /// or changes: it starts gently, so the change is seen from its first
  /// frames, and lands softly.
  static const easing = Cubic(.4, 0, .2, 1);

  /// FastOutLinearIn, cubic-bezier(0.4, 0, 1, 1), for things on their way
  /// out; the web's ease-in is the same curve.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  /// A sheet, a panel, or a scroll travelling: Material's medium 2.
  static const move = Duration(milliseconds: 300);

  /// Something appearing, or one state fading into the next: medium 1.
  static const enter = Duration(milliseconds: 250);

  /// The same going away, quicker: short 4.
  static const exit = Duration(milliseconds: 200);

  /// A color or a selection changing: short 4, so the change spans about a
  /// tenth of a second rather than being done before it's seen.
  static const color = Duration(milliseconds: 200);

  /// [duration], or none when the system asks for less motion.
  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
}

/// How the TV screens move, driven by a remote: the web's timings and
/// curves, as the whole app moved before the touch screens took
/// [KitMotion]'s. Nobody asked for the TV's to change.
abstract final class TvMotion {
  /// The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long,
  /// soft landing. For what arrives or moves.
  static const easing = Cubic(.22, 1, .36, 1);

  /// The web's ease-in, for things on their way out.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  /// A panel, a row, or a list travelling.
  static const move = Duration(milliseconds: 280);

  /// Something appearing, or one state fading into the next.
  static const enter = Duration(milliseconds: 200);

  /// The same going away, quicker.
  static const exit = Duration(milliseconds: 150);

  /// A color or a selection changing.
  static const color = Duration(milliseconds: 120);
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

/// Tabs in one place, [index] the one in view. When [index] changes, the
/// tab picked fades in over the one left, over [KitMotion.page] on
/// [KitMotion.pageEasing], as a page does over the page it covers. What's
/// around it, like a tab bar, holds still. Each tab paints [background]
/// under itself, so the one on top is opaque and the one under it holds
/// still: only one tab fades. Every tab stays built, offstage while out of
/// view, so each keeps its state and scroll position, and only the one in
/// view ticks. Its first build shows without a fade.
class TabFade extends StatefulWidget {
  const TabFade({
    super.key,
    required this.index,
    required this.background,
    required this.children,
  });

  final int index;
  final Color background;
  final List<Widget> children;

  @override
  State<TabFade> createState() => _TabFadeState();
}

class _TabFadeState extends State<TabFade> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: KitMotion.page,
    value: 1,
  )..addStatusListener(_settled);
  late final _opacity = CurvedAnimation(
    parent: _controller,
    curve: KitMotion.pageEasing,
  );

  /// The tab faded over, while the one picked fades in.
  int? _left;

  void _settled(AnimationStatus status) {
    if (status.isCompleted && _left != null) setState(() => _left = null);
  }

  @override
  void didUpdateWidget(TabFade old) {
    super.didUpdateWidget(old);
    if (widget.index == old.index) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _left = null;
      _controller.value = 1;
    } else {
      // A tab picked while another still faded in leaves from where it was.
      _left = old.index;
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
  Widget build(BuildContext context) {
    final shown = widget.index;
    // The tab picked last, so it paints over the one left. Keys keep each
    // tab's state as the order changes.
    return Stack(
      fit: StackFit.expand,
      children: [
        for (final (i, child) in widget.children.indexed)
          if (i != shown) _tab(i, child, shown: false, leaving: i == _left),
        _tab(shown, widget.children[shown], shown: true, leaving: false),
      ],
    );
  }

  /// One tab, built the same way whatever it's doing, so none loses its
  /// state as it comes and goes. Its own repaint boundary lets a frame of
  /// the fade reuse what it painted.
  Widget _tab(
    int index,
    Widget child, {
    required bool shown,
    required bool leaving,
  }) {
    final tab = RepaintBoundary(
      child: ColoredBox(color: widget.background, child: child),
    );
    return KeyedSubtree(
      key: ValueKey(index),
      child: Offstage(
        offstage: !shown && !leaving,
        child: TickerMode(
          enabled: shown,
          child: IgnorePointer(
            ignoring: !shown,
            child: ExcludeSemantics(
              excluding: !shown,
              child: FadeTransition(
                opacity: shown ? _opacity : kAlwaysCompleteAnimation,
                child: tab,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
