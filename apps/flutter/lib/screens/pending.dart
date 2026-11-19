import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../kit/kit.dart';

/// Stands in for a screen that isn't ported yet, so every route opens
/// something and the shell can be tried end to end. Each is replaced by
/// its screen; none ships.
class PendingScreen extends StatelessWidget {
  const PendingScreen({super.key, required this.name, required this.location});

  final String name;
  final Uri location;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            spacing: 8,
            children: [
              Text(name, style: KitText.xl.style(color: colors.foreground)),
              Text(
                location.toString(),
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
              if (GoRouter.of(context).canPop())
                MatineeButton(
                  look: ButtonLook.outline,
                  onPressed: () => GoRouter.of(context).pop(),
                  child: const Text('Back'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
