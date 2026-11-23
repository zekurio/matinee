import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/field_errors.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../l10n/server_text.dart';
import '../../../query/failure_view.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';
import 'connection_fields.dart';

/// The slug a name makes: "Films 4K" becomes FILMS_4K.
String connectionSlug(String name) {
  var slug = name
      .toUpperCase()
      .replaceAll(RegExp('[^A-Z0-9]+'), '_')
      .replaceFirst(RegExp('^[^A-Z]+'), '')
      .replaceFirst(RegExp('_+\$'), '');
  if (slug.length > 64) slug = slug.substring(0, 64);
  return slug;
}

final _slugPattern = RegExp(r'^[A-Z][A-Z0-9_]{0,63}$');

/// A connection, as a page of its own: a new one, or with [id] one to change.
/// Its fields are the ones its source describes, as the web's dialog draws
/// them, and Test asks the server behind it for its choices before they are
/// saved.
class ConnectionEditorScreen extends ConsumerWidget {
  const ConnectionEditorScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final sources = ref.watch(fulfilmentSourcesProvider);
    final connections = ref.watch(adminConnectionsProvider);
    final sourceList = sources.value;
    final list = connections.value;
    FulfilmentConnection? existing;
    for (final connection in list ?? const <FulfilmentConnection>[]) {
      if (connection.id == id) existing = connection;
    }
    final title = id == null
        ? l.webConnectionsDialogAddTitle
        : l.webConnectionsDialogEditTitle(existing?.name ?? '');
    bool allows(User user) =>
        can(user, Permission.fulfilmentRead) &&
        (id == null
            ? can(user, Permission.fulfilmentCreate) &&
                  can(user, Permission.fulfilmentUpdate)
            : can(user, Permission.fulfilmentUpdate) &&
                  (existing?.editable ?? false));
    if (sourceList == null || (id != null && list == null)) {
      final failed = sources.error ?? (id == null ? null : connections.error);
      return AdminGate(
        allows: allows,
        child: AdminPage(
          title: title,
          child: failed == null
              ? LoadingState(label: l.adminLoading)
              : Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: FailureState(
                      title: l.adminLoadFailed,
                      error: failed,
                      onRetry: () {
                        ref
                          ..invalidate(fulfilmentSourcesProvider)
                          ..invalidate(adminConnectionsProvider);
                      },
                    ),
                  ),
                ),
        ),
      );
    }
    if (id != null && existing == null) {
      return AdminGate(
        allows: (user) => can(user, Permission.fulfilmentRead),
        child: AdminPage(
          title: l.webConnectionsTitle,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: FailureState(
                title: l.adminLoadFailed,
                error: const ApiException(status: 404),
                onRetry: () => ref.invalidate(adminConnectionsProvider),
              ),
            ),
          ),
        ),
      );
    }
    return AdminGate(
      allows: allows,
      child: _ConnectionEditor(
        key: ValueKey(existing?.id),
        title: title,
        existing: existing,
        sources: sourceList,
        others: [
          for (final connection in list!)
            if (connection.id != id) connection,
        ],
      ),
    );
  }
}

class _ConnectionEditor extends ConsumerStatefulWidget {
  const _ConnectionEditor({
    super.key,
    required this.title,
    required this.existing,
    required this.sources,
    required this.others,
  });

  final String title;

  /// Unset for a new one.
  final FulfilmentConnection? existing;
  final List<FulfilmentSourceDescription> sources;

  /// Every other saved connection, for which kinds already have a default.
  final List<FulfilmentConnection> others;

  @override
  ConsumerState<_ConnectionEditor> createState() => _ConnectionEditorState();
}

class _ConnectionEditorState extends ConsumerState<_ConnectionEditor> {
  late String _sourceId =
      widget.existing?.source ?? widget.sources.firstOrNull?.id ?? '';
  late String _name = widget.existing?.name ?? '';
  late String _slug = widget.existing?.slug ?? '';
  late bool _slugEdited = widget.existing != null;
  late Map<String, Object?> _settings = formValues(
    _source?.fields ?? const [],
    widget.existing?.settings ?? _source?.values ?? const {},
  );
  late List<DescribedField> _optionFields = const [];
  late Map<String, Object?> _optionValues = const {};
  late List<String> _defaultFor =
      widget.existing?.defaultFor.toList() ?? _freeKinds(_source);
  late Map<String, String> _folderLibraries = {
    ...?widget.existing?.folderLibraries,
  };
  var _apiKey = '';
  var _dropKey = false;
  var _optionsLoaded = false;
  var _testing = false;
  String? _testError;

  /// The details the last test asked with, to tell an edit since then.
  String? _tested;
  Map<String, String> _errors = const {};
  String? _failure;
  var _saving = false;

