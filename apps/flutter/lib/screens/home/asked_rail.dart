import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/layout.dart';
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/requests_hub.dart';

/// Home's "My requests", as the Kotlin app's `HomeAskedRail`: what's on its
/// way and what came or was answered lately, each card following its
/// title's state live, with the accent dot once one arrives. Nothing when
/// there's none, so Home stays about what's here. The heading opens the
/// whole list.
class AskedRail extends StatelessWidget {
  const AskedRail({super.key, required this.items});

  final List<RequestItem> items;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final size = railCardSize(context, RailArt.poster);
    return FollowTitles(
      titles: FollowedTitles([
        for (final item in items)
          CatalogInput(ref: item.title.ref, libraryId: item.library.id),
      ]),
      child: Rail(
        // A new ask at the front starts the row there again.
        key: ValueKey(items.first.id),
        title: l.webAskMineTitle,
        onSeeAll: () => context.push(Routes.requests()),
        seeAllLabel: l.webAskMineSeeAll,
        itemWidth: size.width,
        itemHeight: size.height,
        itemCount: items.length,
        itemBuilder: (context, index) => AskedCard(
          key: ValueKey(items[index].id),
          item: items[index],
          fresh: true,
        ),
      ),
    );
  }
}
