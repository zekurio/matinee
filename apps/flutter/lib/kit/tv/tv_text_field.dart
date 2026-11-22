import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../theme.dart';
import 'tv_focus.dart';
import 'tv_metrics.dart';

/// A field typed with the TV's keyboard: a list row's size and shape, which
/// fills with the text color while it has focus, in [TvType.title]. Up and Down
/// move on to what's above and below, as a one-line field would otherwise keep
/// them for its caret. Select opens the keyboard again once Back closed it; the
/// keyboard's action key runs [onSubmitted]. [error] rings it in red and shows
/// under it.
class TvTextField extends StatefulWidget {
  const TvTextField({
    super.key,
    required this.controller,
    required this.placeholder,
    this.focusNode,
    this.error,
    this.enabled = true,
    this.autofocus = false,
    this.keyboardType,
    this.textInputAction,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String placeholder;
  final FocusNode? focusNode;
  final String? error;
  final bool enabled;
  final bool autofocus;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  /// A list row's height and a little more.
  static const height = TvListItems.height + 4;

  @override
  State<TvTextField> createState() => _TvTextFieldState();
}

class _TvTextFieldState extends State<TvTextField> {
  FocusNode? _own;

  FocusNode get _node =>
      widget.focusNode ?? (_own ??= FocusNode(debugLabel: 'tv text field'));

  @override
  void initState() {
    super.initState();
    _node.addListener(_changed);
    widget.controller.addListener(_changed);
  }

  @override
  void didUpdateWidget(TvTextField old) {
    super.didUpdateWidget(old);
    final before = old.focusNode ?? _own;
    if (before != _node) {
      before?.removeListener(_changed);
      _node.addListener(_changed);
    }
    if (old.controller != widget.controller) {
      old.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  @override
  void dispose() {
    _node.removeListener(_changed);
    widget.controller.removeListener(_changed);
    _own?.dispose();
    super.dispose();
  }

  void _changed() => setState(() {});

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    final key = event.logicalKey;
    final direction = switch (key) {
      LogicalKeyboardKey.arrowDown => TraversalDirection.down,
      LogicalKeyboardKey.arrowUp => TraversalDirection.up,
      _ => null,
    };
    if (direction != null) {
      if (event is! KeyUpEvent) _node.focusInDirection(direction);
      return KeyEventResult.handled;
    }
    // The remote's centre has no meaning to a text field; it brings back
    // the keyboard Back put away.
    if (key == LogicalKeyboardKey.select) {
      if (event is KeyDownEvent) {
        unawaited(
          SystemChannels.textInput.invokeMethod<void>('TextInput.show'),
        );
      }
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final focused = _node.hasFocus;
    final error = widget.error;
    final field = TvControl(
      focused: focused,
      radius: TvListItems.radius,
      rest: colors.foreground.withValues(alpha: .07),
      scale: TvFocus.rowScale,
      builder: (context, content) {
        final style = TvType.title.style(color: content);
        return DecoratedBox(
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            borderRadius: TvListItems.radius,
            border: error == null
                ? null
                : Border.all(color: colors.danger, width: 2),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: TvTextField.height),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: TvListItems.inset,
              ),
              child: Row(
                spacing: 16,
                children: [
                  Expanded(
                    child: Stack(
                      alignment: AlignmentDirectional.centerStart,
                      children: [
                        if (widget.controller.text.isEmpty)
                          ExcludeSemantics(
                            child: Text(
                              widget.placeholder,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: style.copyWith(
                                color: focused
                                    ? content.withValues(alpha: .55)
                                    : colors.mutedForeground,
                              ),
                            ),
                          ),
                        Semantics(
                          label: widget.placeholder,
                          textField: true,
                          child: EditableText(
                            controller: widget.controller,
                            focusNode: _node,
                            autofocus: widget.autofocus,
                            readOnly: !widget.enabled,
                            style: style,
                            cursorColor: colors.accent,
                            backgroundCursorColor: colors.textFaint,
                            autocorrect: false,
                            enableSuggestions: false,
                            keyboardType: widget.keyboardType,
                            textInputAction: widget.textInputAction,
                            onChanged: widget.onChanged,
                            onSubmitted: widget.onSubmitted,
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
    );
    return Opacity(
      opacity: widget.enabled ? 1 : .5,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Focus(
            canRequestFocus: false,
            skipTraversal: true,
            onKeyEvent: _key,
            child: field,
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: TvListItems.inset,
                top: 12,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Text(
                  error,
                  style: TvType.body.style(color: colors.danger),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
