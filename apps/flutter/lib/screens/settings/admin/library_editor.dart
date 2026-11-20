import 'dart:async';

import 'package:flutter/services.dart' show TextInputAction, TextInputType;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/field_errors.dart';
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

/// The library's name, kind, metadata, and folders, as a page of its own,
/// the Kotlin app's `LibraryEditorScreen`: a new library, or with [id] one
/// to change. Folders are picked on the next page, which hands the folder
/// back; the draft stays here meanwhile. The server checks what's saved
/// and its word shows at the field it's about.
class LibraryEditorScreen extends ConsumerWidget {
  const LibraryEditorScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final libraries = ref.watch(adminLibrariesProvider);
    final providers = ref.watch(metadataProvidersProvider);
    final title = id == null
        ? l.webLibrariesDialogAddTitle
        : l.webLibrariesDialogEditTitle;
    final list = libraries.value;
    Library? existing;
    for (final library in list ?? const <Library>[]) {
      if (library.id == id) existing = library;
    }
    // The draft starts from the library and the providers, so it waits for
    // both, and a library that's gone is an error.
    final failed = libraries.error ?? (id == null ? null : providers.error);
    if (id != null && existing == null || providers.isLoading) {
      return AdminGate(
        child: AdminPage(
          title: title,
          child: failed != null || (list != null && existing == null)
              ? Center(
                  child: FailureState(
                    title: l.adminLoadFailed,
                    error: failed ?? const ApiException(status: 404),
                    onRetry: () {
                      ref
                        ..invalidate(adminLibrariesProvider)
                        ..invalidate(metadataProvidersProvider);
                    },
                  ),
                )
              : LoadingState(label: l.adminLoading),
        ),
      );
    }
    return AdminGate(
      child: _LibraryEditor(
        title: title,
        existing: existing,
        providers: providers.value ?? const [],
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
    required this.knownPath,
  });

  final String title;
  final Library? existing;
  final List<MetadataProvider> providers;
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

  /// The tag the provider is asked in; a new library starts in the
  /// device's language, which only the device knows.
  late String _language =
      widget.existing?.metadataLanguage ??
      View.of(context).platformDispatcher.locale.toLanguageTag();
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
      final errors = fieldErrors(error);
      setState(() {
        _saving = false;
        _errors = errors;
        // What no field shows, the page does.
        _failure = _shownAtField(errors) ? null : describeFailure(l, error);
      });
    }
  }

  bool _shownAtField(Map<String, String> errors) =>
      errors.keys.any(const {'name', 'paths', 'metadataLanguage'}.contains);

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
                    TextRow(
                      label: l.webLibrariesDialogLanguage,
                      value: _language,
                      placeholder: 'en-US',
                      error: _error('metadataLanguage'),
                      onChanged: (value) => setState(() => _language = value),
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

/// The server's folders, one level at a time, as a page over the editor,
/// the Kotlin app's `FolderPickerScreen`: it opens at the request's start,
/// with the folders the library has marked. A row opens its folder or
/// adds it at once; the bar at the bottom adds the one that's open.
/// Adding goes back to the editor with the folder.
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
    return AdminGate(
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
              child: _PathField(
                key: ValueKey(shown),
                path: shown,
                onOpen: _open,
              ),
            ),
            Expanded(
              child: switch ((current, listing.error)) {
                (final DirectoryListing folder, _) => ListView(
                  children: [
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
                        addLabel: l.webLibrariesBrowserAddNamed(directory.name),
                        onOpen: () => _open(directory.path),
                        onAdd: added.contains(directory.path)
                            ? null
                            : () => _add(directory.path),
                      ),
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 10,
                    children: [
                      Note(
                        current == null || root
                            ? l.webLibrariesBrowserOpenRoot
                            : already
                            ? l.webLibrariesBrowserAlreadyAdded(current.path)
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
          ],
        ),
      ),
    );
  }
}

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
