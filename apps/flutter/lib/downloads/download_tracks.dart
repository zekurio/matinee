import '../api/matinee_api.dart';

/*
 * Which audio and subtitles a download starts with, and who draws them,
 * the Kotlin app's `DownloadTracks.kt`. A file from the server gets all of
 * that from `playback.start`. A download plays without the server, so it
 * can't ask, and picks here the way the player did before the server
 * decided: the one exception AGENTS.md names.
 */

/// `pt-BR` and `pt` are the same language here.
String? _baseLanguage(String? tag) {
  if (tag == null || tag.isEmpty) return null;
  return tag.split(RegExp('[-_]')).first.toLowerCase();
}

bool _sameLanguage(String? a, String? b) {
  final base = _baseLanguage(a);
  return base != null && base == _baseLanguage(b);
}

final _commentary = RegExp('commentary', caseSensitive: false);

bool _isCommentary(AudioTrack track) => _commentary.hasMatch(track.label);

AudioTrack? _mostChannels(Iterable<AudioTrack> tracks) {
  AudioTrack? best;
  for (final track in tracks) {
    if (best == null || (track.channels ?? 0) > (best.channels ?? 0)) {
      best = track;
    }
  }
  return best;
}

/// The track for [language] (`original` for the title's own), else the
/// file's primary one; in place of one this device can't decode, a track
/// in the same language that it can.
AudioTrack? downloadAudio(
  List<AudioTrack> tracks,
  String? language,
  String? titleLanguage, {
  required bool Function(String codec) decodes,
}) {
  final primary =
      tracks.where((track) => track.primary).firstOrNull ?? tracks.firstOrNull;
  final target = language == originalLanguage ? titleLanguage : language;
  AudioTrack? inLanguage;
  if (target != null) {
    final matches = [
      for (final track in tracks)
        if (_sameLanguage(track.language, target) && !_isCommentary(track))
          track,
    ];
    inLanguage = matches.contains(primary) ? primary : _mostChannels(matches);
  }
  final wanted = inLanguage ?? primary;
  if (wanted == null || decodes(wanted.codec) || wanted.language == null) {
    return wanted;
  }
  final standIn = _mostChannels(
    tracks.where(
      (track) =>
          track != wanted &&
          track.language == wanted.language &&
          decodes(track.codec) &&
          !_isCommentary(track),
    ),
  );
  return standIn ?? wanted;
}

/// Text the screen draws, from the WebVTT saved beside the download.
bool _drawable(SubtitleTrack track) =>
    track.delivery == SubtitleDelivery.webvtt;

/// The full or forced track for a language: the exact tag first, then the
/// file's default, then one without SDH.
SubtitleTrack? _bestInLanguage(
  List<SubtitleTrack> tracks,
  String? language, {
  bool forced = false,
}) {
  SubtitleTrack? best;
  var bestScore = -1;
  for (final track in tracks) {
    if (track.forced != forced || !_sameLanguage(track.language, language)) {
      continue;
    }
    final score =
        (track.language == language ? 4 : 0) +
        (track.defaultValue ? 2 : 0) +
        (track.sdh ? 0 : 1);
    if (score > bestScore) {
      best = track;
      bestScore = score;
    }
  }
  return best;
}

SubtitleTrack? _forcedTrack(
  List<SubtitleTrack> tracks,
  String? audioLanguage,
  String language,
) =>
    _bestInLanguage(tracks, audioLanguage, forced: true) ??
    _bestInLanguage(tracks, language, forced: true);

/// The subtitle a download starts with, or null for off, by the
/// preferences' subtitle mode. [deviceLanguage] stands in for a subtitle
/// language the preferences don't name.
SubtitleTrack? downloadSubtitle(
  List<SubtitleTrack> tracks,
  String? audioLanguage,
  PlaybackPreferences preferences, {
  required String deviceLanguage,
}) {
  final shown = tracks.where(_drawable).toList();
  final language = preferences.subtitleLanguage ?? deviceLanguage;
  SubtitleTrack? forced() => _forcedTrack(shown, audioLanguage, language);
  switch (preferences.subtitleMode) {
    case SubtitleMode.off:
      return null;
    case SubtitleMode.forced:
      return forced();
    case SubtitleMode.always:
      return _bestInLanguage(shown, language) ?? forced();
    case SubtitleMode.foreign:
      if (audioLanguage != null && !_sameLanguage(audioLanguage, language)) {
        return _bestInLanguage(shown, language) ?? forced();
      }
      return forced();
    default:
      final picked = forced();
      if (picked != null) return picked;
      // Some muxers mark every track default, which says nothing.
      final flagged = shown.where((track) => track.defaultValue).toList();
      if (shown.length > 1 && flagged.length == shown.length) return null;
      return flagged.firstOrNull;
  }
}

/// Who draws a download's subtitle.
sealed class SubtitleShow {
  const SubtitleShow();
}

final class SubtitleOff extends SubtitleShow {
  const SubtitleOff();
}

/// The engine draws the file's own stream [stream].
final class SubtitleInFile extends SubtitleShow {
  const SubtitleInFile(this.track, this.stream);

  final SubtitleTrack track;
  final int stream;
}

/// The screen draws the text, from the saved WebVTT.
final class SubtitleOnScreen extends SubtitleShow {
  const SubtitleOnScreen(this.track);

  final SubtitleTrack track;
}

/// The file's stream index of an embedded track, from its `stream-N` id.
int? streamIndex(SubtitleTrack track) => track.id.startsWith('stream-')
    ? int.tryParse(track.id.substring('stream-'.length))
    : null;

/// Who draws [track] of a download: the engine draws a picture track, like
/// PGS, from a download that's the file as it is, and mpv an ASS or SSA
/// track there with its styling and fonts. The screen draws text from the
/// WebVTT saved beside it. [inFile] is whether the download still holds
/// the file's own streams, as the file as it is does.
SubtitleShow downloadSubtitleShow(
  SubtitleTrack? track, {
  required bool mpv,
  required bool inFile,
}) {
  if (track == null) return const SubtitleOff();
  final stream = streamIndex(track);
  final picture =
      track.delivery == SubtitleDelivery.pgs ||
      track.delivery == SubtitleDelivery.burnIn;
  final styled = track.format == 'ASS' || track.format == 'SSA';
  if (inFile &&
      stream != null &&
      track.source == SubtitleSource.embedded &&
      (picture || (mpv && styled))) {
    return SubtitleInFile(track, stream);
  }
  if (_drawable(track)) return SubtitleOnScreen(track);
  return const SubtitleOff();
}
