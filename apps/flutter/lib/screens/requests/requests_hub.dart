import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/reconnecting.dart';
import '../../query/server_data.dart';
import 'request_words.dart';

/// What the request screens share while signed in, as the Kotlin app's
/// `RequestsHub`: the last word the server streamed about each title on
/// screen, asking and taking an ask back with the toast's Undo, and for an
/// admin, the live queue.
///
/// How the screens stay current: each one follows its titles through
/// `requests.live` ([FollowTitles]) while it's built, and lets go when it
/// goes. A stream starts with the current state, so reconnecting loses
/// nothing. What one screen hears, every screen shows, since a title's
/// state is the same wherever it sits. An admin's queue streams once for
/// the whole app, for Explore's way to the queue, the queue, and Add and
/// Decline on a title.

/// A title's live answer: the title and each of its seasons.
typedef LiveEntry = ({
  Availability availability,
  List<SeasonAvailability> seasons,
});

/// How long the toast offers Undo. The server holds an ask that needs no
/// approval for ten seconds.
const undoWindow = Duration(seconds: 6);

/// Titles one stream follows at most, as the contract takes.
const mostFollowed = 100;

@immutable
final class RequestsState {
  const RequestsState({
    this.live = const {},
    this.version = 0,
    this.busy = const {},
    this.held = const {},
    this.moves = const {},
    this.queue,
  });

  /// The last word on each title, by [refKey]: from a stream, or from an
  /// answer to an ask.
  final Map<String, LiveEntry> live;

  /// Moves on each ask, cancel, and answer, so lists and pages that hold
  /// requests fetch again.
  final int version;

  /// Titles, by [refKey], with an ask on its way to the server.
  final Set<String> busy;

  /// Requests an admin answered that wait out the Undo before the answer
  /// goes, by id.
  final Set<String> held;

  /// Where an admin chose to send waiting requests instead of where they
  /// go now, library by request id, as the web's "Goes to". It's only
  /// sent with Add.
  final Map<String, String> moves;

  /// The admin's queue as the server streams it; null for everyone else
  /// and until it answers.
  final RequestQueue? queue;

  /// The library [item] goes to: the one an admin chose under "Goes to",
  /// else the one the server selected, else the one it's in.
  ({String id, String name, String? connection}) goesTo(AdminRequestItem item) {
    final chosen = moves[item.id];
    AdminRequestDestination? pick;
    for (final each in item.destinations) {
      if (each.id == chosen) pick = each;
    }
    if (pick == null) {
      for (final each in item.destinations) {
        if (each.selected) pick = each;
      }
    }
    if (pick != null) {
      return (id: pick.id, name: pick.name, connection: pick.connection);
    }
    return (
      id: item.library.id,
      name: item.library.name,
      connection: item.connection?.name,
    );
  }

  /// How many requests wait for the admin or need them, less the ones held
  /// for Undo.
  int get needsYou {
    final queue = this.queue;
    if (queue == null) return 0;
    return queue.waiting.where((item) => !held.contains(item.id)).length +
        queue.needsAttention.length;
  }

  Availability availability(CatalogRef ref, Availability loaded) =>
      live[refKey(ref)]?.availability ?? loaded;

  CatalogSeason season(CatalogRef ref, CatalogSeason season) {
    final live = this.live[refKey(ref)]?.seasons;
    if (live == null) return season;
    for (final each in live) {
      if (each.number == season.number) return withAvailability(season, each);
    }
    return season;
  }

  List<CatalogSeason> seasons(CatalogRef ref, List<CatalogSeason> seasons) => [
    for (final season in seasons) this.season(ref, season),
  ];

  RequestsState copyWith({
    Map<String, LiveEntry>? live,
    int? version,
    Set<String>? busy,
    Set<String>? held,
    Map<String, String>? moves,
    ValueGetter<RequestQueue?>? queue,
  }) => RequestsState(
    live: live ?? this.live,
    version: version ?? this.version,
    busy: busy ?? this.busy,
    held: held ?? this.held,
    moves: moves ?? this.moves,
    queue: queue == null ? this.queue : queue(),
  );
}

/// What an admin answers a request with, from the queue or a title's page.
@immutable
sealed class QueueAnswer {
  const QueueAnswer();
}

