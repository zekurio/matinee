import 'package:flutter/widgets.dart';

class ModalBackdrop extends StatelessWidget {
  const ModalBackdrop({
    super.key,
    required this.color,
    required this.animation,
    required this.child,
  });

  final Color color;
  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      IgnorePointer(
        child: FadeTransition(
          opacity: animation,
          child: ColoredBox(color: color),
        ),
      ),
      child,
    ],
  );
}
