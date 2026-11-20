import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../core/failure_text.dart';
import '../core/session.dart';
import '../core/toasts.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../router.dart';
import 'format.dart';
import 'watched_at.dart';

/// What changes the person makes to what they watched and like: the
/// requests, the watched-when ask, and the menu a long press on a card
/// opens, the Kotlin app's `Actions`. Home and the title pages share them.

/// Counts the changes the server took, to what's watched, a favorite, or
/// the recommendations. A screen that shows any of it listens and fetches
/// again, as the Kotlin app's `ViewerState.changed` has them.
final mediaChangesProvider = NotifierProvider<MediaChanges, int>(
  MediaChanges.new,
);

class MediaChanges extends Notifier<int> {
  @override
  int build() => 0;

  void changed() => state++;
}

/// The requests behind each change, by what it's for.
abstract final class MediaMarks {
  static Future<void> item(
    MatineeApi api,
    MediaItem item, {
    required bool watched,
    String? at,
  }) => api.playback.setWatched(
    item.id,
    watched: watched,
    watchedAt: watched ? at : null,
  );

  /// Every file of a title.
  static Future<void> title(
    MatineeApi api,
    String titleId, {
    required bool watched,
    String? at,
  }) => api.playback.setTitleWatched(
    titleId,
    watched: watched,
    watchedAt: watched ? at : null,
  );

  /// Every file of a season, or with [season] null, the files without a
  /// season number, one by one: null in the title-wide request means every
  /// season.
  static Future<void> season(
    MatineeApi api,
    String titleId,
    int? season, {
    required bool watched,
    String? at,
  }) async {
    if (season == null) {
      for (final file in await api.looseItems(titleId)) {
        await item(api, file, watched: watched, at: at);
      }
      return;
    }
    await api.playback.setTitleWatched(
      titleId,
      season: Explicit(season),
      watched: watched,
      watchedAt: watched ? at : null,
    );
  }

  /// A movie's file is a favorite through its title, an episode by itself.
  static Future<void> favoriteItem(
    MatineeApi api,
    MediaItem item, {
    required bool favorite,
  }) {
    final title = item.title;
    return title != null && title.kind == TitleKind.movie
        ? api.favorites.set(title.id, favorite: favorite)
        : api.favorites.setItem(item.id, favorite: favorite);
  }

  static Future<void> favoriteTitle(
    MatineeApi api,
    String titleId, {
    required bool favorite,
  }) => api.favorites.set(titleId, favorite: favorite);

  static Future<void> favoriteSeason(
    MatineeApi api,
    String titleId,
    int season, {
    required bool favorite,
  }) => api.favorites.setSeason(titleId, season: season, favorite: favorite);
}

/// Whether a file is a favorite, as the server sent it: a movie's through
/// its title.
bool isFavoriteItem(MediaItem item) {
  final title = item.title;
  return title != null && title.kind == TitleKind.movie
      ? title.favorite
      : item.favorite;
}

/// Sends [change], then tells every screen through [mediaChangesProvider];
/// a failure goes up as a toast, [failure] with the server's words. True
/// when the server took it. [container] and [l] are read before anything
/// waits, so it finishes after the page or sheet that started it is gone.
Future<bool> sendChange(
  ProviderContainer container,
  AppLocalizations l,
  String failure,
  Future<void> Function(MatineeApi api) change,
) async {
  final toasts = container.read(toastProvider);
  final api = container.read(apiProvider);
  if (api == null) {
    unawaited(toasts.show(failure, kind: ToastKind.error));
    return false;
  }
  try {
    await change(api);
  } on Object catch (error) {
    unawaited(
      toasts.show(
        failure,
        description: describeFailure(l, error),
        kind: ToastKind.error,
      ),
    );
    return false;
  }
  container.read(mediaChangesProvider.notifier).changed();
  return true;
}

