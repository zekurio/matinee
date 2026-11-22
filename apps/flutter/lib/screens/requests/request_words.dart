import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../router.dart';

/// What a card, a poster, and the request sheet show for the `Availability` the
/// server sent, after the web's catalog/words.ts. The server decides the state,
/// the action, and every number; these only pick which words and marks go
/// where, and put them in the app's language.

/// The contract's `Availability.state`.
abstract final class AvailabilityState {
  static const asked = 'asked';
  static const coming = 'coming';
  static const release = 'release';
  static const unavailable = 'unavailable';
  static const here = 'here';
}

/// The contract's `Availability.action`.
abstract final class AvailabilityAction {
  static const ask = 'ask';
  static const add = 'add';
  static const cancel = 'cancel';
}

/// The contract's `Availability.disabledReason`.
abstract final class DisabledReason {
  static const off = 'off';
  static const limit = 'limit';
  static const noDestination = 'noDestination';
  static const declined = 'declined';
}

/// Tells catalog titles apart, for keys, tones, and the live state.
String refKey(CatalogRef ref) =>
    '${ref.kind}:${ref.provider}:${ref.providerId}';

/// The page of a catalog title.
String catalogRoute(CatalogRef ref, {String? library}) =>
    Routes.catalog(ref.kind, ref.provider, ref.providerId, library: library);

extension CatalogRefFacts on CatalogRef {
  bool get isShow => kind == TitleKind.show;
}

extension SeasonAsTitle on SeasonAvailability {
  /// A season's availability read as a title's, which it extends.
  Availability asTitle() => Availability(
    state: state,
    action: action,
    progress: progress,
    etaSeconds: etaSeconds,
    releaseDate: releaseDate,
    stillLooking: stillLooking,
    reason: switch (reason) {
      final reason? => AvailabilityReason(
        kind: reason.kind,
        code: reason.code,
        note: reason.note,
      ),
      null => null,
    },
    askedBySelf: askedBySelf,
    requestId: requestId,
    others: AvailabilityOthers(count: others.count, names: others.names),
    limit: switch (limit) {
      final limit? => AvailabilityLimit(
        left: limit.left,
        resetsAt: limit.resetsAt,
      ),
      null => null,
    },
    libraryTitleId: libraryTitleId,
    disabledReason: disabledReason,
  );
}

extension AvailabilityFacts on Availability {
  /// The main action asks or adds, the two that start a request.
  bool get asks =>
      action == AvailabilityAction.ask || action == AvailabilityAction.add;

  /// The library title it is once it's here, else null.
  String? get hereAs => state == AvailabilityState.here ? libraryTitleId : null;
}

/// [season] with the availability [live] gives it.
CatalogSeason withAvailability(CatalogSeason season, SeasonAvailability live) =>
    CatalogSeason(
      number: season.number,
      overview: season.overview,
      poster: season.poster,
      episodeCount: season.episodeCount,
      airDate: season.airDate,
      availability: live,
      selected: season.selected,
    );

/// A calendar day the server sent as `2026-08-14`, or null.
DateTime? parseDay(String? day) {
  if (day == null || day.length < 10) return null;
  return DateTime.tryParse(day.substring(0, 10));
}

/// A state's word, as the four a viewer learns.
@immutable
sealed class StateWord {
  const StateWord();
}

final class AskedWord extends StateWord {
  const AskedWord();
}

/// On its way, with the share that's in once the server knows it.
final class ComingWord extends StateWord {
  const ComingWord(this.progress);

  final double? progress;
}

/// "Out 14 Aug": the release day is ahead.
final class OutWord extends StateWord {
  const OutWord(this.day);

  final DateTime day;
}

final class NotOutWord extends StateWord {
  const NotOutWord();
}

final class UnavailableWord extends StateWord {
  const UnavailableWord();
}

DateTime _today() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
}

