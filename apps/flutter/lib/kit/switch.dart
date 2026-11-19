import 'package:flutter/widgets.dart';

import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

enum SwitchSize { standard, sm }

class Switch extends StatelessWidget {
  const Switch({
    super.key,
    required this.checked,
    required this.onChanged,
    this.size = SwitchSize.standard,
    this.label,
  });

  final bool checked;
  final ValueChanged<bool>? onChanged;
  final SwitchSize size;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final change = onChanged;
    final small = size == SwitchSize.sm;
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 150);
    final width = small ? 24.0 : 36.0;
    final height = small ? 14.0 : 20.0;
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
              padding: EdgeInsets.symmetric(horizontal: small ? 1 : 2),
              child: AnimatedAlign(
                duration: motion,
                alignment: checked
                    ? AlignmentDirectional.centerEnd
                    : AlignmentDirectional.centerStart,
                child: Container(
                  width: small ? 12 : 16,
                  height: small ? 12 : 16,
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
