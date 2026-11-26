import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

/// A card in a grid or rail that, while the list scrolls, waits its turn
/// to build. A list builds every card that enters its cache extent in the
/// frame it enters, so a grid's new row is two cards in one frame, and two
/// cards cost more than a frame at 120 Hz has. During a scroll the cards
/// that come in take turns, one a frame, nearest the screen first, each
/// holding an empty box until then. They enter the cache extent before
/// they show, so the box isn't seen: a card about to come into view builds
/// at once, however many that makes in the frame. When nothing scrolls, as
/// when a list first shows, every card builds at once.
///
/// The box takes the size its parent gives, so the parent must fix the
/// card's size, as a [SliverGrid] and a rail's [SizedBox] do.
class Staggered extends StatefulWidget {
  const Staggered({super.key, required this.builder});

  final WidgetBuilder builder;

  /// How many cards were still empty in a frame that showed them, for the
  /// frame timing log: a fling that outran the turns.
  static int get shownEmpty => _Turns.instance.shownEmpty;

  @override
  State<Staggered> createState() => _StaggeredState();
}

class _StaggeredState extends State<Staggered> {
  bool _ready = false;

  @override
  void dispose() {
    _Turns.instance.waiting.remove(this);
    super.dispose();
  }

  void _release() {
    if (mounted) setState(() => _ready = true);
  }

  /// How far it is from showing in each list it's in, past how far that
  /// list goes in the next two frames: zero or less when it must build
  /// now, as one that's in view already. Zero, too, when there's no
  /// layout to tell from.
  double _distance(Map<ScrollPosition, double> leads, {bool lead = true}) {
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return 0;
    final rect = _onScreen(box);
    var distance = double.negativeInfinity;
    for (
      var scrollable = Scrollable.maybeOf(context);
      scrollable != null;
      scrollable = Scrollable.maybeOf(scrollable.context)
    ) {
      final view = scrollable.context.findRenderObject();
      if (view is! RenderBox || !view.hasSize) continue;
      final apart = separation(rect, _onScreen(view));
      final ahead = lead ? leads[scrollable.position] ?? 0 : 0;
      distance = math.max(distance, apart - ahead);
    }
    return distance.isFinite ? distance : 0;
  }

  static Rect _onScreen(RenderBox box) => MatrixUtils.transformRect(
    box.getTransformTo(null),
    Offset.zero & box.size,
  );

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      final turns = _Turns.instance;
      if (!_scrolling(context) || turns.take()) {
        _ready = true;
      } else {
        turns.wait(this);
        return const SizedBox.shrink();
      }
    }
    return widget.builder(context);
  }
}

/// Whether a list [context] is in scrolls.
bool _scrolling(BuildContext context) {
  for (
    var scrollable = Scrollable.maybeOf(context);
    scrollable != null;
    scrollable = Scrollable.maybeOf(scrollable.context)
  ) {
    if (scrollable.position.isScrollingNotifier.value) return true;
  }
  return false;
}

/// How far apart [a] and [b] are, the gap between their nearest edges,
/// or how deep they overlap as a negative number.
@visibleForTesting
double separation(Rect a, Rect b) => [
  b.top - a.bottom,
  a.top - b.bottom,
  b.left - a.right,
  a.left - b.right,
].reduce(math.max);

/// Whose turn it is: one card builds in each frame of a scroll, and after
/// each frame the next waiting one, the nearest to showing, gets the next
/// frame's turn, along with any that would show by then.
final class _Turns {
  _Turns._();

  static const _recent = Duration(milliseconds: 40);

  static final instance = _Turns._();

  final waiting = <_StaggeredState>{};
  int shownEmpty = 0;

  bool _taken = false;
  bool _scheduled = false;

  /// Where each list was after a frame, and when, to tell how fast it goes.
  final _pixels = Expando<({double pixels, Duration at})>();

  /// Takes this frame's turn when it's free.
  bool take() {
    if (_taken) return false;
    _taken = true;
    _schedule();
    return true;
  }

  void wait(_StaggeredState card) {
    waiting.add(card);
    _schedule();
  }

  void _schedule() {
    if (_scheduled) return;
    _scheduled = true;
    SchedulerBinding.instance.addPostFrameCallback(_afterFrame);
  }

  void _afterFrame(Duration at) {
    _scheduled = false;
    _taken = false;
    if (waiting.isEmpty) return;
    final leads = <ScrollPosition, double>{};
    final due = <_StaggeredState>[];
    _StaggeredState? nearest;
    var nearestDistance = double.infinity;
    for (final card in waiting) {
      _measure(card, at, leads);
      final distance = card._distance(leads);
      if (distance <= 0) {
        due.add(card);
        if (card._distance(leads, lead: false) < 0) shownEmpty++;
      } else if (distance < nearestDistance) {
        nearest = card;
        nearestDistance = distance;
      }
    }
    if (due.isEmpty && nearest != null) due.add(nearest);
    for (final card in due) {
      waiting.remove(card);
      card._release();
    }
    // The cards released build in the next frame, which is their turn.
    _taken = true;
    _schedule();
  }

  /// How far each list [card] is in may move by the frame after next, from
  /// how far it moved since the frame before this one, at [at].
  void _measure(
    _StaggeredState card,
    Duration at,
    Map<ScrollPosition, double> leads,
  ) {
    if (!card.mounted) return;
    for (
      var scrollable = Scrollable.maybeOf(card.context);
      scrollable != null;
      scrollable = Scrollable.maybeOf(scrollable.context)
    ) {
      final position = scrollable.position;
      if (leads.containsKey(position) || !position.hasPixels) continue;
      final last = _pixels[position];
      final pixels = position.pixels;
      _pixels[position] = (pixels: pixels, at: at);
      // A frame or two apart, at 60 Hz or faster; any longer and it's from
      // another scroll.
      final apart = last == null ? Duration.zero : at - last.at;
      leads[position] = apart <= Duration.zero || apart > _recent
          ? 0
          : 2.5 * (pixels - last!.pixels).abs();
    }
  }
}