/// Accept a waiting request.
final class AddAnswer extends QueueAnswer {
  const AddAnswer();
}

/// Decline a waiting request, with the reason's code and a note.
final class DeclineAnswer extends QueueAnswer {
  const DeclineAnswer(this.reason, this.note);

  final String reason;
  final String? note;
}

/// Give up on an accepted request: declined with "Can't find a copy".
final class GiveUpAnswer extends QueueAnswer {
  const GiveUpAnswer(this.note);

  final String? note;
}

/// Remove a declined request, so anyone may request the title afresh.
final class AllowAgainAnswer extends QueueAnswer {
  const AllowAgainAnswer();
}

/// Accept a declined request as it stands, and send it.
final class AddAfterAllAnswer extends QueueAnswer {
  const AddAfterAllAnswer();
}

/// Whether a waiting request could go to another library than its own,
/// so "Goes to" offers a choice.
bool choosesLibrary(AdminRequestItem item) => item.destinations.length > 1;

final class RequestsHub extends Notifier<RequestsState> {
  MatineeApi? _api;

  @override
  RequestsState build() {
    // Another server or account starts over.
    final api = _api = ref.watch(apiProvider);
    // Whoever runs the queue follows it: reading everyone's requests and
    // answering them, as the web's `runsQueue`.
    if (api != null && ref.watch(runsQueueProvider)) {
      final queue = reconnecting(() => api.admin.requests.live(limit: 1))
          .listen(
            (queue) => state = state.copyWith(queue: () => queue),
            // The queue stays as it was while the stream is down.
            onError: (Object cause) {},
          );
      ref.onDispose(queue.cancel);
    }
    return const RequestsState();
  }

  ToastState get _toasts => ref.read(toastProvider);

  /// What a live stream said.
  void take(List<RequestsLiveEvent> events) {
    if (events.isEmpty) return;
    state = state.copyWith(
      live: {
        ...state.live,
        for (final event in events)
          refKey(event.ref): (
            availability: event.availability,
            seasons: event.seasons,
          ),
      },
    );
  }

  /// What the server answered for a title, shown everywhere at once, ahead
  /// of the stream.
  void apply(CatalogRef ref, Availability availability) {
    final key = refKey(ref);
    state = state.copyWith(
      live: {
        ...state.live,
        key: (
          availability: availability,
          seasons: state.live[key]?.seasons ?? const [],
        ),
      },
    );
  }

  /// Something about requests changed that the server knows of: lists and
  /// pages fetch again.
  void bump() => state = state.copyWith(version: state.version + 1);

  void _busy(String key, bool on) => state = state.copyWith(
    busy: on ? {...state.busy, key} : ({...state.busy}..remove(key)),
  );

  /// Sends waiting request [id] to [libraryId] when it's added, or back to
  /// where the server would send it with null.
  void move(String id, String? libraryId) => state = state.copyWith(
    moves: libraryId == null
        ? ({...state.moves}..remove(id))
        : {...state.moves, id: libraryId},
  );

  /// The library a move sends [item] to on Add, or null to leave it where
  /// it is.
  String? _movedTo(AdminRequestItem item) {
    final chosen = state.moves[item.id];
    for (final each in item.destinations) {
      if (each.id == chosen) return each.selected ? null : chosen;
    }
    return null;
  }

  void _settleMoves(Iterable<String> ids) => state = state.copyWith(
    moves: {...state.moves}..removeWhere((id, _) => ids.contains(id)),
  );

  void _hold(Iterable<String> ids, bool on) => state = state.copyWith(
    held: on ? {...state.held, ...ids} : ({...state.held}..removeAll(ids)),
  );

  void _fail(AppLocalizations l, String message, Object cause) => unawaited(
    _toasts.show(
      message,
      description: describeFailure(l, cause),
      kind: ToastKind.error,
    ),
  );

