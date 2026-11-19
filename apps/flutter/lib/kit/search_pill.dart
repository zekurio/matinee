import 'package:flutter/material.dart' as material;
import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

class SearchPill extends StatelessWidget {
  const SearchPill({
    super.key,
    required this.expanded,
    required this.searchLabel,
    required this.onOpen,
    required this.onClose,
    this.backLabel,
    this.controller,
    this.focusNode,
    this.clearLabel,
    this.autofocus = false,
    this.onChanged,
    this.onSubmitted,
  }) : assert(!expanded || backLabel != null);

  final bool expanded;
  final String searchLabel;
  final String? backLabel;
  final VoidCallback onOpen;
  final VoidCallback onClose;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? clearLabel;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final textStyle = KitText.base.style(color: colors.foreground);
    final editing = controller;
    final animate = !MediaQuery.disableAnimationsOf(context);
    final duration = animate
        ? const Duration(milliseconds: 220)
        : Duration.zero;
    final leading = _PillAction(
      icon: expanded ? Lucide.arrowLeft : Lucide.search,
      label: expanded ? backLabel! : searchLabel,
      onPressed: expanded ? onClose : onOpen,
    );

    final pill = AnimatedContainer(
      duration: duration,
      decoration: BoxDecoration(
        color: expanded
            ? Color.alphaBlend(
                colors.foreground.withValues(alpha: .06),
                colors.background,
              )
            : colors.secondary,
        border: Border.fromBorderSide(
          BorderSide(
            color: colors.foreground.withValues(alpha: expanded ? .12 : 0),
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        borderRadius: KitRadius.pill,
      ),
      child: expanded
          ? Row(
              spacing: 2,
              children: [
                leading,
                Expanded(
                  child: Semantics(
                    label: searchLabel,
                    child: material.Material(
                      type: material.MaterialType.transparency,
                      child: material.TextField(
                        controller: editing,
                        focusNode: focusNode,
                        autofocus: autofocus,
                        onChanged: onChanged,
                        onSubmitted: onSubmitted,
                        textInputAction: TextInputAction.search,
                        style: textStyle,
                        decoration: material.InputDecoration(
                          isCollapsed: true,
                          border: material.InputBorder.none,
                          hintText: searchLabel,
                          hintStyle: textStyle.copyWith(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (editing != null && clearLabel != null)
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: editing,
                    builder: (context, value, child) => value.text.isEmpty
                        ? const SizedBox(width: 12)
                        : _PillAction(
                            icon: Lucide.x,
                            label: clearLabel!,
                            onPressed: () {
                              editing.clear();
                              onChanged?.call('');
                            },
                          ),
                  )
                else
                  const SizedBox(width: 12),
              ],
            )
          : leading,
    );
    // AnimatedSize can't take a zero duration: it would finish inside its own
    // layout and dirty itself. With animations off there is nothing to animate.
    return animate
        ? AnimatedSize(
            alignment: AlignmentDirectional.centerStart,
            curve: Curves.easeOutCubic,
            duration: duration,
            child: pill,
          )
        : pill;
  }
}

class _PillAction extends StatelessWidget {
  const _PillAction({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final String icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: KitRadius.pill,
      focusInsets: const EdgeInsets.all(4),
      builder: (context, state) => DecoratedBox(
        decoration: BoxDecoration(
          color: state == PressState.pressed ? colors.hairline : null,
          borderRadius: KitRadius.pill,
        ),
        child: SizedBox.square(
          dimension: 40,
          child: Center(child: KitIcon(icon, color: colors.foreground)),
        ),
      ),
    );
  }
}