/// "Out {date}" while the day is ahead, else "Not out yet".
StateWord releaseWord(String? day, DateTime today) {
  final date = parseDay(day);
  return date != null && date.isAfter(today)
      ? OutWord(date)
      : const NotOutWord();
}

/// The state's word, for a state that has one; null for none and here.
/// With [percent], on its way carries the share that's in.
StateWord? stateWord(
  Availability availability, {
  DateTime? today,
  bool percent = false,
}) => switch (availability.state) {
  AvailabilityState.asked => const AskedWord(),
  AvailabilityState.coming => ComingWord(
    percent ? availability.progress : null,
  ),
  AvailabilityState.release => releaseWord(
    availability.releaseDate,
    today ?? _today(),
  ),
  AvailabilityState.unavailable => const UnavailableWord(),
  _ => null,
};

/// The queue as one list, the server's lists one after another in its
/// order: waiting, needs attention, on the way, then [done] (the queue's
/// own when null), without the ids in [held]. Each card reads its state
/// from the request itself.
List<AdminRequestItem> queueInOrder(
  RequestQueue queue, {
  Set<String> held = const {},
  List<AdminRequestItem>? done,
}) => [
  for (final list in [
    queue.waiting,
    queue.needsAttention,
    queue.onTheWay,
    done ?? queue.done,
  ])
    for (final item in list)
      if (!held.contains(item.id)) item,
];

/// Done as the overview lists it: the newest the live queue holds, then
/// what the pages read from the start of Done have after the live list's
/// last, so a request that left Done since a page was read doesn't come
/// back from it. [more] says whether a further page is still to be read.
({List<AdminRequestItem> items, bool more}) doneInOrder(
  List<AdminRequestItem> live, {
  required bool liveIsAll,
  required List<AdminRequestItem> paged,
  required bool pagedDone,
}) {
  if (liveIsAll) return (items: live, more: false);
  final last = live.lastOrNull;
  final at = last == null ? -1 : paged.indexWhere((p) => p.id == last.id);
  if (last != null && at < 0) return (items: live, more: !pagedDone);
  final seen = {for (final item in live) item.id};
  return (
    items: [
      ...live,
      for (final item in paged.skip(at + 1))
        if (!seen.contains(item.id)) item,
    ],
    more: !pagedDone,
  );
}

/// The glyph in a catalog card's corner.
enum Glyph { clock, ring, calendar, slash }

/// What the corner shows: its glyph, and for the ring, the share that's
/// in, or null for a dotted ring.
typedef CardBadge = ({Glyph glyph, double? progress});

/// The round glass mark in a catalog card's corner, once the title has a
/// state. Null for a title nobody requested, and for one that's here: a
/// card shows nothing at rest, as the web's does.
CardBadge? badgeOf(Availability availability) => switch (availability.state) {
  AvailabilityState.asked => (glyph: Glyph.clock, progress: null),
  AvailabilityState.coming => (
    glyph: Glyph.ring,
    progress: availability.progress,
  ),
  AvailabilityState.release => (glyph: Glyph.calendar, progress: null),
  AvailabilityState.unavailable => (glyph: Glyph.slash, progress: null),
  _ => null,
};

/// The one thing a poster offers to do about a title.
enum PosterAction { request, cancel }

/// What the server lets the viewer do, as the poster's one button, or null.
PosterAction? posterAction(Availability availability) {
  if (availability.asks) return PosterAction.request;
  if (availability.requestId == null) return null;
  return availability.action == AvailabilityAction.cancel
      ? PosterAction.cancel
      : null;
}

/// Why a declined title isn't coming.
enum ReasonWord { alreadyHere, notForServer, notFound, declined }

ReasonWord declineOf(AvailabilityReason reason) {
  if (reason.kind == 'notFound' || reason.code == DeclineReason.notFound) {
    return ReasonWord.notFound;
  }
  return switch (reason.code) {
    DeclineReason.alreadyHere => ReasonWord.alreadyHere,
    DeclineReason.notForServer => ReasonWord.notForServer,
    _ => ReasonWord.declined,
  };
}

