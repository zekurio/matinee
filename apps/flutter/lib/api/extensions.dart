import 'contract_models.dart';

extension TitleSummaryExtensions on TitleSummary {
  bool get isShow => kind == TitleKind.show;
}

extension TitleExtensions on Title {
  bool get isShow => kind == TitleKind.show;

  TitleSummary get summary => TitleSummary(
    id: id,
    libraryId: libraryId,
    kind: kind,
    name: name,
    year: year,
    overview: overview,
    images: images,
    genres: genres,
    rating: rating,
    contentRating: contentRating,
    runtimeMinutes: runtimeMinutes,
    originalLanguage: originalLanguage,
    favorite: favorite,
    watched: watched,
  );
}

extension UserExtensions on User {
  String get name => _userName(displayName, username);
  bool get isAdmin => role == UserRole.admin;
}

extension ProfileUserExtensions on ProfileUser {
  String get name => _userName(displayName, username);
}

extension AdminUserExtensions on AdminUser {
  String get name => _userName(displayName, username);
  bool get isAdmin => role == UserRole.admin;
}

String _userName(String? displayName, String username) =>
    displayName == null || displayName.trim().isEmpty ? username : displayName;

/// A title, season, or episode whose images are being edited.
final class ImageTarget {
  const ImageTarget({required this.titleId, this.season, this.episode});

  final String titleId;
  final int? season;
  final int? episode;

  List<String> get slots {
    if (season == null) {
      return const [ImageSlot.poster, ImageSlot.backdrop, ImageSlot.logo];
    }
    return episode == null ? const [ImageSlot.poster] : const [ImageSlot.still];
  }
}

const maxImageBytes = 25 * 1024 * 1024;
const imageTypes = {'image/jpeg', 'image/png', 'image/webp'};

const originalLanguage = 'original';
const defaultSkipSeconds = 10;

const defaultPlaybackPreferences = PlaybackPreferences(
  audioLanguage: null,
  subtitleMode: SubtitleMode.defaultValue,
  subtitleLanguage: null,
  rememberSubtitles: true,
  rememberAudio: true,
  skipBackSeconds: defaultSkipSeconds,
  skipForwardSeconds: defaultSkipSeconds,
);

extension PlaybackPreferencesExtensions on PlaybackPreferences {
  int get skipBack => skipBackSeconds ?? defaultSkipSeconds;
  int get skipForward => skipForwardSeconds ?? defaultSkipSeconds;
}

/// The codecs the server always encodes, used when playback.options fails.
const fallbackPlaybackOptions = PlaybackOptions(
  qualities: [],
  maxBitrate: null,
  downloads: false,
  downloadVideoPresets: [],
  skipSteps: [],
  videoCodecs: [TranscodeVideoCodec.h264],
  audioCodecs: [TranscodeAudioCodec.aac],
  audioLanguages: [],
  subtitleLanguages: [],
);

typedef OfflinePlay = PlaybackOfflineInputPlay;

const playbackUnplayable = 'UNPLAYABLE';
const playbackRestricted = 'PLAYBACK_RESTRICTED';
const playbackBusy = 'TOO_MANY_STREAMS';
