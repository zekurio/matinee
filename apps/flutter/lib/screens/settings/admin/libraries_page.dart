import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// How often the list asks again while a scan or a fetch runs.
const _busyPoll = Duration(seconds: 2);

/// The libraries, as the web's libraries panel: each with its titles and what
/// the server is doing to it. A tap opens its actions: scan it, fetch its
/// metadata again, edit it, or remove it, which asks first. Add library opens
/// the same editor empty. Each action shows only for an account whose
/// permissions allow it, as on the web. While a scan or a fetch runs, the page
/// asks again every two seconds, and back from the editor it shows what was
/// saved.
class LibrariesPage extends ConsumerStatefulWidget {
  const LibrariesPage({super.key});

  @override
  ConsumerState<LibrariesPage> createState() => _LibrariesPageState();
}

class _LibrariesPageState extends ConsumerState<LibrariesPage> {
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Asks again in a moment while [busy], once per answer.
  void _keepUp(bool busy) {
    if (!busy || _poll != null) return;
    _poll = Timer(_busyPoll, () {
      _poll = null;
      if (mounted) ref.invalidate(adminLibrariesProvider);
    });
  }

  Future<void> _act(
    Library library,
    ({bool scan, bool edit, bool remove}) may,
  ) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    await pickFrom(
      context,
      title: library.name,
      description: library.paths.join(', '),
      items: [
        if (may.scan)
          (
            Lucide.refreshCw,
            l.webLibrariesScanNow,
            () => unawaited(_run(() => api.libraries.scan(library.id))),
            false,
          ),
        if (may.scan && library.metadataProvider != null)
          (
            Lucide.image,
            l.webLibrariesRefreshMetadata,
            () => unawaited(
              _run(() async {
                await api.libraries.refreshMetadata(library.id);
                unawaited(ref.read(toastProvider).show(l.webLibrariesFetching));
              }, failure: l.webLibrariesFetchFailed),
            ),
            false,
          ),
        if (may.edit)
          (
            Lucide.settings,
            l.webLibrariesEdit,
            () => unawaited(_edit(library.id)),
            false,
          ),
        if (may.remove)
          (
            Lucide.trash,
            l.webLibrariesRemove,
            () => unawaited(_remove(library)),
            true,
          ),
      ],
    );
  }

  Future<void> _run(Future<void> Function() action, {String? failure}) async {
    final l = AppLocalizations.of(context);
    await runAction(
      ref,
      l,
      action,
      failure: failure ?? l.webLibrariesScanFailed,
    );
    if (mounted) ref.invalidate(adminLibrariesProvider);
  }

  Future<void> _edit([String? id]) async {
    await context.push<void>(Routes.libraryEditor(id));
    if (mounted) ref.invalidate(adminLibrariesProvider);
  }

  Future<void> _remove(Library library) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final yes = await ConfirmDialog.show(
      context,
      title: l.webLibrariesRemoveTitle(library.name),
      description: l.webLibrariesRemoveDescription,
      confirmLabel: l.webLibrariesRemoveConfirm,
      cancelLabel: l.webLibrariesRemoveCancel,
      destructive: true,
    );
    if (!yes || api == null || !mounted) return;
    final removed = await runAction(
      ref,
      l,
      () => api.libraries.remove(library.id),
      failure: l.webLibrariesRemoveFailed(library.name),
    );
    if (removed && mounted) {
      unawaited(
        ref
            .read(toastProvider)
            .show(l.webLibrariesRemoved(library.name), kind: ToastKind.success),
      );
    }
    if (mounted) ref.invalidate(adminLibrariesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final libraries = ref.watch(adminLibrariesProvider);
    final providers = ref.watch(metadataProvidersProvider).value ?? const [];
    _keepUp(libraries.value?.any(libraryBusy) ?? false);
    // What the account may do, as the web's panel reads it. Adding and
    // editing browse the server's folders.
    final add =
        ref.watch(canProvider(Permission.libraryCreate)) &&
        ref.watch(canProvider(Permission.folderRead));
    final may = (
      scan: ref.watch(canProvider(Permission.libraryScan)),
      edit:
          ref.watch(canProvider(Permission.libraryUpdate)) &&
          ref.watch(canProvider(Permission.folderRead)),
      remove: ref.watch(canProvider(Permission.libraryDelete)),
    );
    final acts = may.scan || may.edit || may.remove;
    return AdminPage(
      title: l.settingsAdminLibraries,
      child: adminBody(
        context,
        libraries,
        onRetry: () => ref.invalidate(adminLibrariesProvider),
        loaded: (list) => AdminSections(
          sections: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                if (list.isEmpty)
                  _Empty(
                    title: l.webLibrariesEmptyTitle,
                    message: l.webLibrariesEmptyDescription,
                  )
                else
                  Panel(
                    rows: [
                      for (final library in list)
                        LibraryRow(
                          library: library,
                          provider: _providerName(providers, library),
                          onPressed: acts
                              ? () => unawaited(_act(library, may))
                              : null,
                        ),
                    ],
                  ),
                if (add)
                  MatineeButton(
                    leading: Lucide.folderPlus,
                    onPressed: () => unawaited(_edit()),
                    child: Text(l.webLibrariesAdd),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String? _providerName(List<MetadataProvider> providers, Library library) {
  for (final provider in providers) {
    if (provider.id == library.metadataProvider) return provider.name;
  }
  return null;
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 4,
      children: [
        Text(
          title,
          style: KitText.lg.style(
            color: colors.foreground,
            weight: FontWeight.w500,
          ),
        ),
        Note(message),
      ],
    );
  }
}

/// A library: its kind, name, and titles and provider, or what the server
/// is doing to it, with a spinner while it does.
class LibraryRow extends StatelessWidget {
  const LibraryRow({
    super.key,
    required this.library,
    required this.provider,
    required this.onPressed,
  });

  final Library library;
  final String? provider;

  /// Null for an account that may do nothing to it.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final provider = this.provider;
    final status = library.scanning
        ? l.webLibrariesScanning
        : library.refreshing
        ? (provider == null
              ? l.webLibrariesFetchingFromProvider
              : l.webLibrariesFetchingFrom(provider))
        : [l.browseTitleCount(library.titleCount), ?provider].join(' · ');
    return PressIndication(
      onPressed: onPressed,
      label: l.webLibrariesActions(library.name),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              spacing: 14,
              children: [
                KitIcon(
                  library.kind == LibraryKind.shows ? Lucide.tv : Lucide.film,
                  size: 20,
                  color: colors.mutedForeground,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        library.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.base.style(color: colors.foreground),
                      ),
                      Text(
                        status,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.sm.style(color: colors.mutedForeground),
                      ),
                    ],
                  ),
                ),
                if (libraryBusy(library))
                  Spinner(size: 18, color: colors.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
