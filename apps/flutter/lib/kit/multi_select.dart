import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart' as material;
import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';

import '../core/text_search.dart';
import 'icon.dart';
import 'motion.dart';
import 'press_indication.dart';
import 'theme.dart';
import 'tokens.dart';

/// How much of the field's last line the text field needs before it drops to
/// a line of its own, so it stays wide enough to type in.
const _minInputWidth = 80.0;

/// What a chip takes besides its label: the padding at each end, the gap,
/// and the ×'s box.
const _chipChrome = 36.0;

/// A choice a [MultiSelect] offers: what it sets, its words, and how many
/// titles it has, as [Filters]'s controls read.
@immutable
class MultiSelectChoice {
  const MultiSelectChoice({
    required this.value,
    required this.label,
    this.count,
  });

  final String value;
  final String label;

  /// The count beside the label, already formatted.
  final String? count;
}

/// Any number of values out of a list, as the web's combobox: the chosen
/// ones as small chips inside a bordered field, the field's text after
/// them finding the rest. The choices show under the field while it has
/// focus, each ticked while it's on; picking one adds its chip, and a
/// chip's × takes it off.
///
/// [label] names the field for a screen reader, [removeLabel] names each
/// chip's ×, and [empty] is what the list says when nothing matches the
/// text. [value] holds the chosen values, in the order they were picked;
/// a value the choices don't hold stays a chip named by itself.
class MultiSelect extends StatefulWidget {
  const MultiSelect({
    super.key,
    required this.choices,
    required this.value,
    required this.onChanged,
    required this.placeholder,
    required this.removeLabel,
    this.label,
    this.empty,
  });

  final List<MultiSelectChoice> choices;
  final List<String> value;
  final ValueChanged<List<String>> onChanged;

  /// What the field says while nothing is chosen.
  final String placeholder;
  final String Function(String label) removeLabel;
  final String? label;
  final String? empty;

  @override
  State<MultiSelect> createState() => _MultiSelectState();
}

class _MultiSelectState extends State<MultiSelect> {
  final _query = TextEditingController();
  final _focus = FocusNode();
  bool _hovered = false;

  @override
  void initState() {
    super.initState();
    _query.addListener(_changed);
    _focus.addListener(_focused);
  }

  void _changed() => setState(() {});

