import 'package:flutter/widgets.dart';

import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class Switch extends StatelessWidget {
  const Switch({
    super.key,
    required this.checked,
    required this.onChanged,
    this.label,
  });

  final bool checked;
  final ValueChanged<bool>? onChanged;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final change = onChanged;
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 150);
    const width = 36.0;
    const height = 20.0;
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      button: false,
      toggled: checked,
      label: label,
      shape: KitRadius.pill,
      focusInsets: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      builder: (context, state) => Opacity(
        opacity: change == null ? .5 : 1,
        child: SizedBox(
          width: width + 24,
          height: height + 20,
          child: Center(
            child: AnimatedContainer(
              duration: motion,
              width: width,
              height: height,
              decoration: BoxDecoration(
                color: checked ? colors.accent : colors.inputHover,
                borderRadius: KitRadius.pill,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: AnimatedAlign(
                duration: motion,
                alignment: checked
                    ? AlignmentDirectional.centerEnd
                    : AlignmentDirectional.centerStart,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: checked
                        ? colors.accentForeground
                        : colors.foreground,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
