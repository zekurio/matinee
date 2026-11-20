import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../core/toasts.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../query/server_data.dart';
import '../router.dart';
import 'actions.dart';

/// An admin's metadata items in a card's or a page's menu, after the rest,
/// as the Kotlin app's `MetadataItems`: fix match and refresh for a movie or
/// show that's matchable and whose library has a provider with its API
/// key, and the image editor. Fix match and refresh show once the provider
/// is known, which the first menu asks for.

/// Whether the account signed in may change a title's metadata: the
/// server lets admins only, and needs to be reachable.
bool mayEditMetadata(AuthState auth) => auth is SignedIn && auth.user.isAdmin;

/// The metadata provider of a library, or null when it has none. For
/// admins only; the server turns anyone else away.
final libraryMetadataProvider = serverQueryFamily<MetadataProvider?, String>((
  api,
  String libraryId,
) async {
  final libraries = await api.libraries.list();
  final id = libraries
      .where((library) => library.id == libraryId)
      .firstOrNull
      ?.metadataProvider;
  if (id == null) return null;
  final providers = await api.metadata.providers();
  return providers.where((provider) => provider.id == id).firstOrNull;
});

class MetadataItems extends ConsumerWidget {
  const MetadataItems({
    super.key,
    required this.title,
    required this.images,
    required this.matchable,
    required this.onPicked,
  });

  final TitleSummary title;

  /// What the image editor opens on, or null for none.
  final ImageTarget? images;
  final bool matchable;

  /// Closes the menu, then runs what was picked with the screen's context.
  final void Function(Future<void> Function(BuildContext context) act) onPicked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!mayEditMetadata(ref.watch(authStateProvider))) {
      return const SizedBox.shrink();
    }
    final l = AppLocalizations.of(context);
    final found = matchable
        ? ref.watch(libraryMetadataProvider(title.libraryId)).value
        : null;
    final provider = found != null && found.configured ? found : null;
    final images = this.images;
    if (provider == null && images == null) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SheetSeparator(),
        if (provider != null) ...[
          SheetItem(
            icon: Lucide.search,
            label: l.titleMenuFixMatch,
            onPressed: () => onPicked(
              (context) async =>
                  unawaited(context.push(Routes.identify(title.id))),
            ),
          ),
          SheetItem(
            icon: Lucide.refreshCw,
            label: l.titleMenuRefresh,
            onPressed: () => onPicked((context) => _refresh(context, title)),
          ),
        ],
        if (images != null)
          SheetItem(
            icon: Lucide.image,
            label: l.titleMenuEditImages,
            onPressed: () => onPicked(
              (context) async => unawaited(
                context.push(
                  Routes.images(
                    images.titleId,
                    season: images.season,
                    episode: images.episode,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Fetches [title]'s metadata again, saying so when it's done.
Future<void> _refresh(BuildContext context, TitleSummary title) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final l = AppLocalizations.of(context);
  final done = await sendChange(
    container,
    l,
    l.titleRefreshError,
    (api) => api.titles.refresh(title.id),
  );
  if (done) {
    unawaited(
      container
          .read(toastProvider)
          .show(l.titleRefreshDone(title.name), kind: ToastKind.success),
    );
  }
}
