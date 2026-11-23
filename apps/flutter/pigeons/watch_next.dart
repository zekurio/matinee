// What an Android TV's launcher shows of the account in its Watch Next row:
// Dart says what goes in, and the platform keeps the row. Android only, so
// there's no Swift side. `just flutter pigeon` writes the Dart and Kotlin
// sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/watch_next.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/launcher/WatchNext.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.launcher'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// Which of the launcher's two kinds a card is.
enum WatchNextKindMessage {
  /// Started and not finished, from Continue watching.
  resume,

  /// The episode after the one last finished, from Next up.
  next,
}

/// One card of the row.
class WatchNextProgramMessage {
  WatchNextProgramMessage({
    required this.itemId,
    required this.kind,
    required this.title,
    required this.episode,
    required this.poster,
    this.episodeTitle,
    this.description,
    this.seasonNumber,
    this.episodeNumber,
    this.artworkId,
    this.durationMillis,
    this.positionMillis,
    this.engagementMillis,
  });

  /// The file the card plays.
  final String itemId;
  final WatchNextKindMessage kind;

  /// The show's name for an episode, else the movie's.
  final String title;

  /// An episode of a show, which has [episodeTitle] and its numbers.
  final bool episode;

  /// The picture is a poster, two by three; otherwise it's sixteen by nine.
  final bool poster;
  final String? episodeTitle;
  final String? description;
  final int? seasonNumber;
  final int? episodeNumber;

  /// The server's id of the card's picture, or null without one.
  final String? artworkId;
  final int? durationMillis;
  final int? positionMillis;

  /// When the account last watched it, as the server says, in milliseconds
  /// since 1970. The launcher orders the row by it.
  final int? engagementMillis;
}

/// A card the person opened in the launcher.
class WatchNextLinkMessage {
  WatchNextLinkMessage({required this.identity, required this.itemId});

  /// Whose row the card was in, as [WatchNextApi.setIdentity] named it.
  final String identity;
  final String itemId;
}

@HostApi()
abstract class WatchNextApi {
  /// Whose programs the row holds, as a hash of the server and the account,
  /// or null when nobody is signed in. When it isn't who it was, the row
  /// and its pictures go.
  @async
  void setIdentity(String? identity);

  /// Which of [artworkIds] have no picture saved for [identity] yet.
  @async
  List<String> missingArtwork(String identity, List<String> artworkIds);

  /// Keeps the picture [artworkId] names, which only a signed-in client can
  /// fetch, for the launcher to read.
  @async
  void saveArtwork(String identity, String artworkId, Uint8List bytes);

  /// Makes the row [programs], in their order: writes what changed, removes
  /// what's gone, leaves out what the person removed from the row until
  /// they watch it again, and deletes the pictures no card uses.
  @async
  void publish(String identity, List<WatchNextProgramMessage> programs);

  /// The card the launcher opened the app with, once: null after that, and
  /// when the app was opened another way.
  WatchNextLinkMessage? takeLink();
}

@FlutterApi()
abstract class WatchNextEventsApi {
  /// The person opened a card while the app was running.
  void opened(WatchNextLinkMessage link);
}
