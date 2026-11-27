import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/matinee_api.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../l10n/server_text.dart';
import '../settings_rows.dart';
import 'admin_data.dart';

/* A fulfilment source describes its own fields, and the app draws them: a
 * text field, a secret, a choice, several choices, or a switch. These are the
 * web's connection-fields.tsx, word for word in what they send. */

/// A described field's value as its input holds it: text as a string, a
/// switch as true or false, and several choices as strings.
Object? formValue(DescribedField field, Map<String, Object?> values) {
  final value = values[field.key];
  return switch (field.kind) {
    'switch' => value is bool && value,
    'multiselect' => switch (value) {
      final List<Object?> list => [
        for (final entry in list)
          if (entry is String || entry is num) '$entry',
      ],
      _ => const <String>[],
    },
    _ => switch (value) {
      final String text => text,
      final num number => '$number',
      final bool flag => '$flag',
      _ => '',
    },
  };
}

/// Saved values as the inputs for [fields] hold them.
Map<String, Object?> formValues(
  List<DescribedField> fields,
  Map<String, Object?> values,
) => {for (final field in fields) field.key: formValue(field, values)};

/// The text a value holds, or nothing for a switch or a list.
String textOf(Object? value) => value is String
    ? value
    : value is num
    ? '$value'
    : '';

/// What the inputs hold, to send: empty text and choices left out.
Map<String, Object?> sendValues(
  List<DescribedField> fields,
  Map<String, Object?> values,
) {
  final sent = <String, Object?>{};
  for (final field in fields) {
    switch (formValue(field, values)) {
      case final bool flag:
        sent[field.key] = flag;
      case final List<String> list:
        sent[field.key] = list;
      case final String text when text.trim().isNotEmpty:
        sent[field.key] = text.trim();
      case _:
        break;
    }
  }
  return sent;
}

/// A required field without a value, if any.
DescribedField? missingField(
  List<DescribedField> fields,
  Map<String, Object?> values,
) {
  for (final field in fields) {
    if (!field.required) continue;
    final value = formValue(field, values);
    if (value is String && value.trim().isEmpty ||
        value is List && value.isEmpty) {
      return field;
    }
  }
  return null;
}

/// A field a source describes: its label, then its input, and under it
/// [footer], such as where its folder lands.
class DescribedFieldRow extends StatelessWidget {
  const DescribedFieldRow({
    super.key,
    required this.field,
    required this.value,
    required this.onChanged,
    this.unset,
    this.footer,
  });

  final DescribedField field;
  final Object? value;
  final ValueChanged<Object?> onChanged;

  /// What an unset choice means, like "Same as above".
  final String? unset;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final label = field.label.serverWords(l);
    if (field.kind == 'switch') {
      return SwitchRow(
        title: label,
        checked: value == true,
        onChanged: onChanged,
      );
    }
    if (field.kind == 'multiselect') {
      final chosen = switch (formValue(field, {field.key: value})) {
        final List<String> list => list,
        _ => const <String>[],
      };
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 6,
          children: [
            _FieldLabel(label),
            if (field.choices.isEmpty)
              Note(l.webConnectionsFieldNoChoices)
            else
              MultiSelect(
                choices: [
                  for (final choice in field.choices)
                    MultiSelectChoice(
                      value: choice.value,
                      label: choice.label.serverWords(l),
                    ),
                ],
                value: chosen,
                onChanged: onChanged,
                placeholder: l.webConnectionsFieldFind,
                label: label,
                empty: l.webConnectionsFieldFindEmpty,
                removeLabel: l.multiSelectRemove,
              ),
            ?footer,
          ],
        ),
      );
    }
    final text = textOf(value);
    if (field.kind == 'select') {
      return _SelectRow(
        label: label,
        text: text,
        choices: field.choices,
        required: field.required,
        unset: unset ?? l.webConnectionsFieldUnset,
        onPicked: onChanged,
        footer: footer,
      );
    }
    return _TextRow(
      label: label,
      value: text,
      secret: field.kind == 'secret',
      onChanged: onChanged,
      footer: footer,
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: KitText.sm.style(
      color: MatineeTheme.of(context).foreground,
      weight: FontWeight.w500,
    ),
  );
}

/// A text or secret input with its value kept as the page rebuilds.
class _TextRow extends StatefulWidget {
  const _TextRow({
    required this.label,
    required this.value,
    required this.secret,
    required this.onChanged,
    this.footer,
  });

  final String label;
  final String value;
  final bool secret;
  final ValueChanged<String> onChanged;
  final Widget? footer;

  @override
  State<_TextRow> createState() => _TextRowState();
}

class _TextRowState extends State<_TextRow> {
  late final _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(_TextRow old) {
    super.didUpdateWidget(old);
    if (widget.value != _controller.text) _controller.text = widget.value;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        _FieldLabel(widget.label),
        MatineeTextField(
          controller: _controller,
          obscureText: widget.secret,
          autocorrect: false,
          onChanged: widget.onChanged,
        ),
        ?widget.footer,
      ],
    ),
  );
}

