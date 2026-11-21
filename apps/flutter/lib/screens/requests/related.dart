import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/layout.dart';
import 'catalog_cards.dart';
import 'discover.dart' show RailFailed;
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// The rows of titles related to a catalog title, or to a library title
/// the server matched, as the Kotlin app's `Related.kt`: the rest of the
/// film series it belongs to, and more like it. A title the viewer can
/// watch is the library's card; the rest are catalog cards that follow the
/// stream. A row with nothing in it stays out, and rows that didn't load
/// at all leave no gap, since the page is whole without them.
class CatalogRelatedRows extends ConsumerWidget {
  const CatalogRelatedRows({super.key, required this.relatedTo});

  final CatalogKey relatedTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final rails = ref.watch(relatedRailsProvider(relatedTo));
    final size = railCardSize(context, RailArt.poster);
    final value = rails.value;
    if (value == null) {
      if (rails.hasError) return const SizedBox.shrink();
      return RailSkeleton(
        label: l.loadingInProgress,
        itemWidth: size.width,
        aspectRatio: CardMetrics.poster,
      );
    }
    final rows = <Widget>[];
    final followed = <CatalogInput>[];
    var loading = false;
    var stale = value.stale;
    for (final rail in value.rails) {
      final title = rail.id == RelatedRailId.collection && rail.name != null
          ? rail.name!
          : l.webCatalogRelatedMoreLikeThis;
      final row = (key: relatedTo, rail: rail.id);
      final page = ref.watch(relatedTitlesProvider(row));
      final items = page.value?.items;
      if (items == null) {
        if (page.hasError && !page.isLoading) {
          rows.add(
            RailFailed(
              title: title,
              error: page.error!,
              onRetry: () => ref.invalidate(relatedTitlesProvider(row)),
            ),
          );
        } else {
          loading = true;
          rows.add(
            RailSkeleton(
              label: l.loadingInProgress,
              title: title,
              itemWidth: size.width,
              aspectRatio: CardMetrics.poster,
            ),
          );
        }
        continue;
      }
      if (items.isEmpty) continue;
      stale = stale || (page.value?.stale ?? false);
      followed.addAll([
        for (final item in items)
          if (item.availability.state != AvailabilityState.here)
            CatalogInput(ref: item.ref),
      ]);
      rows.add(
        Rail(
          title: title,
          itemWidth: size.width,
          itemHeight: size.height,
          itemCount: items.length,
          itemBuilder: (context, index) =>
              CatalogTitleCard.related(items[index]),
        ),
      );
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    return FollowTitles(
      // Once every row has loaded, so the stream opens once rather than
      // once a row.
      titles: FollowedTitles(loading ? const [] : followed),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 24,
        children: [
          if (stale)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Text(
                l.webCatalogRelatedStale,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
            ),
          ...rows,
        ],
      ),
    );
  }
}
