// Downloads that keep going without the app: the platform keeps the list
// and fetches the files in the background, and Dart says what to fetch and
// shows how it goes. `just flutter pigeon` writes both ends; don't edit
// those. Nothing here is Android's alone, so an iOS side can implement the
// same API with URLSession.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/downloads.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/downloads/Downloads.g.kt',
    kotlinOptions: KotlinOptions(
      package: 'io.github.zekurio.matinee.downloads',
    ),
    swiftOut: 'ios/Runner/Pigeon/Downloads.g.swift',
    swiftOptions: SwiftOptions(includeErrorClass: false),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// What a download holds: the file as it is, fetched with byte ranges, or a
/// version the server makes for this device, fetched segment by segment.
enum DownloadKindMessage { original, device }

enum DownloadStateMessage {
  /// Waiting for its turn, or for a connection that fits the settings.
  queued,
  running,
  paused,
  done,
  failed,
}

/// Why a download stopped or waits to try again. Only [server] comes with
/// words, the server's own; the app words the rest in its language.
enum DownloadErrorMessage { unreachable, brokeOff, forbidden, server }

/// A subtitle track saved beside the video as WebVTT.
class SavedSubtitleMessage {
  SavedSubtitleMessage({
    required this.trackId,
    required this.file,
    required this.url,
  });

  final String trackId;

  /// Where it's saved, relative to [DownloadsHostApi.folder].
  final String file;

  /// Where it's fetched from, on the download's server.
  final String url;
}

/// A download to start.
class DownloadRequestMessage {
  DownloadRequestMessage({
    required this.id,
    required this.server,
    required this.apiBase,
    required this.kind,
    required this.file,
    required this.name,
    required this.meta,
    required this.streamUrl,
    required this.subtitles,
    this.imageUrl,
    this.spec,
    this.totalBytes,
  });

  /// The file's id on the server, which the download goes by.
  final String id;

  /// The saved server it comes from, as its origin key; only that server's
  /// sign-in is sent with it.
  final String server;

  /// The server's `/api` address, which the device version's routes go
  /// under: `v1/media/{id}/downloads`, `downloads/{id}/init.mp4`.
  final String apiBase;

  final DownloadKindMessage kind;

  /// The video file, relative to [DownloadsHostApi.folder].
  final String file;

  /// What the notification calls it, in the app's language.
  final String name;

  /// What Dart keeps with it and reads back as it is: the item as the
  /// server sent it and the tracks the file holds, as JSON.
  final String meta;

  /// The file as it is, for an original.
  final String streamUrl;
  final List<SavedSubtitleMessage> subtitles;

  /// A still or backdrop for the list, which shows without the server.
  final String? imageUrl;

  /// Of a device version, the spec `downloads.start` takes, as JSON.
  final String? spec;

  /// The file's size, or the server's estimate for a device version.
  final int? totalBytes;
}

/// A download as the platform keeps it.
class DownloadEntryMessage {
  DownloadEntryMessage({
    required this.id,
    required this.server,
    required this.kind,
    required this.file,
    required this.name,
    required this.meta,
    required this.state,
    required this.bytes,
    required this.segment,
    required this.subtitles,
    required this.addedAt,
    this.totalBytes,
    this.serverId,
    this.image,
    this.error,
    this.errorMessage,
  });

  final String id;
  final String server;
  final DownloadKindMessage kind;
  final String file;
  final String name;
  final String meta;
  final DownloadStateMessage state;
  final int bytes;

  /// The next segment of a device version to fetch.
  final int segment;

  /// The subtitles saved so far; once the video starts, only those that
  /// came.
  final List<SavedSubtitleMessage> subtitles;

  /// Milliseconds since the epoch.
  final int addedAt;
  final int? totalBytes;

  /// The server's id of a device version while it's being fetched.
  final String? serverId;

  /// The saved picture, relative to [DownloadsHostApi.folder].
  final String? image;
  final DownloadErrorMessage? error;

  /// The server's own words, with [DownloadErrorMessage.server].
  final String? errorMessage;
}

@HostApi()
abstract class DownloadsHostApi {
  /// The folder the downloads' files are in, as an absolute path.
  String folder();

  /// Every server's downloads, oldest first.
  List<DownloadEntryMessage> entries();

  /// Keep [request] and start fetching it; one already kept stays as it is.
  void enqueue(DownloadRequestMessage request);

  void pause(String id);

  /// Go on with a paused or failed download, or try one waiting again now.
  void resume(String id);

  /// Stop and delete a download and its files.
  void remove(String id);

  /// Forget [server]: its downloads, their files, and its sign-in.
  void forgetServer(String server);

  /// Fetch only over unmetered networks, like Wi-Fi. Downloads waiting
  /// take the new setting at once.
  void setUnmeteredOnly(bool on);

  /// The sign-in the fetches send to [server], or null when signed out
  /// there. [userAgent] goes with every request.
  void setCredentials(String server, String? token, String userAgent);

  /// Start again whatever was waiting or running, as after an update that
  /// dropped the system's jobs. What's already scheduled stays.
  void restore();

  /// Space left where the downloads go, in bytes.
  int freeBytes();

  /// Asks to show the downloads' progress, where the system asks first.
  /// Answers whether it may.
  @async
  bool askToNotify();
}

/// The platform tells Dart whenever the downloads change.
@FlutterApi()
abstract class DownloadsEventsApi {
  void changed(List<DownloadEntryMessage> entries);
}
