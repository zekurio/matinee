import 'dart:math' as math;

import 'package:intl/intl.dart';

import '../api/matinee_api.dart';
import '../l10n/app_localizations.dart';

/// What a file is called, as the server worked it out (`MediaItem.label`), with
/// the words for an episode's number in the app's language.
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

/// "1h 52m", "45m", or "2h", or null without a length.
String? formatRuntime(int? minutes, AppLocalizations l) {
  if (minutes == null || minutes <= 0) return null;
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return l.formatMinutes(rest);
  if (rest == 0) return l.formatHours(hours);
  return l.formatHoursMinutes(hours, rest);
}

/// A file's length in minutes: the provider's for an episode, else the
/// file's own.
int? runtimeMinutes(MediaItem item) {
  if (item.episode?.runtimeMinutes case final minutes?) return minutes;
  final seconds = item.durationSeconds;
  return seconds == null ? null : (seconds / 60).round();
}

/// A YYYY-MM-DD day from the server, as the app's language writes dates;
/// null when there's none or it doesn't parse.
String? formatDay(String? day, AppLocalizations l) {
  if (day == null) return null;
  final parsed = DateTime.tryParse(day);
  if (parsed == null) return null;
  return formatDate(parsed, l);
}

/// [date] as the app's language writes a date, or as English does when
/// the language's date words aren't loaded.
String formatDate(DateTime date, AppLocalizations l) {
  try {
    return DateFormat.yMMMd(l.localeName).format(date);
  } on Object {
    return DateFormat.yMMMd().format(date);
  }
}

/// A rating out of ten, with one decimal, as the app's language writes it.
String formatRating(double rating, AppLocalizations l) =>
    NumberFormat('0.0', l.localeName).format(rating);

/// "2160p · HEVC · HDR10": the picture's part of a file, in the words the
/// server gave its probe.
String? videoSummary(MediaItem item) {
  final video = item.probe?.video;
  if (video == null) return null;
  return [video.resolution, video.format, ?video.dynamicRange].join(' · ');
}

/// The audio stream the file plays first: its default, else its first.
DisplayAudioStream? mainAudio(MediaItem item) {
  final audio = item.probe?.audio ?? const <DisplayAudioStream>[];
  for (final stream in audio) {
    if (stream.defaultValue) return stream;
  }
  return audio.firstOrNull;
}

/// The badges a movie's heading has for its file: the resolution, the
/// dynamic range, and the main audio's layout, as the server words them.
List<String> mediaFlags(MediaItem item) {
  final video = item.probe?.video;
  return [?video?.resolution, ?video?.dynamicRange, ?mainAudio(item)?.layout];
}

/// "4.2 GB": a file's size, in the app's language's digits.
String formatBytes(int bytes, AppLocalizations l) {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  // Bytes are whole, so "0 B" rather than "0.0 B".
  final number = value >= 10 || unit == 0
      ? value.round().toString()
      : NumberFormat('0.0', l.localeName).format(value);
  return '$number ${units[unit]}';
}

/// "Episode 4", or "Special 4" in season 0; null without a number.
String? episodeNumberLabel(MediaItem item, AppLocalizations l) {
  final number = item.episodeNumber;
  if (number == null) return null;
  return item.seasonNumber == 0
      ? l.mediaSpecial(number)
      : l.mediaEpisode(number);
}

/// The person started [item] and hasn't finished it, so Play resumes it.
bool isResuming(MediaItem? item) {
  final progress = item?.progress;
  return progress != null &&
      !progress.completed &&
      progress.positionSeconds > 0;
}
