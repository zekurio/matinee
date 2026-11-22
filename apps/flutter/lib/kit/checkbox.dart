import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';

class Checkbox extends StatelessWidget {
  const Checkbox({super.key, required this.checked, required this.onChanged});

  final bool checked;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final change = onChanged;
    return PressIndication(
      onPressed: change == null ? null : () => change(!checked),
      button: false,
      checked: checked,
      shape: const BorderRadius.all(Radius.circular(5)),
      focusInsets: const EdgeInsets.all(10),
      builder: (context, state) => Opacity(
        opacity: change == null ? .5 : 1,
        child: SizedBox.square(
          dimension: 38,
          child: Center(
            child: Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: checked ? colors.accent : null,
                borderRadius: const BorderRadius.all(Radius.circular(5)),
                border: Border.all(
                  color: checked ? colors.accent : colors.inputHover,
                ),
              ),
              alignment: Alignment.center,
              child: checked
                  ? KitIcon(
                      Lucide.check,
                      size: 14,
                      color: colors.accentForeground,
                      strokeWidth: 3,
                    )
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}