  void _focused() {
    setState(() {});
    if (!_focus.hasFocus) return;
    // The list opens under the field and the keyboard may have just come
    // up: put the field near the top of what's left, so the list shows.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_focus.hasFocus) return;
      unawaited(
        Scrollable.ensureVisible(
          context,
          alignment: .05,
          duration: KitMotion.of(context, KitMotion.move),
          curve: KitMotion.easing,
        ),
      );
    });
  }

  @override
  void dispose() {
    _query.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _toggle(String value) {
    final on = widget.value.contains(value);
    widget.onChanged([
      for (final each in widget.value)
        if (each != value) each,
      if (!on) value,
    ]);
    _query.clear();
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final chosen = [
      for (final value in widget.value)
        widget.choices.where((choice) => choice.value == value).firstOrNull ??
            MultiSelectChoice(value: value, label: value),
    ];
    final query = foldSearchText(_query.text.trim());
    final shown = [
      for (final choice in widget.choices)
        if (query.isEmpty || foldSearchText(choice.label).contains(query))
          choice,
    ];
    final focused = _focus.hasFocus;
    final open = focused || _query.text.trim().isNotEmpty;
    final stroke = focused
        ? colors.accent
        : _hovered
        ? colors.inputHover
        : colors.inputBorder;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MouseRegion(
          cursor: SystemMouseCursors.text,
          onEnter: (_) => setState(() => _hovered = true),
          onExit: (_) => setState(() => _hovered = false),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.field,
              borderRadius: KitRadius.control,
              border: Border.all(color: stroke),
              boxShadow: focused
                  ? [
                      BoxShadow(
                        color: colors.accent.withValues(alpha: .2),
                        spreadRadius: 3,
                      ),
                    ]
                  : null,
            ),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _focus.requestFocus,
              child: Padding(
                padding: const EdgeInsetsDirectional.only(
                  start: 5,
                  end: 12,
                  top: 4,
                  bottom: 4,
                ),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final width = math.max(96.0, constraints.maxWidth);
                    final input = _inputWidth(context, chosen, width);
                    return ConstrainedBox(
                      // A line of chips, and the field with nothing picked,
                      // are the kit's input height.
                      constraints: const BoxConstraints(minHeight: 36),
                      child: Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          for (final choice in chosen)
                            ConstrainedBox(
                              constraints: BoxConstraints(maxWidth: width - 8),
                              child: _SelectedChip(
                                label: choice.label,
                                removeLabel: widget.removeLabel(choice.label),
                                onRemove: () => _toggle(choice.value),
                              ),
                            ),
                          SizedBox(
                            width: input,
                            child: Semantics(
                              label: widget.label ?? widget.placeholder,
                              child: material.Material(
                                type: material.MaterialType.transparency,
                                child: material.TextField(
                                  controller: _query,
                                  focusNode: _focus,
                                  autocorrect: true,
                                  textInputAction: TextInputAction.search,
                                  onSubmitted: (_) {
                                    if (shown.length == 1) {
                                      _toggle(shown.single.value);
                                    }
                                  },
                                  style: KitText.base.style(
                                    color: colors.foreground,
                                  ),
                                  decoration: material.InputDecoration(
                                    isCollapsed: true,
                                    border: material.InputBorder.none,
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 4,
                                      vertical: 6,
                                    ),
                                    hintText: chosen.isEmpty
                                        ? widget.placeholder
                                        : null,
                                    hintStyle: KitText.base.style(
                                      color: colors.mutedForeground,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
        if (open) ...[
          const SizedBox(height: 6),
          _Choices(
            choices: shown,
            chosen: widget.value,
            empty: widget.empty,
            onPick: _toggle,
          ),
        ],
      ],
    );
  }

  /// The text field's width on the line the chips leave: the rest of that
  /// line, or a line of its own when too little is left to type in.
  double _inputWidth(
    BuildContext context,
    List<MultiSelectChoice> chosen,
    double width,
  ) {
    if (chosen.isEmpty) return width;
    // The chip's words as its Text lays them out, inherited style and all.
    final style = DefaultTextStyle.of(context).style
        .merge(KitText.px13.style(weight: FontWeight.w500));
    final direction = Directionality.of(context);
    final scaler = MediaQuery.textScalerOf(context);
    var line = 0.0;
    for (final choice in chosen) {
      final painter = TextPainter(
        text: TextSpan(text: choice.label, style: style),
        maxLines: 1,
        textDirection: direction,
        textScaler: scaler,
      )..layout();
      final chip = math.min(width - 8, _chipChrome + painter.width);
      painter.dispose();
      if (line > 0 && line + 4 + chip > width) line = 0;
      line = line == 0 ? chip : line + 4 + chip;
    }
    final left = width - (line > 0 ? line + 4 : 0);
    // Stay just under the line so rounding can't push the field onto the
    // next one.
    return left >= _minInputWidth ? left - .5 : width;
  }
}

/// A chosen value inside the field, with its ×.
class _SelectedChip extends StatelessWidget {
  const _SelectedChip({
    required this.label,
    required this.removeLabel,
    required this.onRemove,
  });

  final String label;
  final String removeLabel;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Semantics(
      container: true,
      label: label,
      child: Container(
        height: 28,
        padding: const EdgeInsetsDirectional.only(start: 8, end: 2),
        decoration: BoxDecoration(
          color: colors.secondary,
          borderRadius: const BorderRadius.all(Radius.circular(KitRadius.sm)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 2,
          children: [
            Flexible(
              child: ExcludeSemantics(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.px13.style(
                    color: colors.foreground,
                    weight: FontWeight.w500,
                  ),
                ),
              ),
            ),
            PressIndication(
              onPressed: onRemove,
              label: removeLabel,
              shape: const BorderRadius.all(Radius.circular(KitRadius.sm)),
              focusInsets: const EdgeInsets.all(1),
              builder: (context, state) => SizedBox.square(
                dimension: 24,
                child: Center(
                  child: KitIcon(
                    Lucide.x,
                    size: 14,
                    color: state == PressState.idle
                        ? colors.mutedForeground
                        : colors.foreground,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The choices under the field, in a panel of their own so many of them
/// scroll rather than run past the sheet.
class _Choices extends StatelessWidget {
  const _Choices({
    required this.choices,
    required this.chosen,
    required this.empty,
    required this.onPick,
  });

  final List<MultiSelectChoice> choices;
  final List<String> chosen;
  final String? empty;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.popover,
        borderRadius: KitRadius.control,
        border: Border.all(color: colors.hairline),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 240),
        child: SingleChildScrollView(
          primary: false,
          padding: const EdgeInsets.all(4),
          child: choices.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 10,
                  ),
                  child: Text(
                    empty ?? '',
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final choice in choices)
                      _ChoiceRow(
                        choice: choice,
                        selected: chosen.contains(choice.value),
                        onPressed: () => onPick(choice.value),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// One choice under the field: its name, its count, and a tick while it's
/// on.
class _ChoiceRow extends StatelessWidget {
  const _ChoiceRow({
    required this.choice,
    required this.selected,
    required this.onPressed,
  });

  final MultiSelectChoice choice;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final count = choice.count;
    return PressIndication(
      onPressed: onPressed,
      label: [choice.label, ?count].join(', '),
      checked: selected,
      shape: const BorderRadius.all(Radius.circular(KitRadius.md)),
      builder: (context, state) => PressFill(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Row(
              spacing: 12,
              children: [
                Expanded(
                  child: Text(
                    choice.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(color: colors.foreground),
                  ),
                ),
                if (count != null)
                  Text(
                    count,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
                if (selected)
                  KitIcon(Lucide.check, size: 16, color: colors.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