/// A choice out of [choices], drawn as a field whose menu opens under it. A
/// choice that isn't required can be left unset, which [unset] names.
class _SelectRow extends StatelessWidget {
  const _SelectRow({
    required this.label,
    required this.text,
    required this.choices,
    required this.required,
    required this.unset,
    required this.onPicked,
    this.footer,
  });

  final String label;
  final String text;
  final List<DescribedFieldChoice> choices;
  final bool required;
  final String unset;
  final ValueChanged<Object?> onPicked;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final items = <(String, String)>[
      if (!required) ('', unset),
      for (final choice in choices) (choice.value, choice.label.serverWords(l)),
      // A saved value the server no longer offers still shows.
      if (text.isNotEmpty && !choices.any((choice) => choice.value == text))
        (text, text),
    ];
    var shown = text;
    for (final (value, choice) in items) {
      if (value == text) shown = choice;
    }
    if (shown.isEmpty) {
      shown = choices.isEmpty ? l.webConnectionsFieldNoChoices : unset;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 6,
        children: [
          _FieldLabel(label),
          Menu(
            trigger: (context, toggle, isOpen, focus) => PressIndication(
              onPressed: choices.isEmpty && text.isEmpty ? null : toggle,
              focusNode: focus,
              label: '$label, $shown',
              shape: KitRadius.control,
              builder: (context, state) => PressFill(
                decoration: BoxDecoration(
                  color: colors.field,
                  borderRadius: KitRadius.control,
                  border: Border.all(
                    color: state == PressState.idle && !isOpen
                        ? colors.inputBorder
                        : colors.accent,
                  ),
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      spacing: 8,
                      children: [
                        Expanded(
                          child: ExcludeSemantics(
                            child: Text(
                              shown,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: KitText.base.style(
                                color: choices.isEmpty && text.isEmpty
                                    ? colors.mutedForeground
                                    : colors.foreground,
                              ),
                            ),
                          ),
                        ),
                        KitIcon(
                          Lucide.chevronDown,
                          size: 16,
                          color: colors.mutedForeground,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            children: [
              for (final (value, choice) in items)
                MenuItem(
                  label: choice,
                  selected: value == text,
                  onPressed: () {
                    if (value != text) onPicked(value);
                  },
                ),
            ],
          ),
          ?footer,
        ],
      ),
    );
  }
}

/// Where a folder lands: the library whose folder holds it, which the
/// server works out, or, when none does, the library an admin picks.
class LandsIn extends ConsumerWidget {
  const LandsIn({
    super.key,
    required this.kind,
    required this.folder,
    required this.picked,
    required this.onPick,
  });

  final String kind;
  final String folder;

  /// The library saved for this folder, when no library holds it.
  final String? picked;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    if (folder.isEmpty) return const SizedBox.shrink();
    final landing = ref.watch(
      fulfilmentLandingProvider((kind: kind, folder: folder)),
    );
    final answer = landing.value;
    if (answer == null) return const SizedBox.shrink();
    if (answer.hidden) {
      return Note(l.webConnectionsLandsHidden(folder), danger: true);
    }
    final library = answer.library;
    if (library != null) return Note(l.webConnectionsLandsIn(library.name));
    final homes = [
      for (final each
          in ref.watch(adminLibrariesProvider).value ?? const <Library>[])
        if (each.metadataProvider != null &&
            each.kind ==
                (kind == TitleKind.movie
                    ? LibraryKind.movies
                    : LibraryKind.shows))
          (each.id, each.name),
    ];
    final chosen = homes.any((home) => home.$1 == picked) ? picked ?? '' : '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Note(l.webConnectionsLost(folder), danger: true),
        _PickLibrary(
          label: l.webConnectionsLandsInPick,
          options: homes,
          current: chosen,
          onPicked: onPick,
        ),
      ],
    );
  }
}

/// A choice of [options], as the picker under a folder that no library holds.
class _PickLibrary extends StatelessWidget {
  const _PickLibrary({
    required this.label,
    required this.options,
    required this.current,
    required this.onPicked,
  });

  final String label;
  final List<(String, String)> options;
  final String current;
  final ValueChanged<String> onPicked;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    var shown = current;
    for (final (value, name) in options) {
      if (value == current) shown = name;
    }
    if (shown.isEmpty) shown = label;
    return Menu(
      trigger: (context, toggle, isOpen, focus) => PressIndication(
        onPressed: options.isEmpty ? null : toggle,
        focusNode: focus,
        label: '$label, $shown',
        shape: KitRadius.control,
        builder: (context, state) => PressFill(
          decoration: BoxDecoration(
            color: colors.field,
            borderRadius: KitRadius.control,
            border: Border.all(
              color: state == PressState.idle && !isOpen
                  ? colors.inputBorder
                  : colors.accent,
            ),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: ExcludeSemantics(
                      child: Text(
                        shown,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.base.style(
                          color: current.isEmpty
                              ? colors.mutedForeground
                              : colors.foreground,
                        ),
                      ),
                    ),
                  ),
                  KitIcon(
                    Lucide.chevronDown,
                    size: 16,
                    color: colors.mutedForeground,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      children: [
        for (final (value, name) in options)
          MenuItem(
            label: name,
            selected: value == current,
            onPressed: () => onPicked(value),
          ),
      ],
    );
  }
}
