// What the player asks of the device around the video: the levels a swipe
// sets, picture in picture, and the media session behind the system's
// controls. `just flutter pigeon` writes the Dart and Kotlin sides.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/player_system.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/player/system/PlayerSystem.g.kt',
    kotlinOptions: KotlinOptions(
      package: 'io.github.zekurio.matinee.player.system',
    ),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// The window's brightness and the media volume. Both are from 0 to 1.
class LevelsMessage {
  LevelsMessage({required this.brightness, this.volume});

  /// The window's own brightness, or the system's until one is set.
  final double brightness;

  /// Null when the device sends audio out at a fixed level.
  final double? volume;
}

/// What the system's controls show for the video, in the app's language.
/// [headers] go with the artwork's request, which is to the active server.
class MediaInfoMessage {
  MediaInfoMessage({
    required this.title,
    this.subtitle,
    this.artworkUrl,
    required this.headers,
    required this.playLabel,
    required this.pauseLabel,
    this.backMs,
    this.backLabel,
    this.aheadMs,
    this.aheadLabel,
  });

  final String title;
  final String? subtitle;
  final String? artworkUrl;
  final Map<String, String> headers;
  final String playLabel;
  final String pauseLabel;

  /// The server's skip steps, with what their buttons say; null without.
  final int? backMs;
  final String? backLabel;
  final int? aheadMs;
  final String? aheadLabel;
}

enum MediaPhaseMessage { buffering, ready, ended }

/// Where the video is. The system moves the position on from it while it
/// plays, so it comes again only when that would be wrong.
class MediaStateMessage {
  MediaStateMessage({
    required this.playing,
    required this.phase,
    required this.positionMs,
    this.durationMs,
    required this.rate,
  });

  final bool playing;
  final MediaPhaseMessage phase;
  final int positionMs;
  final int? durationMs;
  final double rate;
}

enum MediaCommandKind { play, pause, seekTo, back, ahead }

/// A press on the system's controls, a headset, or the small window.
/// [positionMs] is where a seekTo goes.
class MediaCommandMessage {
  MediaCommandMessage({required this.kind, this.positionMs});

  final MediaCommandKind kind;
  final int? positionMs;
}

@HostApi()
abstract class PlayerSystemApi {
  LevelsMessage levels();

  /// Sets the media volume to the step nearest [level] and answers where it
  /// is now; Do Not Disturb can refuse a change.
  double setVolume(double level);

  /// The window's own brightness, which goes back to the system's when null.
  void setBrightness(double? brightness);

  /// Whether the device has picture in picture; low-memory ones don't.
  bool hasPictureInPicture();

  /// Whether the app shows in the small window now.
  bool inPictureInPicture();

  /// Shrinks the app into the small window now, and answers whether it did.
  /// The system can refuse, as when picture in picture is off for the app
  /// in its settings.
  bool enterPictureInPicture();

  /// Whether leaving the app shrinks it into the small window, as it does
  /// while a video plays.
  void setAutoPictureInPicture(bool enabled);

  /// Shows the video's controls in the notification shade, on the lock
  /// screen, to headsets, and in the small window.
  void showMedia(MediaInfoMessage info);

  void setMediaState(MediaStateMessage state);

  /// Takes the controls away once the player closes.
  void hideMedia();
}

@FlutterApi()
abstract class PlayerSystemEventsApi {
  /// The app went into the small window or came back out of it.
  void pictureInPictureChanged(bool active);

  /// The system's controls want the video to do something. The player
  /// does it its own way, as a seek in a transcode asks the server.
  void mediaCommand(MediaCommandMessage command);
}
