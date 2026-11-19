import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

final _blur = ui.ImageFilter.blur(sigmaX: 4, sigmaY: 4);

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
          child: ClipRect(
            child: BackdropFilter(
              filter: _blur,
              child: ColoredBox(color: color),
            ),
          ),
        ),
      ),
      child,
    ],
  );
}