  FulfilmentSourceDescription? get _source => _sourceOf(_sourceId);

  FulfilmentSourceDescription? _sourceOf(String id) {
    for (final source in widget.sources) {
      if (source.id == id) return source;
    }
    return null;
  }

  /// The kinds the source takes that no other connection is the default for.
  List<String> _freeKinds(FulfilmentSourceDescription? source) => [
    for (final kind in source?.kinds ?? const <String>[])
      if (!widget.others.any(
        (connection) => connection.defaultFor.contains(kind),
      ))
        kind,
  ];

  List<DescribedField> _connectionFields(FulfilmentSourceDescription source) =>
      [
        for (final field in source.fields)
          if (field.section == FieldSection.connection) field,
      ];

  /// What a test asks with: the source, its slug, what reaches it, and the
  /// key typed in.
  String _signature(FulfilmentSourceDescription source) => jsonEncode({
    'source': source.id,
    'slug': _slug.trim(),
    'settings': sendValues(_connectionFields(source), _settings),
    'apiKey': _apiKey.trim(),
  });

  bool get _connected =>
      !_testing && _tested != null && _tested == _signatureOf(_source);

  String? _signatureOf(FulfilmentSourceDescription? source) =>
      source == null ? null : _signature(source);

  @override
  void initState() {
    super.initState();
    final source = _source;
    if (widget.existing != null || (source?.fields.isEmpty ?? false)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_fetchOptions());
      });
    }
  }

  /// Asks the server behind the connection for its choices, with the details
  /// as they stand, and says how that went.
  Future<void> _fetchOptions() async {
    final api = ref.read(apiProvider);
    final source = _source;
    if (api == null || source == null || _testing) return;
    final l = AppLocalizations.of(context);
    final signature = _signature(source);
    setState(() {
      _testing = true;
      _testError = null;
    });
    try {
      final options = await api.admin.fulfilment.options(
        id: widget.existing?.id,
        source: source.id,
        slug: _slug.trim(),
        settings: sendValues(_connectionFields(source), _settings),
        apiKey: _apiKey.trim().isEmpty ? null : _apiKey.trim(),
      );
      if (!mounted) return;
      final saved = widget.existing;
      final base = saved != null && saved.source == source.id
          ? saved.options
          : options.values;
      final shown = formValues(options.fields, base);
      for (final field in options.fields) {
        if (_optionValues.containsKey(field.key)) {
          shown[field.key] = _optionValues[field.key];
        }
      }
      setState(() {
        _testing = false;
        _optionFields = options.fields;
        _optionValues = shown;
        _optionsLoaded = true;
        _tested = signature;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _testError = describeFailure(l, error);
        _tested = null;
        _optionsLoaded = widget.existing != null;
      });
    }
  }

  void _pickSource(String id) {
    final source = _sourceOf(id);
    setState(() {
      _sourceId = id;
      _settings = formValues(
        source?.fields ?? const [],
        source?.values ?? const {},
      );
      _optionFields = const [];
      _optionValues = const {};
      _optionsLoaded = false;
      _testing = false;
      _testError = null;
      _tested = null;
      _defaultFor = _freeKinds(source);
    });
    if (source != null && source.fields.isEmpty) {
      unawaited(_fetchOptions());
    }
  }

  void _setValue(DescribedField field, Object? next, {required bool option}) {
    setState(() {
      final values = {
        for (final MapEntry(:key, :value)
            in (option ? _optionValues : _settings).entries)
          key: value,
        field.key: next,
      };
      if (option) {
        _optionValues = values;
      } else {
        _settings = values;
      }
    });
  }

  String? _error(String field) {
    for (final MapEntry(:key, :value) in _errors.entries) {
      if (key == field || key.startsWith('$field.')) return value;
    }
    return null;
  }

  bool get _slugInvalid => _slug.isNotEmpty && !_slugPattern.hasMatch(_slug);

  bool get _canSave =>
      _name.trim().isNotEmpty &&
      _slug.isNotEmpty &&
      !_slugInvalid &&
      (widget.existing != null ||
          (_source?.fields.isEmpty ?? true) ||
          _optionsLoaded);

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    final source = _source;
    if (api == null || source == null || _saving || !_canSave) return;
    final l = AppLocalizations.of(context);
    final missing = missingField(source.fields, _settings);
    if (missing != null) {
      setState(
        () => _failure = l.webConnectionsDialogRequired(
          missing.label.serverWords(l),
        ),
      );
      return;
    }
    final missingOption = missingField(_optionFields, _optionValues);
    if (missingOption != null) {
      setState(
        () => _failure = l.webConnectionsDialogRequired(
          missingOption.label.serverWords(l),
        ),
      );
      return;
    }
    final typed = _apiKey.trim();
    final apiKey = !source.apiKey
        ? null
        : typed.isNotEmpty
        ? Explicit<String>(typed)
        : _dropKey
        ? const Explicit<String>(null)
        : null;
    final settings = sendValues(source.fields, _settings);
    final options = _optionFields.isEmpty
        ? (widget.existing?.options ?? const <String, Object?>{})
        : sendValues(_optionFields, _optionValues);
    final defaultFor = [
      for (final kind in _defaultFor)
        if (source.kinds.contains(kind)) kind,
    ];
    final folders = {
      for (final MapEntry(:key, :value) in _folderLibraries.entries)
        if (value.isNotEmpty) key: value,
    };
    setState(() {
      _saving = true;
      _failure = null;
      _errors = const {};
    });
    try {
      final existing = widget.existing;
      if (existing == null) {
        await api.admin.fulfilment.create(
          FulfilmentConnectionInput(
            name: _name.trim(),
            slug: _slug.trim(),
            source: source.id,
            settings: settings,
            options: options,
            defaultFor: defaultFor,
            folderLibraries: folders,
            apiKey: apiKey,
          ),
        );
      } else {
        await api.admin.fulfilment.update(
          existing.id,
          name: _name.trim(),
          slug: _slug.trim(),
          source: source.id,
          settings: settings,
          options: options,
          defaultFor: defaultFor,
          folderLibraries: folders,
          apiKey: apiKey,
        );
      }
      ref.invalidate(adminConnectionsProvider);
      if (mounted) context.pop();
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _saving = false;
        _errors = errors;
        _failure = _shownAtField(errors) ? null : describeFailure(l, error);
      });
    }
  }

  bool _shownAtField(Map<String, String> errors) =>
      errors.keys.any(const {'name', 'slug', 'apiKey'}.contains);

  String _sectionTitle(AppLocalizations l, String section) => switch (section) {
    FieldSection.defaults => l.webConnectionsSectionDefaults,
    FieldSection.anime => l.webConnectionsSectionAnime,
    FieldSection.behaviour => l.webConnectionsSectionBehaviour,
    _ => section,
  };

  String _defaultTitle(AppLocalizations l, String kind) => switch (kind) {
    TitleKind.movie => l.webConnectionsDialogDefaultMovie,
    TitleKind.show => l.webConnectionsDialogDefaultShow,
    _ => kind,
  };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final source = _source;
    if (source == null) {
      return AdminPage(
        title: widget.title,
        child: Center(child: Note(l.webConnectionsEmptyDescription)),
      );
    }
    final connectionFields = _connectionFields(source);
    final ready = source.fields.isEmpty || _optionsLoaded;
    final optionSections = <Widget>[];
    for (final section in const [
      FieldSection.defaults,
      FieldSection.anime,
      FieldSection.behaviour,
    ]) {
      final described = [
        for (final field in source.fields)
          if (field.section == section) field,
      ];
      final options = [
        for (final field in _optionFields)
          if (field.section == section) field,
      ];
      if (described.isEmpty && options.isEmpty) continue;
      optionSections.add(
        SettingsSection(
          title: _sectionTitle(l, section),
          child: Panel(
            rows: [
              for (final field in described) _fieldRow(field, option: false),
              for (final field in options) _fieldRow(field, option: true),
            ],
          ),
        ),
      );
    }
    return AdminPage(
      title: widget.title,
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: 12),
          child: MatineeButton(
            size: ButtonSize.sm,
            onPressed: _saving || !_canSave ? null : () => unawaited(_save()),
            child: _saving
                ? const Spinner(size: 14)
                : Text(
                    widget.existing == null
                        ? l.webConnectionsDialogCreate
                        : l.webConnectionsDialogSave,
                  ),
          ),
        ),
      ],
      child: AdminSections(
        sections: [
          if (_failure case final failure?) Note(failure, danger: true),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Panel(
                rows: [
                  if (widget.existing == null)
                    PickerRow<String>(
                      title: l.webConnectionsDialogSource,
                      options: [
                        for (final each in widget.sources)
                          (each.id, each.name.serverWords(l)),
                      ],
                      current: _sourceId,
                      onPicked: _pickSource,
                    )
                  else
                    ValueRow(
                      title: l.webConnectionsDialogSource,
                      value: source.name.serverWords(l),
                    ),
                  TextRow(
                    label: l.webConnectionsDialogName,
                    value: _name,
                    placeholder: l.webConnectionsDialogNamePlaceholder,
                    error: _error('name'),
                    onChanged: (value) => setState(() {
                      _name = value;
                      if (!_slugEdited) _slug = connectionSlug(value);
                    }),
                  ),
                  TextRow(
                    label: l.webConnectionsDialogSlug,
                    value: _slug,
                    error:
                        _error('slug') ??
                        (_slugInvalid
                            ? l.webConnectionsDialogSlugInvalid
                            : null),
                    hint: source.apiKey
                        ? l.webConnectionsDialogSlugHint(_variable())
                        : l.webConnectionsDialogSlugHintNoKey,
                    onChanged: (value) => setState(() {
                      _slug = value.toUpperCase();
                      _slugEdited = true;
                    }),
                  ),
                  for (final field in connectionFields)
                    _fieldRow(field, option: false),
                  if (source.apiKey) _keyRow(l),
                  if (connectionFields.isNotEmpty) _testRow(l),
                  for (final kind in source.kinds)
                    SwitchRow(
                      title: _defaultTitle(l, kind),
                      checked: _defaultFor.contains(kind),
                      onChanged: (checked) => setState(() {
                        _defaultFor = [
                          for (final each in _defaultFor)
                            if (each != kind) each,
                          if (checked) kind,
                        ];
                      }),
                    ),
                ],
              ),
              if (!ready) Note(l.webConnectionsDialogTestFirst),
            ],
          ),
          ...optionSections,
        ],
      ),
    );
  }

  /// The environment variable a connection's key can come from.
  String _variable() =>
      'MATINEE_CONNECTION_${_slug.isEmpty ? '…' : _slug}_API_KEY';

  Widget _fieldRow(DescribedField field, {required bool option}) {
    final value = (option ? _optionValues : _settings)[field.key];
    final folder = field.folder;
    final text = textOf(value);
    return DescribedFieldRow(
      key: ValueKey('$_sourceId-${field.key}'),
      field: field,
      value: value,
      unset: field.section == FieldSection.anime
          ? AppLocalizations.of(context).webConnectionsFieldSameAsAbove
          : null,
      onChanged: (next) => _setValue(field, next, option: option),
      footer: folder != null && text.isNotEmpty
          ? LandsIn(
              kind: folder,
              folder: text,
              picked: _folderLibraries[text],
              onPick: (library) => setState(
                () => _folderLibraries = {..._folderLibraries, text: library},
              ),
            )
          : null,
    );
  }

  /// The connection's key, as the single sign-on secret works: the API says
  /// only whether one is saved or comes from the environment.
  Widget _keyRow(AppLocalizations l) {
    final colors = MatineeTheme.of(context);
    final existing = widget.existing;
    final saved = existing?.apiKey.source;
    final environment =
        (existing?.apiKey.environment ?? false) && _slug == existing?.slug;
    final savedHere = saved == 'saved' && !_dropKey;
    final fromEnvironment = saved == 'environment' || (_dropKey && environment);
    final placeholder = savedHere
        ? l.webConnectionsDialogKeySaved
        : fromEnvironment
        ? l.webConnectionsDialogKeyFromEnvironment(_variable())
        : l.webConnectionsDialogKeyNone;
    final removable = saved == 'saved' && _apiKey.trim().isEmpty;
    final removeLabel = _dropKey
        ? l.webConnectionsDialogKeyKeep
        : environment
        ? l.webConnectionsDialogKeyUseEnvironment
        : l.webConnectionsDialogKeyRemove;
    return TextRow(
      label: l.webConnectionsDialogKey,
      value: _apiKey,
      secret: true,
      placeholder: placeholder,
      error: _error('apiKey'),
      hint: _dropKey
          ? (environment
                ? l.webConnectionsDialogKeyEnvironmentApplies(_variable())
                : l.webConnectionsDialogKeyRemoved)
          : null,
      onChanged: (value) => setState(() {
        _apiKey = value;
        if (value.isNotEmpty) _dropKey = false;
      }),
      trailing: removable
          ? RoundIconButton(
              icon: _dropKey ? Lucide.rotateCcw : Lucide.trash,
              label: removeLabel,
              size: 36,
              iconSize: 18,
              background: const Color(0x00000000),
              color: _dropKey ? null : colors.danger,
              onPressed: () => setState(() => _dropKey = !_dropKey),
            )
          : null,
    );
  }

  /// Asks the source for its choices, and says how that went.
  Widget _testRow(AppLocalizations l) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              MatineeButton(
                look: ButtonLook.outline,
                onPressed: _testing || _slug.isEmpty
                    ? null
                    : () => unawaited(_fetchOptions()),
                leading: _testing ? null : Lucide.refreshCw,
                child: _testing
                    ? const Spinner(size: 14)
                    : Text(l.webConnectionsDialogTest),
              ),
              if (_connected) ...[
                KitIcon(Lucide.circleCheck, size: 16, color: colors.success),
                Text(
                  l.webConnectionsConnected,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              ],
            ],
          ),
          if (_testError case final error? when !_testing)
            Note(error, danger: true),
        ],
      ),
    );
  }
}
