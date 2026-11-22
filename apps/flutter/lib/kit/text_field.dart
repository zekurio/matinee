import 'package:flutter/material.dart' as material;
import 'package:flutter/services.dart'
    show TextCapitalization, TextInputAction, TextInputFormatter;
import 'package:flutter/widgets.dart';

import 'icon.dart';
import 'theme.dart';
import 'tokens.dart';

class MatineeTextField extends StatefulWidget {
  const MatineeTextField({
    super.key,
    this.controller,
    this.placeholder,
    this.label,
    this.error,
    this.leading,
    this.trailing,
    this.enabled = true,
    this.obscureText = false,
    this.autocorrect = true,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController? controller;
  final String? placeholder;
  final String? label;
  final String? error;
  final String? leading;
  final Widget? trailing;
  final bool enabled;
  final bool obscureText;

  /// Off for what isn't words, which the keyboard shouldn't change: an
  /// address, a path, a claim's name, or a code.
  final bool autocorrect;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;

  /// What the field lets in, as only digits for a year.
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<MatineeTextField> createState() => _MatineeTextFieldState();
}

class _MatineeTextFieldState extends State<MatineeTextField> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final invalid = widget.error != null;
    final stroke = invalid
        ? colors.danger.withValues(alpha: .6)
        : _focused
        ? colors.accent
        : _hovered
        ? colors.inputHover
        : colors.inputBorder;
    final ring = invalid ? colors.danger : colors.accent;
    final labelStyle = KitText.sm.style(
      color: colors.foreground,
      weight: FontWeight.w500,
    );
    final textStyle = KitText.base.style(color: colors.foreground);
    return Opacity(
      opacity: widget.enabled ? 1 : .5,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          if (widget.label case final label?)
            ExcludeSemantics(child: Text(label, style: labelStyle)),
          Focus(
            canRequestFocus: false,
            onFocusChange: (focused) => setState(() => _focused = focused),
            child: MouseRegion(
              onEnter: (_) => setState(() => _hovered = true),
              onExit: (_) => setState(() => _hovered = false),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: colors.field,
                  borderRadius: KitRadius.control,
                  border: Border.all(color: stroke),
                  boxShadow: widget.enabled && (_focused || invalid)
                      ? [
                          BoxShadow(
                            color: ring.withValues(alpha: .2),
                            spreadRadius: 3,
                          ),
                        ]
                      : null,
                ),
                child: Padding(
                  padding: EdgeInsetsDirectional.only(
                    start: widget.leading == null ? 12 : 10,
                    end: widget.trailing == null ? 12 : 4,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 44),
                    child: Row(
                      spacing: 8,
                      children: [
                        if (widget.leading case final icon?)
                          KitIcon(
                            icon,
                            size: 18,
                            color: colors.mutedForeground,
                          ),
                        Expanded(
                          child: Semantics(
                            label: widget.label,
                            child: material.Material(
                              type: material.MaterialType.transparency,
                              child: material.TextField(
                                controller: widget.controller,
                                enabled: widget.enabled,
                                obscureText: widget.obscureText,
                                autocorrect: widget.autocorrect,
                                enableSuggestions: widget.autocorrect,
                                keyboardType: widget.keyboardType,
                                textInputAction: widget.textInputAction,
                                autofillHints: widget.autofillHints,
                                inputFormatters: widget.inputFormatters,
                                textCapitalization: widget.textCapitalization,
                                onChanged: widget.onChanged,
                                onSubmitted: widget.onSubmitted,
                                style: textStyle,
                                decoration: material.InputDecoration(
                                  isCollapsed: true,
                                  border: material.InputBorder.none,
                                  hintText: widget.placeholder,
                                  hintStyle: textStyle.copyWith(
                                    color: colors.mutedForeground,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (widget.trailing case final trailing?)
                          IgnorePointer(
                            ignoring: !widget.enabled,
                            child: trailing,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (widget.error case final error?)
            Semantics(
              liveRegion: true,
              child: Text(error, style: KitText.sm.style(color: colors.danger)),
            ),
        ],
      ),
    );
  }
}
