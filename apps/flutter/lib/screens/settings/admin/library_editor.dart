import 'dart:async';

import 'package:flutter/services.dart' show TextInputAction, TextInputType;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/display_names.dart';
import '../../../core/failure_text.dart';
import '../../../core/field_errors.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../query/failure_view.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// What the folder picker opens at and which folders the library has,
/// handed to it as the route's extra.
final class FolderPickerRequest {
  const FolderPickerRequest({this.start, this.added = const []});

  final String? start;
  final List<String> added;
}

/// The folder above [path], or `/` at the top.
String parentFolder(String path) {
  final trimmed = path.endsWith('/') && path.length > 1
      ? path.substring(0, path.length - 1)
      : path;
  final cut = trimmed.lastIndexOf('/');
  return cut <= 0 ? '/' : trimmed.substring(0, cut);
}

/// Where a new library's language starts: the server's choice in [locale],
/// else its first.
String startLanguage(List<MetadataLanguageChoice> choices, Locale locale) {
  final exact = choices.where((it) => it.nameTag == locale.toLanguageTag());
  final same = choices.where(
    (it) => it.code.split('-').first == locale.languageCode,
  );
  return (exact.firstOrNull ?? same.firstOrNull ?? choices.firstOrNull)?.code ??
      locale.toLanguageTag();
}

/// The library's name, kind, metadata, and folders, as a page of its own: a new
/// library, or with [id] one to change. Folders are picked on the next page,
/// which hands the folder back; the draft stays here meanwhile. The server
/// checks what's saved and its word shows at the field it's about.
class LibraryEditorScreen extends ConsumerWidget {
  const LibraryEditorScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final libraries = ref.watch(adminLibrariesProvider);
    final providers = ref.watch(metadataProvidersProvider);
    final languages = ref.watch(metadataLanguagesProvider);
    final title = id == null
        ? l.webLibrariesDialogAddTitle
        : l.webLibrariesDialogEditTitle;
    final list = libraries.value;
    Library? existing;
    for (final library in list ?? const <Library>[]) {
      if (library.id == id) existing = library;
    }
    // The draft starts from the library, the providers, and the languages,
    // so it waits for them, and a library that's gone is an error.
    final failed =
        libraries.error ??
        languages.error ??
        (id == null ? null : providers.error);
    // The form browses the server's folders to pick from.
    bool allows(User user) =>
        can(
          user,
          id == null ? Permission.libraryCreate : Permission.libraryUpdate,
        ) &&
        can(user, Permission.folderRead);
    if (id != null && existing == null ||
        providers.isLoading ||
        !languages.hasValue) {
      return AdminGate(
        allows: allows,
        child: AdminPage(
          title: title,
          child:
              failed != null || (id != null && list != null && existing == null)
              ? Center(
                  child: FailureState(
                    title: l.adminLoadFailed,
                    error: failed ?? const ApiException(status: 404),
                    onRetry: () {
                      ref
                        ..invalidate(adminLibrariesProvider)
                        ..invalidate(metadataProvidersProvider)
                        ..invalidate(metadataLanguagesProvider);
                    },
                  ),
                )
              : LoadingState(label: l.adminLoading),
        ),
      );
    }
    return AdminGate(
      allows: allows,
      child: _LibraryEditor(
        title: title,
        existing: existing,
        providers: providers.value ?? const [],
        languages: languages.value ?? const [],
        knownPath: list?.firstOrNull?.paths.firstOrNull,
      ),
    );
  }
}

class _LibraryEditor extends ConsumerStatefulWidget {
  const _LibraryEditor({
    required this.title,
    required this.existing,
    required this.providers,
    required this.languages,
    required this.knownPath,
  });

  final String title;
  final Library? existing;
  final List<MetadataProvider> providers;
  final List<MetadataLanguageChoice> languages;
  final String? knownPath;

  @override
  ConsumerState<_LibraryEditor> createState() => _LibraryEditorState();
}

class _LibraryEditorState extends ConsumerState<_LibraryEditor> {
  late String _name = widget.existing?.name ?? '';
  late String _kind = widget.existing?.kind ?? LibraryKind.movies;
  late String? _provider =
      widget.existing?.metadataProvider ??
      widget.providers.where((it) => it.configured).firstOrNull?.id;

