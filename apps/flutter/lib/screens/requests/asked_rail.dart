import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../router.dart';
import 'catalog_cards.dart';
import 'requests_hub.dart';

/// A row of what the viewer asked for, each card following its title's state
/// live; the heading opens the whole list. Home's holds what's on its way and
/// what came or was answered lately, with the accent dot once one arrives
/// ([fresh]); the profile's, the latest of everything. Leave it out when
/// there's nothing, so the page stays about what's there.
class AskedRail extends StatelessWidget {
  const AskedRail({super.key, required this.items, this.fresh = true});

  final List<RequestItem> items;

  /// Whether an arrived title gets the accent dot until it's watched.
  final bool fresh;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final size = railCardSize(context, RailArt.poster);
    return FollowTitles(
      titles: FollowedTitles([
        for (final item in items)
          CatalogInput(ref: item.title.ref, libraryId: item.library.id),
      ]),
      // What they asked for can be films and shows, so each card says
      // which.
      child: NamedKinds(
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
            fresh: fresh,
          ),
        ),
      ),
    );
  }
}
