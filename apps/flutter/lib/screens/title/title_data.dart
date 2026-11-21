import '../../api/matinee_api.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../query/server_data.dart';

/// What the title, season, and episode pages read and decide, as the
/// Kotlin app's `TitleData.kt`.

final titleProvider = serverQueryFamily((api, String id) => api.titles.get(id));

/// One file, for an episode's page.
final itemProvider = serverQueryFamily((api, String id) => api.media.get(id));

/// Which of a title's files to read: one season's, or with [season] null,
/// the files without a season number.
typedef SeasonKey = ({String titleId, int? season});

final seasonItemsProvider = serverQueryFamily(
  (api, SeasonKey key) => key.season == null
      ? api.looseItems(key.titleId)
      : api.titleItems(key.titleId, season: key.season),
);

/// A movie's files, best first as the server orders them, for the picker
/// a movie with more than one has.
final movieFilesProvider = serverQueryFamily(
  (api, String titleId) => api.titleItems(titleId),
);

/// The tracks a file holds as the server lists them for the player, with
/// subtitle files beside the video.
typedef FileTracks = ({List<AudioTrack> audio, List<SubtitleTrack> subtitles});

final fileTracksProvider = serverQueryFamily<FileTracks, String>((
  api,
  String id,
) async {
  final (audio, subtitles) = await (
    api.media.audio(id),
    api.media.subtitles(id),
  ).wait;
  return (audio: audio, subtitles: subtitles.tracks);
});

/// A library title as the catalog knows it, by the provider and id the
/// server matched it to, for its related rows, which the server's
/// `catalog.related` offers a library title that way. Null for a title
/// with no match.
typedef RelatedKey = ({
  String kind,
  String provider,
  String providerId,
  String libraryId,
});

RelatedKey? relatedKey(Title title) {
  final provider = title.provider;
  final id = title.providerId;
  if (provider == null || id == null) return null;
  return (
    kind: title.kind,
    provider: provider,
    providerId: id,
    libraryId: title.libraryId,
  );
}

/// What Play starts in a season: the episode the server names next for the
/// show when it's in this season; else, since the server names none for a
/// season, the one in progress, the first unwatched, or the first, as the
/// Kotlin app and the web pick.
MediaItem? seasonNext(List<MediaItem>? items, MediaItem? showNext) {
  if (items == null || items.isEmpty) return null;
  if (showNext != null) {
    for (final item in items) {
      if (item.id == showNext.id) return item;
    }
  }
  for (final item in items) {
    if (isResuming(item)) return item;
  }
  for (final item in items) {
    if (!isWatched(item)) return item;
  }
  return items.first;
}

/// Every episode of the season is watched.
bool seasonWatched(List<MediaItem>? items) =>
    items != null && items.isNotEmpty && items.every(isWatched);

/// A show's page leads with the episode up next: one not finished, of a
/// show with more than one season.
bool showsNextUp(Title title) {
  final next = title.next;
  return title.isShow &&
      next != null &&
      next.progress?.completed != true &&
      title.seasons.length > 1;
}

/// A title's facts: its year, then its episode count or runtime, then a
/// show's status in the app's language.
List<String> titleFacts(Title title, AppLocalizations l) => [
  ?title.year?.toString(),
  if (title.isShow)
    l.mediaEpisodeCount(title.itemCount)
  else
    ?formatRuntime(title.runtimeMinutes, l),
  if (title.isShow) ?titleStatusName(title.status, l),
];

/// A show's status in the app's language, with the web's words, as the
/// Kotlin app's `titleStatusName`: null for none, or for one from a newer
/// server this build doesn't know, which shows nothing rather than the
/// server's key.
String? titleStatusName(String? status, AppLocalizations l) => switch (status) {
  TitleStatus.continuing => l.webMetadataStatusContinuing,
  TitleStatus.ended => l.webMetadataStatusEnded,
  TitleStatus.unreleased => l.webMetadataStatusUnreleased,
  _ => null,
};

/// An episode's facts: its air date, then its runtime.
List<String> episodeFacts(MediaItem item, AppLocalizations l) => [
  ?formatDay(item.episode?.airDate, l),
  ?formatRuntime(runtimeMinutes(item), l),
];

/// The trailer to offer: the first in the app's language, else the
/// server's first, which it sorts best first.
Trailer? pickTrailer(List<Trailer> trailers, String localeName) {
  final language = localeName.split(RegExp('[-_]')).first.toLowerCase();
  for (final trailer in trailers) {
    final tag = trailer.language?.split('-').first.toLowerCase();
    if (tag == language) return trailer;
  }
  return trailers.firstOrNull;
}

/// "English, German": the languages of a file's tracks, each once in the
/// order given, named by the server's track labels. A label holds a
/// track's own title after the language, so a track without one names its
/// language; a language whose every track has a title shows its tag.
/// Null when no track says its language.
String? trackLanguages(
  Iterable<({String? language, String? title, String label})> tracks,
) {
  final names = <String, String>{};
  for (final track in tracks) {
    final base = track.language?.split('-').first.toLowerCase();
    if (base == null || base.isEmpty) continue;
    if (track.title == null) {
      final current = names[base];
      if (current == null || current == base.toUpperCase()) {
        names[base] = track.label;
      }
    } else {
      names.putIfAbsent(base, base.toUpperCase);
    }
  }
  return names.isEmpty ? null : names.values.join(', ');
}