  /// Asks for a title: the whole film, or a show's seasons in [scope], the
  /// server's default when it's null. Everything showing the title changes
  /// at once, and the toast offers Undo while the ask can be taken back,
  /// but only with [undo]: not for more seasons of a show the viewer
  /// already asked for, where it would take those back too. [onDone] runs
  /// once the server took it, as a sheet closing.
  Future<void> ask(
    AppLocalizations l,
    CatalogRef title,
    String name, {
    String? libraryId,
    ShowScope? scope,
    bool undo = true,
    VoidCallback? onDone,
  }) async {
    final key = refKey(title);
    final api = _api;
    if (api == null || state.busy.contains(key)) return;
    _busy(key, true);
    final RequestItem item;
    try {
      item = await api.requests.ask(
        ref: title,
        libraryId: libraryId,
        scope: scope,
      );
    } on Object catch (cause) {
      if (ref.mounted) _busy(key, false);
      _fail(l, l.webAskToastFailed(name), cause);
      return;
    }
    if (!ref.mounted) return;
    apply(item.title.ref, item.availability);
    bump();
    _busy(key, false);
    onDone?.call();
    final canUndo =
        undo &&
        (item.availability.action == AvailabilityAction.cancel ||
            item.season?.action == AvailabilityAction.cancel);
    final result = await _toasts.show(
      l.webAskToastAsked(name),
      kind: ToastKind.success,
      actionLabel: canUndo ? l.webAskToastUndo : null,
      duration: ToastDuration.indefinite,
      within: undoWindow,
    );
    if (result == ToastResult.action && ref.mounted) {
      await cancel(l, item.id, name);
    }
  }

  /// Takes an ask back, from Undo or the poster's Cancel request.
  Future<void> cancel(
    AppLocalizations l,
    String id,
    String name, {
    VoidCallback? onDone,
  }) async {
    final api = _api;
    if (api == null) return;
    try {
      await api.requests.cancel(RequestId(id: id));
    } on Object catch (cause) {
      _fail(l, l.webAskToastCancelFailed(name), cause);
      return;
    }
    if (!ref.mounted) return;
    bump();
    onDone?.call();
  }

  /// An admin's answer to one request: Add or Decline a waiting one, Give
  /// up on an accepted one, or Allow requests again or Add after all for a
  /// declined one. The request leaves the lists at once, and the answer
  /// goes once the toast's Undo has passed, as the web's queue holds it.
  Future<void> answer(
    AppLocalizations l,
    AdminRequestItem item,
    QueueAnswer answer,
  ) async {
    final api = _api;
    if (api == null) return;
    final name = item.title.name;
    // Read now: the choice is the one made before Add was pressed.
    final movedTo = _movedTo(item);
    _hold([item.id], true);
    final result = await _toasts.show(
      switch (answer) {
        AddAnswer() => l.webRequestsToastAdded(name),
        DeclineAnswer() => l.webRequestsToastDeclined(name),
        GiveUpAnswer() => l.webRequestsToastGaveUp(name),
        AllowAgainAnswer() => l.webRequestsToastAllowedAgain(name),
        AddAfterAllAnswer() => l.webRequestsToastAddedAfterAll(name),
      },
      actionLabel: l.webRequestsToastUndo,
      duration: ToastDuration.indefinite,
      within: undoWindow,
    );
    if (!ref.mounted) return;
    if (result == ToastResult.action) {
      _hold([item.id], false);
      return;
    }
    try {
      await switch (answer) {
        AddAnswer() => api.admin.requests.approve(
          id: item.id,
          libraryId: movedTo,
        ),
        DeclineAnswer(:final reason, :final note) => api.admin.requests.decline(
          id: item.id,
          reason: reason,
          note: note,
        ),
        GiveUpAnswer(:final note) => api.admin.requests.giveUp(
          id: item.id,
          note: note,
        ),
        AllowAgainAnswer() => api.admin.requests.allowAgain(
          RequestId(id: item.id),
        ),
        AddAfterAllAnswer() => api.admin.requests.addAfterAll(
          RequestId(id: item.id),
        ),
      };
      if (ref.mounted) {
        if (answer is AddAnswer) _settleMoves([item.id]);
        bump();
      }
    } on Object catch (cause) {
      _fail(l, switch (answer) {
        AddAnswer() => l.webRequestsToastAddFailed,
        DeclineAnswer() => l.webRequestsToastDeclineFailed(name),
        GiveUpAnswer() => l.webRequestsToastGiveUpFailed(name),
        AllowAgainAnswer() => l.webRequestsToastAllowAgainFailed(name),
        AddAfterAllAnswer() => l.webRequestsToastAddAfterAllFailed(name),
      }, cause);
    }
    // The stream has the answer by now, or the row comes back after a
    // failure.
    await Future<void>.delayed(const Duration(seconds: 1));
    if (ref.mounted) _hold([item.id], false);
  }

