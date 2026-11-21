import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../icon.dart';
import '../theme.dart';
import 'tv_buttons.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// A search field for TV pages, as the Kotlin app's `TvSearchField`. Focus
/// rests on it like on a button, so moving past it with the D-pad doesn't
/// pop the keyboard up; Select opens the keyboard into it. The keyboard's
/// search key hands focus back to the field, and so do Up and Down. With
/// text in it, a clear button sits at its end. [focusNode] is the field's,
/// for a [TvFocusMemory]; [height] is the pill's.
class TvSearchField extends StatefulWidget {
  const TvSearchField({
    super.key,
    required this.controller,
    required this.placeholder,
    required this.clearLabel,
    this.onChanged,
    this.focusNode,
    this.height = TvButtons.height,
    this.textStyle,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String placeholder;
  final String clearLabel;
  final ValueChanged<String>? onChanged;
  final FocusNode? focusNode;
  final double height;
  final TextStyle? textStyle;
  final bool autofocus;

  @override
  State<TvSearchField> createState() => _TvSearchFieldState();
}

class _TvSearchFieldState extends State<TvSearchField> {
  FocusNode? _ownOuter;
  late final _inner = FocusNode(
    debugLabel: 'search text',
    canRequestFocus: false,
  );
  bool _editing = false;

  FocusNode get _outer =>
      widget.focusNode ?? (_ownOuter ??= FocusNode(debugLabel: 'search'));

  @override
  void initState() {
    super.initState();
    _inner.addListener(_innerChanged);
    widget.controller.addListener(_text);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_text);
    _inner.dispose();
    _ownOuter?.dispose();
    super.dispose();
  }

  void _text() => setState(() {});

  void _innerChanged() {
    setState(() {});
    if (!_inner.hasFocus && _editing) {
      _editing = false;
      _inner.canRequestFocus = false;
    }
  }

  void _edit() {
    setState(() => _editing = true);
    _inner.canRequestFocus = true;
    _inner.requestFocus();
    unawaited(SystemChannels.textInput.invokeMethod<void>('TextInput.show'));
  }

  void _stop() {
    unawaited(SystemChannels.textInput.invokeMethod<void>('TextInput.hide'));
    _editing = false;
    _inner.canRequestFocus = false;
    _outer.requestFocus();
  }

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    final direction = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowDown => TraversalDirection.down,
      LogicalKeyboardKey.arrowUp => TraversalDirection.up,
      _ => null,
    };
    if (direction == null) return KeyEventResult.ignored;
    if (event is KeyDownEvent) {
      _stop();
      _outer.focusInDirection(direction);
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final style = widget.textStyle ?? TvType.facts.style();
    final empty = widget.controller.text.isEmpty;
    return Row(
      spacing: 14,
      children: [
        Expanded(
          child: TvFocusable(
            focusNode: _outer,
            autofocus: widget.autofocus,
            label: widget.placeholder,
            onPressed: _edit,
            builder: (context, focused) {
              final lit = focused || _inner.hasFocus;
              return TvControl(
                focused: lit,
                scale: TvFocus.rowScale,
                builder: (context, content) => SizedBox(
                  height: widget.height,
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 18,
                      end: 22,
                    ),
                    child: Row(
                      spacing: 12,
                      children: [
                        KitIcon(
                          Lucide.search,
                          size: 22,
                          color: lit ? content : colors.mutedForeground,
                        ),
                        Expanded(
                          child: Stack(
                            alignment: AlignmentDirectional.centerStart,
                            children: [
                              if (empty)
                                Text(
                                  widget.placeholder,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: style.copyWith(
                                    color: lit
                                        ? content.withValues(alpha: .55)
                                        : colors.textFaint,
                                  ),
                                ),
                              Focus(
                                canRequestFocus: false,
                                skipTraversal: true,
                                onKeyEvent: _key,
                                child: EditableText(
                                  controller: widget.controller,
                                  focusNode: _inner,
                                  style: style.copyWith(color: content),
                                  cursorColor: colors.accent,
                                  backgroundCursorColor: colors.textFaint,
                                  textInputAction: TextInputAction.search,
                                  onChanged: widget.onChanged,
                                  onSubmitted: (_) => _stop(),
                                  maxLines: 1,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        if (!empty)
          TvRoundButton(
            icon: Lucide.x,
            label: widget.clearLabel,
            size: widget.height,
            onPressed: () {
              widget.controller.clear();
              widget.onChanged?.call('');
              _outer.requestFocus();
            },
          ),
      ],
    );
  }
}