  /// The tag the provider is asked in; a new library starts on the
  /// server's choice in the app's language.
  late String _language =
      widget.existing?.metadataLanguage ??
      startLanguage(widget.languages, Localizations.localeOf(context));
  late List<String> _paths = [...?widget.existing?.paths];
  bool _saving = false;
  Map<String, String> _errors = const {};
  String? _failure;

  Future<void> _pickFolder() async {
    // Media usually sits beside the folder added last, or the ones other
    // libraries use.
    final beside =
        _paths.lastOrNull ??
        widget.existing?.paths.firstOrNull ??
        widget.knownPath;
    final folder = await context.push<String>(
      Routes.folderPicker,
      extra: FolderPickerRequest(
        start: beside == null ? null : parentFolder(beside),
        added: _paths,
      ),
    );
    if (folder == null || !mounted || _paths.contains(folder)) return;
    setState(() => _paths = [..._paths, folder]);
  }

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    if (api == null || _saving) return;
    final l = AppLocalizations.of(context);
    setState(() {
      _saving = true;
      _errors = const {};
      _failure = null;
    });
    final existing = widget.existing;
    try {
      if (existing == null) {
        await api.libraries.create(
          LibraryInput(
            name: _name,
            kind: _kind,
            paths: _paths,
            metadataProvider: _provider,
            metadataLanguage: _language,
          ),
        );
      } else {
        await api.libraries.update(
          existing.id,
          name: _name,
          kind: _kind,
          paths: _paths,
          metadataProvider: _provider,
          metadataLanguage: _language,
        );
      }
      ref.invalidate(adminLibrariesProvider);
      if (mounted) context.pop();
    } on Object catch (error) {
      if (!mounted) return;
      final errors = fieldErrors(l, error);
      setState(() {
        _saving = false;
        _errors = errors;
        // What no field shows, the page does.
        _failure = _shownAtField(errors) ? null : describeFailure(l, error);
      });
    }
  }

  bool _shownAtField(Map<String, String> errors) =>
      errors.keys.any(const {'name', 'paths'}.contains);

  String? _error(String field) {
    for (final MapEntry(:key, :value) in _errors.entries) {
      if (key == field || key.startsWith('$field.')) return value;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final providers = widget.providers;
    // A library saved with a language the server no longer offers keeps it.
    final choices = [
      for (final choice in widget.languages) (choice.code, choice.nameTag),
      if (!widget.languages.any((it) => it.code == _language))
        (_language, _language),
    ];
    final names = DisplayNames.watch(ref, DisplayNameKind.language, [
      for (final (_, tag) in choices) tag,
    ], l.localeName);
    final failure = _failure;
    final foldersError = _error('paths');
    return AdminPage(
      title: widget.title,
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: 12),
          child: MatineeButton(
            size: ButtonSize.sm,
            onPressed: _saving ? null : () => unawaited(_save()),
            child: Text(
              widget.existing == null
                  ? l.webLibrariesBrowserAdd
                  : l.webLibrariesDialogSave,
            ),
          ),
        ),
      ],
      child: AdminSections(
        sections: [
          if (failure != null) Note(failure, danger: true),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Panel(
                rows: [
                  TextRow(
                    label: l.webLibrariesDialogName,
                    value: _name,
                    placeholder: l.webLibrariesDialogNamePlaceholder,
                    error: _error('name'),
                    onChanged: (value) => setState(() => _name = value),
                  ),
                  PickerRow<String>(
                    title: l.webLibrariesDialogType,
                    options: [
                      for (final kind in LibraryKind.all)
                        (
                          kind,
                          kind == LibraryKind.shows
                              ? l.webLibrariesDialogKindShows
                              : l.webLibrariesDialogKindMovies,
                        ),
                    ],
                    current: _kind,
                    onPicked: (kind) => setState(() => _kind = kind),
                  ),
                  PickerRow<String?>(
                    title: l.webLibrariesDialogMetadata,
                    options: [
                      (null, l.webLibrariesDialogNoProvider),
                      for (final provider in providers)
                        (
                          provider.id,
                          provider.configured
                              ? provider.name
                              : '${provider.name} · '
                                    '${l.webLibrariesDialogNeedsKey}',
                        ),
                    ],
                    current: _provider,
                    onPicked: (choice) {
                      // A provider without its key can't fetch anything.
                      final usable =
                          choice == null ||
                          providers.any(
                            (it) => it.id == choice && it.configured,
                          );
                      if (usable) setState(() => _provider = choice);
                    },
                  ),
                  if (_provider != null)
                    PickerRow<String>(
                      title: l.webLibrariesDialogLanguage,
                      options: [
                        for (final (code, tag) in choices)
                          (code, names.nameOf(tag)),
                      ],
                      current: _language,
                      onPicked: (code) => setState(() => _language = code),
                    ),
                ],
              ),
              if (_provider == null) Note(l.webLibrariesDialogNoProviderHint),
            ],
          ),
          SettingsSection(
            title: l.webLibrariesDialogFolders,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    for (final path in _paths)
                      Padding(
                        padding: const EdgeInsetsDirectional.fromSTEB(
                          16,
                          2,
                          4,
                          2,
                        ),
                        child: Row(
                          spacing: 12,
                          children: [
                            KitIcon(
                              Lucide.server,
                              size: 18,
                              color: colors.mutedForeground,
                            ),
                            Expanded(
                              child: Text(
                                path,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: KitText.sm.style(
                                  color: colors.foreground,
                                ),
                              ),
                            ),
                            RoundIconButton(
                              icon: Lucide.x,
                              label: l.webLibrariesDialogRemoveFolder(path),
                              background: const Color(0x00000000),
                              onPressed: () => setState(
                                () => _paths = [
                                  for (final kept in _paths)
                                    if (kept != path) kept,
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    PressIndication(
                      onPressed: () => unawaited(_pickFolder()),
                      label: l.webLibrariesDialogAddFolder,
                      builder: (context, state) => ColoredBox(
                        color: colors.foreground.withValues(
                          alpha: state == PressState.idle ? 0 : .06,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          child: Row(
                            spacing: 12,
                            children: [
                              KitIcon(
                                Lucide.folderPlus,
                                size: 18,
                                color: colors.accent,
                              ),
                              Text(
                                l.webLibrariesDialogAddFolder,
                                style: KitText.base.style(color: colors.accent),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (foldersError != null) Note(foldersError, danger: true),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The server's folders, one level at a time, as a page over the editor: it
/// opens at the request's start, with the folders the library has marked. A row
/// opens its folder or adds it at once; the bar at the bottom adds the one
/// that's open. Adding goes back to the editor with the folder.
class FolderPickerScreen extends ConsumerStatefulWidget {
  const FolderPickerScreen({super.key, required this.request});

  final FolderPickerRequest request;

  @override
  ConsumerState<FolderPickerScreen> createState() => _FolderPickerState();
}

class _FolderPickerState extends ConsumerState<FolderPickerScreen> {
  late String? _path = widget.request.start;

  void _open(String path) => setState(() => _path = path);

  void _add(String folder) => context.pop(folder);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final listing = ref.watch(folderProvider(_path));
    final current = listing.value;
    final added = widget.request.added;
    final root = current?.parent == null;
    final already = current != null && added.contains(current.path);
    final shown = current?.path ?? _path ?? '/';
    // System Back goes up a folder until the top, then leaves; the bar's
    // Back always leaves.
    final up = current?.parent;
    return AdminGate(
      allows: (user) => can(user, Permission.folderRead),
      child: PopScope(
        canPop: up == null,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && up != null) _open(up);
        },
        child: AdminPage(
          title: l.webLibrariesDialogBrowse,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  CardMetrics.gutter,
                  0,
                  CardMetrics.gutter,
                  8,
                ),
                // Keyed by the folder, so opening another one shows its path.
                child: _capped(
                  _PathField(key: ValueKey(shown), path: shown, onOpen: _open),
                ),
              ),
              Expanded(
                child: switch ((current, listing.error)) {
                  (final DirectoryListing folder, _) => ListView(
                    children: [
                      for (final row in [
                        if (folder.parent case final parent?)
                          _FolderRow(
                            name: '..',
                            label: l.webLibrariesBrowserParent,
                            up: true,
                            onOpen: () => _open(parent),
                          ),
                        if (folder.directories.isEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: CardMetrics.gutter,
                              vertical: 16,
                            ),
                            child: Note(l.webLibrariesBrowserEmpty),
                          ),
                        for (final directory in folder.directories)
                          _FolderRow(
                            name: directory.name,
                            label: l.webLibrariesBrowserOpen(directory.name),
                            addLabel: l.webLibrariesBrowserAddNamed(
                              directory.name,
                            ),
                            onOpen: () => _open(directory.path),
                            onAdd: added.contains(directory.path)
                                ? null
                                : () => _add(directory.path),
                          ),
                      ])
                        _capped(row),
                    ],
                  ),
                  (_, final Object error) => Center(
                    child: FailureState(
                      title: l.foldersLoadFailed,
                      error: error,
                      onRetry: () => ref.invalidate(folderProvider(_path)),
                    ),
                  ),
                  _ => LoadingState(label: l.adminLoading),
                },
              ),
              // Always there, so the list above doesn't jump when the first
              // folder loads.
              DecoratedBox(
                decoration: BoxDecoration(
                  color: colors.surface,
                  border: Border(top: BorderSide(color: colors.border)),
                ),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: CardMetrics.gutter,
                      vertical: 12,
                    ),
                    child: _capped(
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 10,
                        children: [
                          Note(
                            current == null || root
                                ? l.webLibrariesBrowserOpenRoot
                                : already
                                ? l.webLibrariesBrowserAlreadyAdded(
                                    current.path,
                                  )
                                : l.webLibrariesBrowserAdds(current.path),
                          ),
                          MatineeButton(
                            onPressed: current != null && !root && !already
                                ? () => _add(current.path)
                                : null,
                            child: Text(
                              already
                                  ? l.webLibrariesBrowserAdded
                                  : current == null || root
                                  ? l.webLibrariesBrowserAdd
                                  : l.webLibrariesBrowserAddCurrent(
                                      _folderName(current.path),
                                    ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// [child] no wider than the other settings pages' panels, at the start,
/// so a tablet doesn't stretch the rows across the screen.
Widget _capped(Widget child) => Align(
  alignment: AlignmentDirectional.topStart,
  child: ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: settingsWidth),
    child: child,
  ),
);

/// The last part of [path], or the path itself at the top.
String _folderName(String path) {
  final parts = path.split('/').where((part) => part.isNotEmpty);
  return parts.isEmpty ? path : parts.last;
}

/// The open folder's path, which a path typed in and Go replace.
class _PathField extends StatefulWidget {
  const _PathField({super.key, required this.path, required this.onOpen});

  final String path;
  final ValueChanged<String> onOpen;

  @override
  State<_PathField> createState() => _PathFieldState();
}

class _PathFieldState extends State<_PathField> {
  late final _controller = TextEditingController(text: widget.path);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _typed => _controller.text.trim();

  bool get _canOpen => _typed.isNotEmpty && _typed != widget.path;

  void _go() {
    if (_canOpen) widget.onOpen(_typed);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return MatineeTextField(
      controller: _controller,
      placeholder: l.webLibrariesBrowserPath,
      keyboardType: TextInputType.url,
      textInputAction: TextInputAction.go,
      autocorrect: false,
      onChanged: (_) => setState(() {}),
      onSubmitted: (_) => _go(),
      trailing: RoundIconButton(
        icon: Lucide.chevronRight,
        label: l.webLibrariesBrowserGo,
        background: const Color(0x00000000),
        color: colors.mutedForeground,
        onPressed: _canOpen ? _go : null,
      ),
    );
  }
}

class _FolderRow extends StatelessWidget {
  const _FolderRow({
    required this.name,
    required this.label,
    required this.onOpen,
    this.addLabel,
    this.onAdd,
    this.up = false,
  });

  final String name;
  final String label;
  final String? addLabel;
  final VoidCallback onOpen;
  final VoidCallback? onAdd;
  final bool up;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final add = onAdd;
    return PressIndication(
      onPressed: onOpen,
      label: label,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: CardMetrics.gutter,
              vertical: 2,
            ),
            child: Row(
              children: [
                if (up) ...[
                  KitIcon(
                    Lucide.arrowLeft,
                    size: 16,
                    color: colors.mutedForeground,
                  ),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.base.style(color: colors.foreground),
                  ),
                ),
                if (add != null)
                  RoundIconButton(
                    icon: Lucide.folderPlus,
                    label: addLabel ?? name,
                    background: const Color(0x00000000),
                    color: colors.mutedForeground,
                    onPressed: add,
                  ),
                if (!up)
                  KitIcon(
                    Lucide.chevronRight,
                    size: 16,
                    color: colors.mutedForeground,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