/// Marks [name] unwatched at once, or asks when it was watched and marks it
/// with the answer, as the web's tick does. [pending] hears the value the
/// page should show before the server answers, and null when it refused.
Future<void> toggleWatched(
  BuildContext context, {
  required bool watched,
  required String name,
  required Future<void> Function(MatineeApi api, bool watched, String? at) send,
  void Function(bool? pending)? pending,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final l = AppLocalizations.of(context);
  final to = !watched;
  String? at;
  if (to) {
    final answer = await askWatchedAt(context, name);
    if (answer == null) return;
    at = answer.at;
  }
  pending?.call(to);
  final done = await sendChange(
    container,
    l,
    to ? l.mediaMarkWatchedFailed : l.mediaMarkUnwatchedFailed,
    (api) => send(api, to, at),
  );
  if (!done) pending?.call(null);
}

/// Turns a favorite on or off, with [pending] as for [toggleWatched].
Future<void> toggleFavorite(
  BuildContext context, {
  required bool favorite,
  required Future<void> Function(MatineeApi api, bool favorite) send,
  void Function(bool? pending)? pending,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final l = AppLocalizations.of(context);
  pending?.call(!favorite);
  final done = await sendChange(
    container,
    l,
    l.mediaFavoriteFailed,
    (api) => send(api, !favorite),
  );
  if (!done) pending?.call(null);
}

/// What a menu is for: a file, a whole title, or one season of a show. A
/// menu opened on the page of what it's for is [here]: that page shows
/// Play, the tick, and the heart already, so the menu leaves them out, and
/// a link to the page itself too.
sealed class ActionTarget {
  const ActionTarget({required this.here});

  final bool here;
}

final class ItemActions extends ActionTarget {
  const ItemActions(this.item, {super.here = false});

  final MediaItem item;
}

/// [file] is what Play starts, when known, which Play from the start
/// starts over. [recommended] is the title at the catalog when a
/// recommendation row offered it, for "Not interested".
final class TitleActions extends ActionTarget {
  const TitleActions(
    this.title, {
    this.file,
    this.recommended,
    super.here = false,
  });

  final TitleSummary title;
  final MediaItem? file;
  final CatalogRef? recommended;
}

final class SeasonActions extends ActionTarget {
  const SeasonActions(this.title, this.season, {super.here = false});

  final TitleSummary title;
  final Season season;
}

/// Whether [target]'s menu holds anything. One opened on its own page has
/// only Play from the start for now, since downloads and an admin's items
/// aren't in this app yet, so the page leaves its button out without it.
bool hasActions(ActionTarget target) {
  if (!target.here) return true;
  return switch (target) {
    ItemActions(:final item) => isResuming(item),
    TitleActions(:final file) => isResuming(file),
    SeasonActions() => false,
  };
}

/// A season's page, by its number, or -1 for the files without one.
String seasonRoute(String titleId, int? season) =>
    Routes.season(titleId, season ?? -1);

/// What a menu item does once its sheet has closed, with the context of
/// the screen that opened it.
typedef _Act = Future<void> Function(BuildContext context);

/// Opens [target]'s menu as a sheet; what's picked runs once it's gone.
Future<void> showActions(BuildContext context, ActionTarget target) async {
  final l = AppLocalizations.of(context);
  final act = await Sheet.show<_Act>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) => _ActionsSheet(target),
  );
  if (act != null && context.mounted) await act(context);
}

class _ActionsSheet extends StatelessWidget {
  const _ActionsSheet(this.target);