  /// Add for every request that waits, held for Undo as one.
  Future<void> answerAll(
    AppLocalizations l,
    List<AdminRequestItem> items,
  ) async {
    final api = _api;
    if (api == null || items.isEmpty) return;
    final ids = [for (final item in items) item.id];
    // A move is one approve each, with its library; the rest go together.
    final moved = [
      for (final item in items)
        if (_movedTo(item) case final library?) (item.id, library),
    ];
    final rest = [
      for (final id in ids)
        if (!moved.any((move) => move.$1 == id)) id,
    ];
    _hold(ids, true);
    final result = await _toasts.show(
      l.webRequestsToastAddedMany(items.length),
      actionLabel: l.webRequestsToastUndo,
      duration: ToastDuration.indefinite,
      within: undoWindow,
    );
    if (!ref.mounted) return;
    if (result != ToastResult.action) {
      try {
        for (final (id, library) in moved) {
          await api.admin.requests.approve(id: id, libraryId: library);
        }
        if (rest.isNotEmpty) await api.admin.requests.approveAll(ids: rest);
        if (ref.mounted) {
          _settleMoves(ids);
          bump();
        }
        await Future<void>.delayed(const Duration(seconds: 1));
      } on Object catch (cause) {
        _fail(l, l.webRequestsToastAddFailed, cause);
      }
    }
    if (ref.mounted) _hold(ids, false);
  }

  /// Sends a request that needs attention again.
  Future<void> retry(AppLocalizations l, AdminRequestItem item) async {
    final api = _api;
    if (api == null) return;
    try {
      await api.admin.requests.retry(RequestId(id: item.id));
    } on Object catch (cause) {
      _fail(l, l.webRequestsRetryFailed(item.title.name), cause);
      return;
    }
    unawaited(_toasts.show(l.webRequestsRetried(item.title.name)));
  }
}

final requestsProvider = NotifierProvider<RequestsHub, RequestsState>(
  RequestsHub.new,
);

/// [RequestsState.version], for the reads that fetch again when it moves.
final requestsVersionProvider = Provider<int>(
  (ref) => ref.watch(requestsProvider.select((state) => state.version)),
);

/// The titles one live stream follows, at most the [mostFollowed] the
/// contract takes, equal when they're the same titles, so a rebuild with
/// the same titles keeps the stream it has.
@immutable
final class FollowedTitles {
  FollowedTitles(Iterable<CatalogInput> inputs) : inputs = _distinct(inputs);

  final List<CatalogInput> inputs;

  static List<CatalogInput> _distinct(Iterable<CatalogInput> inputs) {
    final seen = <String>{};
    return [
      for (final input in inputs)
        if (seen.add(refKey(input.ref))) input,
    ].take(mostFollowed).toList();
  }

  List<String> get _keys => [
    for (final input in inputs) '${refKey(input.ref)}@${input.libraryId}',
  ];

  bool get isEmpty => inputs.isEmpty;

  @override
  bool operator ==(Object other) =>
      other is FollowedTitles && listEquals(other._keys, _keys);

  @override
  int get hashCode => Object.hashAll(_keys);
}

final _liveTitlesProvider = serverStreamFamily(
  (api, FollowedTitles titles) => api.requests.live(titles: titles.inputs),
);

/// Follows what the server says of [titles] while it's built, into
/// [requestsProvider], around [child].
class FollowTitles extends ConsumerWidget {
  const FollowTitles({super.key, required this.titles, required this.child});

  final FollowedTitles titles;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!titles.isEmpty) {
      ref.listen(_liveTitlesProvider(titles), (_, next) {
        if (next.value case final events?) {
          ref.read(requestsProvider.notifier).take(events);
        }
      });
    }
    return child;
  }
}
