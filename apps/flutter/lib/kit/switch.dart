import 'package:flutter/widgets.dart';

import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// A switch to tap on its own: a [SwitchTrack] padded out to [size], 48
/// tall, so a thumb can hit it. A row that toggles as a whole shows the
/// track alone instead.
class Switch extends StatelessWidget {
  const Switch({
    super.key,
    required this.checked,
    required this.onChanged,
    this.label,
  });

  static const size = Size(76, 48);

  final bool checked;
  final ValueChanged<bool>? onChanged;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final change = onChanged;
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      button: false,
      toggled: checked,
      label: label,
      shape: KitRadius.pill,
      // The ring goes round the track, not the room around it.
      focusInsets: EdgeInsets.symmetric(
        horizontal: (size.width - SwitchTrack.size.width) / 2,
        vertical: (size.height - SwitchTrack.size.height) / 2,
      ),
      builder: (context, state) => SizedBox.fromSize(
        size: size,
        child: Center(
          child: SwitchTrack(checked: checked, enabled: change != null),
        ),
      ),
    );
  }
}

/// A switch's track and thumb, with nothing to tap, focus, or read out: for
/// a row that takes the tap itself and says what's on. Dimmed when not
/// [enabled].
class SwitchTrack extends StatelessWidget {
  const SwitchTrack({super.key, required this.checked, this.enabled = true});

  static const size = Size(52, 32);

  final bool checked;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final motion = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 150);
    return Opacity(
      opacity: enabled ? 1 : .5,
      child: AnimatedContainer(
        duration: motion,
        width: size.width,
        height: size.height,
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
              // Off, the thumb is light on the grey track in both themes:
              // the page's background in light, the foreground in dark.
              // The web's smaller thumb is the foreground in both; at 24
              // across that's a heavy black dot in light.
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
    );
  }
}