  final ActionTarget target;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    void run(_Act act) => Navigator.of(context).pop(act);
    final (title, description, items) = switch (target) {
      ItemActions(:final item, :final here) => _item(l, item, here, run),
      TitleActions(
        :final title,
        :final file,
        :final recommended,
        :final here,
      ) =>
        _title(l, title, file, recommended, here, run),
      SeasonActions(:final title, :final season, :final here) => _season(
        l,
        title,
        season,
        here,
        run,
      ),
    };
    return Sheet(
      title: title,
      description: description,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: items,
      ),
    );
  }

  static (String, String?, List<Widget>) _item(
    AppLocalizations l,
    MediaItem item,
    bool here,
    void Function(_Act) run,
  ) {
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    final name = code == null ? names.showName : names.title;
    final resume = isResuming(item);
    final watched = isWatched(item);
    final favorite = isFavoriteItem(item);
    final title = item.title;
    return (
      name,
      code == null ? names.year : names.showName,
      [
        if (!here)
          SheetItem(
            icon: Lucide.playOutline,
            label: resume ? l.titleResume : l.titlePlay,
            onPressed: () => run(
              (context) async => unawaited(context.push(Routes.play(item.id))),
            ),
          ),
        if (resume) _fromStart(l, item, run),
        if (!here) ...[
          SheetItem(
            icon: Lucide.check,
            label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
            onPressed: () => run(
              (context) => toggleWatched(
                context,
                watched: watched,
                name: name,
                send: (api, to, at) =>
                    MediaMarks.item(api, item, watched: to, at: at),
              ),
            ),
          ),
          _favorite(
            l,
            favorite,
            run,
            (api, to) => MediaMarks.favoriteItem(api, item, favorite: to),
          ),
          if (title != null && title.kind == TitleKind.show) ...[
            _link(
              l.actionsEpisodeDetails,
              Lucide.info,
              Routes.episode(item.id),
              run,
            ),
            _link(
              l.actionsGoToShow(title.name),
              Lucide.tv,
              Routes.title(title.id),
              run,
            ),
          ] else if (title != null)
            _link(l.mediaHeroDetails, Lucide.info, Routes.title(title.id), run),
        ],
      ],
    );
  }

  static (String, String?, List<Widget>) _title(
    AppLocalizations l,
    TitleSummary title,
    MediaItem? file,
    CatalogRef? recommended,
    bool here,
    void Function(_Act) run,
  ) {
    final show = title.kind == TitleKind.show;
    return (
      title.name,
      title.year?.toString(),
      [
        if (!here)
          SheetItem(
            icon: Lucide.playOutline,
            label: l.titlePlay,
            onPressed: () => run((context) => _playTitle(context, title)),
          ),
        if (file != null && isResuming(file)) _fromStart(l, file, run),
        if (!here) ...[
          SheetItem(
            icon: Lucide.check,
            label: switch ((show, title.watched)) {
              (true, true) => l.mediaMarkAllUnwatched,
              (true, false) => l.mediaMarkAllWatched,
              (false, true) => l.mediaMarkUnwatched,
              (false, false) => l.mediaMarkWatched,
            },
            onPressed: () => run(
              (context) => toggleWatched(
                context,
                watched: title.watched,
                name: title.name,
                send: (api, to, at) =>
                    MediaMarks.title(api, title.id, watched: to, at: at),
              ),
            ),
          ),
          _favorite(
            l,
            title.favorite,
            run,
            (api, to) => MediaMarks.favoriteTitle(api, title.id, favorite: to),
          ),
          _link(
            show ? l.mediaHeroEpisodes : l.mediaHeroDetails,
            Lucide.info,
            Routes.title(title.id),
            run,
          ),
        ],
        if (recommended != null)
          SheetItem(
            icon: Lucide.eyeOff,
            label: l.webDiscoverNotInterested,
            onPressed: () =>
                run((context) => _notInterested(context, title, recommended)),
          ),
      ],
    );
  }

  static (String, String?, List<Widget>) _season(
    AppLocalizations l,
    TitleSummary title,
    Season season,
    bool here,
    void Function(_Act) run,
  ) {
    final name = seasonName(season.number, l);
    final number = season.number;
    // The card goes by the season's counts; its page by its episodes.
    final watched =
        season.itemCount > 0 && season.watchedCount >= season.itemCount;
    return (
      name,
      title.name,
      [
        if (!here) ...[
          SheetItem(
            icon: Lucide.check,
            label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
            onPressed: () => run(
              (context) => toggleWatched(
                context,
                watched: watched,
                name: l.titleSeasonOf(title.name, name),
                send: (api, to, at) => MediaMarks.season(
                  api,
                  title.id,
                  number,
                  watched: to,
                  at: at,
                ),
              ),
            ),
          ),
          // The files without a season number aren't a season to mark.
          if (number != null)
            _favorite(
              l,
              season.favorite,
              run,
              (api, to) => MediaMarks.favoriteSeason(
                api,
                title.id,
                number,
                favorite: to,
              ),
            ),
          _link(
            l.mediaHeroEpisodes,
            Lucide.list,
            seasonRoute(title.id, number),
            run,
          ),
        ],
      ],
    );
  }

  static Widget _fromStart(
    AppLocalizations l,
    MediaItem item,
    void Function(_Act) run,
  ) => SheetItem(
    icon: Lucide.rotateCcw,
    label: l.actionsPlayFromStart,
    onPressed: () => run(
      (context) async =>
          unawaited(context.push(Routes.play(item.id), extra: 0.0)),
    ),
  );

  static Widget _favorite(
    AppLocalizations l,
    bool favorite,
    void Function(_Act) run,
    Future<void> Function(MatineeApi api, bool favorite) send,
  ) => SheetItem(
    icon: favorite ? Lucide.heartFilled : Lucide.heart,
    label: favorite ? l.mediaRemoveFavorite : l.mediaAddFavorite,
    onPressed: () => run(
      (context) => toggleFavorite(context, favorite: favorite, send: send),
    ),
  );

  static Widget _link(
    String label,
    String icon,
    String route,
    void Function(_Act) run,
  ) => SheetItem(
    icon: icon,
    label: label,
    onPressed: () => run((context) async => unawaited(context.push(route))),
  );
}

/// Plays what the server names next for [title], or says it has nothing.
Future<void> _playTitle(BuildContext context, TitleSummary title) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final l = AppLocalizations.of(context);
  final toasts = container.read(toastProvider);
  final router = GoRouter.of(context);
  final api = container.read(apiProvider);
  try {
    if (api == null) throw StateError('no server');
    final next = (await api.titles.get(title.id)).next;
    if (next == null) {
      unawaited(toasts.show(l.mediaNoFiles(title.name)));
    } else {
      unawaited(router.push(Routes.play(next.id)));
    }
  } on Object catch (error) {
    unawaited(
      toasts.show(
        l.mediaPlayFailed(title.name),
        description: describeFailure(l, error),
        kind: ToastKind.error,
      ),
    );
  }
}

/// Leaves a recommended title out of the viewer's recommendations.
Future<void> _notInterested(
  BuildContext context,
  TitleSummary title,
  CatalogRef ref,
) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final l = AppLocalizations.of(context);
  final done = await sendChange(
    container,
    l,
    l.webDiscoverDismissFailed(title.name),
    (api) => api.recommendations.dismiss(ref: ref, dismissed: true),
  );
  if (done) {
    unawaited(
      container.read(toastProvider).show(l.webDiscoverDismissed(title.name)),
    );
  }
}
