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

  /// The track's size, and the size the switch takes up, which pads the
  /// track out to 48 tall so a thumb can hit it.
  static const track = Size(52, 32);
  static const size = Size(76, 48);

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
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      button: false,
      toggled: checked,
      label: label,
      shape: KitRadius.pill,
      focusInsets: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      builder: (context, state) => Opacity(
        opacity: change == null ? .5 : 1,
        child: SizedBox.fromSize(
          size: size,
          child: Center(
            child: AnimatedContainer(
              duration: motion,
              width: track.width,
              height: track.height,
              decoration: BoxDecoration(
                color: checked ? colors.accent : colors.inputHover,
                borderRadius: KitRadius.pill,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: AnimatedAlign(
                duration: motion,
                alignment: checked
                    ? AlignmentDirectional.centerEnd
                    : AlignmentDirectional.centerStart,
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    // Off, a white thumb on the grey track in light, and a
                    // light one in dark, as the web's switch has it.
                    color: checked
                        ? colors.accentForeground
                        : colors.isDark
                        ? colors.foreground
                        : colors.background,
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