/// Why the poster's Request can't be pressed, as the web's
/// `requestDimmed`: the poster keeps it, dimmed, and a tap says this.
@immutable
sealed class Blocked {
  const Blocked();
}

final class BlockedOff extends Blocked {
  const BlockedOff();
}

final class BlockedNoDestination extends Blocked {
  const BlockedNoDestination();
}

/// Out of requests until [at], or later when the server doesn't say.
final class BlockedLimit extends Blocked {
  const BlockedLimit(this.at);

  final DateTime? at;
}

/// An admin declined the title, which closes it for everyone until an
/// admin lifts it. Whoever requested it has the answer.
final class BlockedDeclined extends Blocked {
  const BlockedDeclined();
}

Blocked? requestBlocked(Availability availability) =>
    switch (availability.disabledReason) {
      DisabledReason.off => const BlockedOff(),
      DisabledReason.noDestination => const BlockedNoDestination(),
      DisabledReason.limit => BlockedLimit(
        DateTime.tryParse(availability.limit?.resetsAt ?? '')?.toLocal(),
      ),
      DisabledReason.declined => const BlockedDeclined(),
      _ => null,
    };

/// Whether a poster has a button: one to press, or a Request that can't
/// be, kept with its reason.
bool hasPosterButton(Availability availability) =>
    posterAction(availability) != null || requestBlocked(availability) != null;

/// An admin's answer to the viewer's declined request: the reason he
/// picked (the contract's code) and his note. Null when nothing of the
/// viewer's was declined.
typedef Answer = ({String? code, String? note});

Answer? declineAnswer(Availability availability) {
  final reason = availability.reason;
  if (availability.state != AvailabilityState.unavailable || reason == null) {
    return null;
  }
  final note = reason.note?.trim();
  return (
    code:
        reason.code ??
        (reason.kind == 'notFound' ? DeclineReason.notFound : null),
    note: note == null || note.isEmpty ? null : note,
  );
}

/// A season's episodes: its count, how many have aired of it, or when it's
/// out.
@immutable
sealed class SeasonDetail {
  const SeasonDetail();
}

final class EpisodesDetail extends SeasonDetail {
  const EpisodesDetail(this.count);

  final int count;
}

final class AiringDetail extends SeasonDetail {
  const AiringDetail(this.aired, this.count);

  final int aired;
  final int count;
}

final class ReleaseDetail extends SeasonDetail {
  const ReleaseDetail(this.word);

  final StateWord word;
}

SeasonDetail seasonDetail(CatalogSeason season, {DateTime? today}) {
  final aired = season.availability.episodesAired;
  final count = season.episodeCount ?? 0;
  if (aired == 0 && count > 0) {
    return ReleaseDetail(releaseWord(season.airDate, today ?? _today()));
  }
  if (count > aired && aired > 0) return AiringDetail(aired, count);
  return EpisodesDetail(count);
}

/// The request sheet's button: what pressing it requests.
@immutable
sealed class ChooserLabel {
  const ChooserLabel();
}

final class PickOneLabel extends ChooserLabel {
  const PickOneLabel();
}

/// A film's, with nothing to pick but the library.
final class TitleLabel extends ChooserLabel {
  const TitleLabel();
}

final class FutureLabel extends ChooserLabel {
  const FutureLabel();
}

final class SpecialsLabel extends ChooserLabel {
  const SpecialsLabel();
}

final class OneLabel extends ChooserLabel {
  const OneLabel(this.number);

  final int number;
}

final class ManyLabel extends ChooserLabel {
  const ManyLabel(this.count);

  final int count;
}

