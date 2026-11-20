import 'dart:math' as math;

import '../api/matinee_api.dart';
import '../l10n/app_localizations.dart';

/// What a file is called, as the server worked it out (`MediaItem.label`),
/// with the words for an episode's number in the app's language. The
/// Kotlin app's `ItemLabel`.
final class ItemNames {
  const ItemNames({
    required this.showName,
    required this.year,
    required this.title,
    required this.untitled,
  });

  /// The show or movie, or for a loose file its folder or file title.
  final String showName;
  final String? year;

  /// The episode's name, "Episode 4", or the movie's.
  final String title;

  /// Neither the provider nor the file gave the episode a name.
  final bool untitled;
}

ItemNames itemNames(MediaItem item, AppLocalizations l) {
  final label = item.label;
  final number = label.episodeNumber;
  final name = label.title ?? (number == null ? null : l.mediaEpisode(number));
  return ItemNames(
    showName: label.showName.isEmpty ? item.fileTitle : label.showName,
    year: label.year,
    title: name == null || name.isEmpty ? item.fileTitle : name,
    untitled: label.untitled,
  );
}

/// "S2, E5", the way episode codes read in running text; "Special 4" in
/// season 0.
String? episodeCode(MediaItem item, AppLocalizations l) {
  final season = item.seasonNumber;
  final number = item.episodeNumber;
  if (season == null || number == null) return null;
  return season == 0
      ? l.mediaSpecial(number)
      : l.mediaEpisodeCode(season, number);
}

String seasonName(int? number, AppLocalizations l) => switch (number) {
  null => l.mediaOtherFiles,
  0 => l.mediaSpecials,
  _ => l.mediaSeason(number),
};

/// How much of the file was watched, 0 to 1, or null when unknown.
double? progressRatio(MediaItem item) {
  final progress = item.progress;
  final duration = item.durationSeconds;
  if (progress == null || duration == null) return null;
  if (progress.completed) return 1;
  if (duration <= 0) return null;
  return (progress.positionSeconds / duration).clamp(0, 1).toDouble();
}

/// "12 min left", for a file the person started and didn't finish.
String? timeLeft(MediaItem item, AppLocalizations l) {
  final progress = item.progress;
  final duration = item.durationSeconds;
  if (progress == null || duration == null || progress.completed) return null;
  final minutes = math.max(
    1,
    ((duration - progress.positionSeconds) / 60).round(),
  );
  return l.mediaTimeLeft(minutes);
}

bool isWatched(MediaItem item) => item.progress?.completed ?? false;
