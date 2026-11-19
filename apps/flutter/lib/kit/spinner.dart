import 'package:flutter/widgets.dart';

import 'icon.dart';

class Spinner extends StatefulWidget {
  const Spinner({super.key, this.size = 16, this.color, this.label});

  final double size;
  final Color? color;
  final String? label;

  @override
  State<Spinner> createState() => _SpinnerState();
}

class _SpinnerState extends State<Spinner> with SingleTickerProviderStateMixin {
  late final _turn = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _turn.reset();
    } else if (!_turn.isAnimating) {
      _turn.repeat();
    }
  }

  @override
  void dispose() {
    _turn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: widget.label,
    liveRegion: widget.label != null,
    child: RotationTransition(
      turns: _turn,
      child: KitIcon(
        Lucide.loaderCircle,
        size: widget.size,
        color: widget.color,
      ),
    ),
  );
}