/// The sheet's button for the seasons [chosen], with new seasons as they
/// air when [future] on a [first] request.
ChooserLabel chooserLabel(
  List<CatalogSeason> chosen, {
  required bool future,
  required bool first,
}) {
  if (chosen.isEmpty) {
    return future && first ? const FutureLabel() : const PickOneLabel();
  }
  if (chosen.length == 1) {
    final only = chosen.single.number;
    return only == 0 ? const SpecialsLabel() : OneLabel(only);
  }
  return ManyLabel(chosen.length);
}

/// The seasons the sheet starts with ticked: the server's pick, of those
/// the viewer may still request, or only [only], from a season's card.
Set<int> chooserStart(List<CatalogSeason> seasons, {int? only}) => {
  for (final season in seasons)
    if ((only != null ? season.number == only : season.selected) &&
        season.availability.asTitle().asks)
      season.number,
};

/// Numbered seasons in order, then the specials, as the web's rail and
/// chooser have them.
List<CatalogSeason> bySeason(List<CatalogSeason> seasons) =>
    [...seasons]..sort((a, b) => _order(a.number).compareTo(_order(b.number)));

int _order(int number) => number == 0 ? 1 << 30 : number;

/// The catalog's results someone could ask for: none for an account that
/// can't ask.
List<T> askable<T>(List<T> items, Availability Function(T) availability) => [
  for (final item in items)
    if (availability(item).disabledReason != DisabledReason.off) item,
];

// The words, in the app's language.

/// "14 Aug" in the current year, else the whole date, as the web's
/// `formatDay`.
String formatShortDay(DateTime day, AppLocalizations l) {
  final local = day.isUtc ? day.toLocal() : day;
  final format = local.year == DateTime.now().year
      ? DateFormat.MMMd(l.localeName)
      : DateFormat.yMMMd(l.localeName);
  return format.format(local);
}

/// "64%" or "64 %", as the language writes a share.
String formatPercent(double share, AppLocalizations l) =>
    NumberFormat.percentPattern(l.localeName).format(share.clamp(0, 1));

/// "1,200", as the language writes a count.
String formatCount(int count, AppLocalizations l) =>
    NumberFormat.decimalPattern(l.localeName).format(count);

/// "20 minutes", for how long is left.
String formatSpan(int seconds, AppLocalizations l) {
  if (seconds < 60) return l.requestsSpanSeconds(seconds < 1 ? 1 : seconds);
  if (seconds < 3600) return l.requestsSpanMinutes((seconds / 60).round());
  if (seconds < 86400) return l.requestsSpanHours((seconds / 3600).round());
  return l.requestsSpanDays((seconds / 86400).round());
}

/// "2 hours ago", or the day for anything older than a week. Null for a
/// time that doesn't parse.
String? relativeTime(String? iso, AppLocalizations l, {DateTime? now}) {
  final at = DateTime.tryParse(iso ?? '');
  if (at == null) return null;
  final ago = (now ?? DateTime.now()).difference(at);
  if (ago.inMinutes < 1) return l.requestsAgoNow;
  if (ago.inHours < 1) return l.requestsAgoMinutes(ago.inMinutes);
  if (ago.inDays < 1) return l.requestsAgoHours(ago.inHours);
  if (ago.inDays < 7) return l.requestsAgoDays(ago.inDays);
  return formatShortDay(at, l);
}

/// "A, B and C" in the app's language.
String formatList(List<String> items, AppLocalizations l) {
  if (items.isEmpty) return '';
  if (items.length == 1) return items.single;
  return l.requestsListAnd(
    items.sublist(0, items.length - 1).join(', '),
    items.last,
  );
}

String kindWord(String kind, AppLocalizations l) =>
    kind == TitleKind.show ? l.webRequestsKindShow : l.webRequestsKindMovie;

/// "2021 · Movie"
String yearKind(int? year, String kind, AppLocalizations l) => year == null
    ? kindWord(kind, l)
    : l.requestsYearKind('$year', kindWord(kind, l));

