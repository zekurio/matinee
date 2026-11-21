import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'requests_hub.dart' show FollowTitles, mostFollowed;

/// Which cards of a long list are built, by their place in it, and from
/// that the ones to follow: the blocks of [block] around them, at most
/// [blocks] of them, as the Kotlin app follows the cards around the screen.
/// The live stream takes a hundred titles at most ([mostFollowed]) and
/// opens again on a change, so a list that can be longer follows a window
/// rather than the whole list. Wrap each card in [FollowedCard], and
/// follow [slice] of the list in [FollowTitles].
final class FollowWindow extends ChangeNotifier {
  FollowWindow({this.block = 12, this.blocks = 6});

  final int block;
  final int blocks;
  final _built = <int>{};
  var _window = (0, 0);
  var _scheduled = false;
  var _disposed = false;

  (int, int) get window => _window;

  void add(int index) {
    _built.add(index);
    _schedule();
  }

  void remove(int index) {
    _built.remove(index);
    _schedule();
  }

  /// The part of [items] in the window.
  List<T> slice<T>(List<T> items) {
    final (from, to) = _window;
    return items.sublist(
      math.min(from, items.length),
      math.min(to, items.length),
    );
  }

  /// The window for the cards at [built]: from the block before the first
  /// to the block after the last, no more than [blocks] blocks.
  static (int, int) windowFor(
    Iterable<int> built, {
    required int block,
    required int blocks,
  }) {
    if (built.isEmpty) return (0, 0);
    final first = built.reduce(math.min);
    final last = built.reduce(math.max);
    final from = math.max(0, first ~/ block - 1);
    final to = math.min(last ~/ block + 1, from + blocks - 1);
    return (from * block, (to + 1) * block);
  }

  // Cards come and go while the grid lays out, so the window moves once
  // the frame is done.
  void _schedule() {
    if (_scheduled) return;
    _scheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (_disposed) return;
      final next = windowFor(_built, block: block, blocks: blocks);
      if (next == _window) return;
      _window = next;
      notifyListeners();
    });
    SchedulerBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Tells [window] while its card, the [index]th of the list, is built.
class FollowedCard extends StatefulWidget {
  const FollowedCard({
    super.key,
    required this.window,
    required this.index,
    required this.child,
  });

  final FollowWindow window;
  final int index;
  final Widget child;

  @override
  State<FollowedCard> createState() => _FollowedCardState();
}

class _FollowedCardState extends State<FollowedCard> {
  @override
  void initState() {
    super.initState();
    widget.window.add(widget.index);
  }

  @override
  void didUpdateWidget(FollowedCard old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index || old.window != widget.window) {
      old.window.remove(old.index);
      widget.window.add(widget.index);
    }
  }

  @override
  void dispose() {
    widget.window.remove(widget.index);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
