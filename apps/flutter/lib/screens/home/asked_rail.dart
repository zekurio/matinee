import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/layout.dart';
import '../../router.dart';
import 'home_data.dart';

/// Home's "My requests", as the Kotlin app's `HomeAskedRail`: what's on its
/// way and what came or was answered lately, each card following its
/// title's state live. Nothing when there's none, so Home stays about
/// what's here. The heading opens the whole list.
class AskedRail extends ConsumerWidget {
  const AskedRail({super.key, required this.items});

  final List<RequestItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final live =
        ref.watch(askedLiveProvider(FollowedTitles(items))).value ?? const {};
    final size = railCardSize(context, RailArt.poster);
    return Rail(
      // A new ask at the front starts the row there again.
      key: ValueKey(items.first.id),
      title: l.webAskMineTitle,
      onSeeAll: () => context.push(Routes.requests()),
      seeAllLabel: l.webAskMineSeeAll,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return AskedCard(item: item, live: live[refKey(item.title.ref)]);
      },
    );
  }
}

/// One title the viewer asked for, as its state stands: the poster with
/// its state's badge, opening the catalog page while it isn't here and
/// the library's page once it is. A show that's here and still waits for
/// a season shows that season's state.
class AskedCard extends StatelessWidget {
  const AskedCard({super.key, required this.item, this.live});

  final RequestItem item;
  final RequestsLiveEvent? live;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = item.title;
    final availability = live?.availability ?? item.availability;
    final here = availability.state == 'here'
        ? availability.libraryTitleId
        : null;
    final waiting = item.season;
    final season = waiting == null
        ? null
        : live?.seasons.where((s) => s.number == waiting.number).firstOrNull ??
              waiting;
    final (state, progress) = here != null && season != null
        ? (season.state, season.progress)
        : (availability.state, availability.progress);
    final ref = title.ref;
    final poster = title.poster;
    return PosterCard(
      name: title.name,
      detail: title.year?.toString(),
      art: poster == null ? null : Picture([ArtSource(poster)]),
      badge: _badge(state, progress, l),
      onPressed: () => context.push(
        here != null
            ? Routes.title(here)
            : Routes.catalog(
                ref.kind,
                ref.provider,
                ref.providerId,
                library: item.library.id,
              ),
      ),
    );
  }

  static Widget? _badge(String state, double? progress, AppLocalizations l) =>
      switch (state) {
        'asked' => _Badge(icon: Lucide.clock, label: l.webCatalogStateAsked),
        'coming' => _Badge(progress: progress, label: l.webCatalogStateComing),
        'release' => _Badge(
          icon: Lucide.calendar,
          label: l.webCatalogStateNotOut,
        ),
        'unavailable' => _Badge(
          icon: Lucide.circleSlash,
          label: l.webCatalogStateUnavailable,
          muted: true,
        ),
        _ => null,
      };
}

/// A request's state over its poster, as the Kotlin app's `CatalogBadge`:
/// a clock, a calendar, a slash, or the share that's in as a ring.
class _Badge extends StatelessWidget {
  const _Badge({
    required this.label,
    this.icon,
    this.progress,
    this.muted = false,
  });

  final String label;
  final String? icon;
  final double? progress;
  final bool muted;

  static const _size = 24.0;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final icon = this.icon;
    return Semantics(
      label: label,
      child: Container(
        width: _size,
        height: _size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: colors.background.withValues(alpha: .7),
          border: Border.all(color: colors.foreground.withValues(alpha: .1)),
        ),
        child: ExcludeSemantics(
          child: icon == null
              ? ProgressRing(progress, size: _size * .84)
              : KitIcon(
                  icon,
                  size: _size * .58,
                  color: muted ? colors.mutedForeground : colors.foreground,
                ),
        ),
      ),
    );
  }
}