String stateText(StateWord word, AppLocalizations l) => switch (word) {
  AskedWord() => l.webCatalogStateAsked,
  ComingWord(:final progress?) => l.webCatalogStateComingPercent(
    formatPercent(progress, l),
  ),
  ComingWord() => l.webCatalogStateComing,
  OutWord(:final day) => l.webCatalogStateOut(formatShortDay(day, l)),
  NotOutWord() => l.webCatalogStateNotOut,
  UnavailableWord() => l.webCatalogStateUnavailable,
};

/// A catalog card's second line: the state once there is one, with the
/// share that's in while it's on its way, else [detail], else the year and
/// kind.
String cardLineText(
  int? year,
  CatalogRef ref,
  Availability availability,
  AppLocalizations l, {
  String? detail,
  bool named = true,
}) {
  final word = stateWord(availability, percent: true);
  if (word != null) return stateText(word, l);
  return detail ??
      (named ? yearKind(year, ref.kind, l) : year?.toString() ?? '');
}

String seasonDetailText(SeasonDetail detail, AppLocalizations l) =>
    switch (detail) {
      EpisodesDetail(:final count) => l.mediaEpisodeCount(count),
      AiringDetail(:final aired, :final count) => l.webCatalogSeasonAiring(
        '$aired',
        '$count',
      ),
      ReleaseDetail(:final word) => stateText(word, l),
    };

/// A season the server lacks, under its name: its state, else its
/// episodes.
String seasonLineText(CatalogSeason season, AppLocalizations l) {
  final word = stateWord(season.availability.asTitle(), percent: true);
  return word != null
      ? stateText(word, l)
      : seasonDetailText(seasonDetail(season), l);
}

/// "Season 4 isn't here yet" while it can be requested, else "Season 4 ·
/// Requested".
String nextSeasonLine(
  int number,
  Availability availability,
  AppLocalizations l,
) {
  final label = seasonName(number, l);
  final word = stateWord(availability, percent: true);
  return word != null
      ? l.requestsSeasonState(label, stateText(word, l))
      : l.requestsSeasonNotHere(label);
}

/// A decline's reason, "Not for this server.", as the web's `declineLine`.
String declineText(AvailabilityReason reason, AppLocalizations l) =>
    switch (declineOf(reason)) {
      ReasonWord.notFound => l.webAskReasonNotFound,
      ReasonWord.alreadyHere => l.webAskReasonAlreadyHere,
      ReasonWord.notForServer => l.webAskReasonNotForServer,
      ReasonWord.declined => l.webAskReasonDeclined,
    };

/// Why a dimmed Request can't be pressed. A declined title says only that
/// it's closed, and to an admin where to open it again.
String blockedText(Blocked blocked, AppLocalizations l, {bool admin = false}) =>
    switch (blocked) {
      BlockedOff() => l.webAskDisabledOff,
      BlockedNoDestination() => l.webAskDisabledNoDestination,
      BlockedLimit(:final at?) => l.webAskLimitUntil(formatShortDay(at, l)),
      BlockedLimit() => l.webAskLimitLater,
      BlockedDeclined() =>
        admin ? l.webAskDisabledDeclinedAdmin : l.webAskDisabledDeclined,
    };

/// A decline reason's words, as the admin picks them: "Not for this
/// server".
String adminReasonText(String code, AppLocalizations l) => switch (code) {
  DeclineReason.alreadyHere => l.webRequestsReasonAlreadyHere,
  DeclineReason.notForServer => l.webRequestsReasonNotForServer,
  _ => l.webRequestsReasonNotFound,
};

/// "Declined: Not for this server.", or "No copy of this could be found."
/// for one given up on.
String answerText(Answer answer, AppLocalizations l) {
  final code = answer.code;
  if (code == DeclineReason.notFound) return l.webAskDeclinedNotFound;
  return code == null
      ? l.webAskReasonDeclined
      : l.webAskDeclinedWhy(adminReasonText(code, l));
}

/// How much of an admin's note a tap shows; the requests page has all of
/// it.
const _noteLength = 140;

/// What a tap on a dimmed Request says, as the web's tooltip: for whoever
/// requested a declined title, the admin's answer, with his note, cut
/// short, on a line of its own; for anyone else, why it can't be pressed.
/// [admin] points an admin to where a decline is lifted. Null for a
/// Request that works.
String? dimmedText(
  Availability availability,
  AppLocalizations l, {
  bool admin = false,
}) {
  final blocked = requestBlocked(availability);
  if (blocked == null) return null;
  final answer = declineAnswer(availability);
  final text = answer == null
      ? blockedText(blocked, l, admin: admin)
      : answerText(answer, l);
  final note = answer?.note;
  if (note == null) return text;
  var short = note;
  if (note.length > _noteLength) {
    final cut = note.substring(0, _noteLength);
    final space = cut.lastIndexOf(' ');
    short =
        '${(space > 0 ? cut.substring(0, space) : cut).replaceAll(RegExp(r'[,.;:]+$'), '')}…';
  }
  return '$text\n${l.webAskDeclinedNote(short)}';
}

String chooserText(ChooserLabel label, AppLocalizations l) => switch (label) {
  PickOneLabel() => l.webAskChooserNone,
  TitleLabel() => l.webAskAsk,
  FutureLabel() => l.webAskChooserNewOnly,
  SpecialsLabel() => l.webAskChooserSpecials,
  OneLabel(:final number) => l.webAskChooserOne('$number'),
  ManyLabel(:final count) => l.webAskChooserMany(count),
};

/// The poster button's words.
String posterActionText(PosterAction action, AppLocalizations l) =>
    switch (action) {
      PosterAction.request => l.webAskAsk,
      PosterAction.cancel => l.webAskCancel,
    };

/// A season's name with its show's, for toasts: "Firefly: Season 2".
String seasonOf(String show, int number, AppLocalizations l) =>
    l.titleSeasonOf(show, seasonName(number, l));

/// "1–4, 6": season numbers, runs of three or more as a range, as the web
/// writes them.
String seasonRuns(List<int> numbers) {
  final runs = <String>[];
  var start = 0;
  for (var index = 1; index <= numbers.length; index++) {
    final first = numbers[start];
    final last = numbers[index - 1];
    if (index < numbers.length && numbers[index] == last + 1) continue;
    if (last - first >= 2) {
      runs.add('$first–$last');
    } else {
      for (var n = first; n <= last; n++) {
        runs.add('$n');
      }
    }
    start = index;
  }
  return runs.join(', ');
}

/// "Seasons 1–4 + new", for a show's request.
String? scopeText(ShowScope? scope, AppLocalizations l) {
  if (scope == null) return null;
  final numbers = [
    for (final n in scope.seasons)
      if (n > 0) n,
  ]..sort();
  String? seasons;
  if (numbers.isNotEmpty) {
    seasons = l.webRequestsScopeSeasons(numbers.length, seasonRuns(numbers));
  }
  if (scope.seasons.contains(0)) {
    seasons = seasons == null
        ? l.webRequestsScopeSpecials
        : l.webRequestsScopeSpecialsAnd(seasons);
  }
  if (seasons == null) {
    return scope.future ? l.webRequestsScopeFutureOnly : null;
  }
  return scope.future ? l.webRequestsScopeAndFuture(seasons) : seasons;
}

/// A [RequestState]'s word, as its badge and the filter's chip say it.
String requestStateWord(String state, AppLocalizations l) => switch (state) {
  RequestState.needsAttention => l.webRequestsStateNeedsAttention,
  RequestState.onTheWay => l.webRequestsStateOnTheWay,
  RequestState.here => l.webRequestsStateHere,
  RequestState.declined => l.webRequestsStateDeclined,
  // Waiting, and a state this app doesn't know yet.
  _ => l.webRequestsStateWaiting,
};
