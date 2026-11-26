import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/player/playback_report.dart';
import 'package:matinee/player/playback_session.dart';
import 'package:matinee/player/player.dart';

const itemId = '25a476af-d3df-40d1-9400-4029b6176607';
const sittingId = '110c6827-a589-4282-b61b-dfa7396b35db';

const audioOne = AudioTrack(
  index: 1,
  label: 'English',
  language: 'en',
  title: null,
  codec: 'aac',
  format: 'AAC',
  channels: 2,
  layout: 'Stereo',
  primary: true,
);
const audioTwo = AudioTrack(
  index: 4,
  label: 'German',
  language: 'de',
  title: null,
  codec: 'aac',
  format: 'AAC',
  channels: 2,
  layout: 'Stereo',
  primary: false,
);
const captions = SubtitleTrack(
  id: 'stream-6',
  label: 'English captions',
  language: 'en',
  title: null,
  forced: false,
  sdh: false,
  defaultValue: false,
  source: SubtitleSource.embedded,
  format: 'SubRip',
  delivery: SubtitleDelivery.webvtt,
);
const quality = PlaybackQualityPreset(
  id: PlaybackQuality.value720p4,
  width: 1280,
  height: 720,
  bitrate: 4000000,
);

MediaItem item(String id) => MediaItem(
  id: id,
  libraryId: 'library',
  fileTitle: 'Fallback title',
  label: ItemLabel(
    show: 'Harbour',
    showName: 'Harbour',
    year: null,
    showKey: 'harbour',
    title: id == itemId ? 'The Crossing' : 'The Return',
    untitled: false,
    episodeNumber: id == itemId ? 1 : 2,
    code: id == itemId ? 'S01E01' : 'S01E02',
    shortCode: null,
    group: '',
    groupLabel: const [],
  ),
  title: null,
  seasonNumber: 1,
  episodeNumber: id == itemId ? 1 : 2,
  episode: null,
  relativePath: 'Never displayed.mkv',
  container: 'mkv',
  mimeType: 'video/x-matroska',
  sizeBytes: 100000,
  modifiedAt: '2026-01-01T00:00:00Z',
  durationSeconds: 120,
  probe: null,
  progress: null,
  favorite: false,
);

PlaybackStart plan({
  String id = itemId,
  String method = PlaybackMethod.direct,
  String? url,
  double offset = 0,
  double start = 0,
  bool hls = false,
  AudioTrack audio = audioOne,
  SubtitleTrack? subtitle,
  String? subtitleMode,
  String? subtitleUrl,
}) => PlaybackStart(
  item: item(id),
  method: method,
  url: url ?? '/source/$method',
  hls: hls,
  offset: offset,
  start: start,
  position: offset + start,
  audio: audio,
  convertedAudio: null,
  convertedVideo: null,
  standIn: null,
  subtitle: subtitle,
  subtitleMode: subtitleMode,
  subtitleUrl: subtitleUrl,
  audioTracks: const [audioOne, audioTwo],
  subtitleTracks: const [captions],
  quality: PlaybackQuality.original,
  qualities: const [
    PlaybackQualityPreset(
      id: PlaybackQuality.value720p4,
      width: 1280,
      height: 720,
      bitrate: 4000000,
    ),
  ],
  original: true,
  reasons: const [],
  previous: null,
  next: null,
  upNextAt: null,
  segments: const [],
);

class FakePlaybackApi {
  FakePlaybackApi() {
    client = MockClient(_request);
    api = MatineeApi(
      base: Uri.parse('https://matinee.example/'),
      client: client,
    );
  }

  late final http.Client client;
  late final MatineeApi api;
  var start = (PlaybackStartInput input) =>
      _json(plan(id: input.itemId).toJson());
  var seek = (PlaybackSeekInput input) =>
      _json(const PlaybackSeek(url: '/seeked', offset: 39).toJson());
  Future<http.Response> Function(PlaybackStartInput)? pendingStart;
  Future<http.Response> Function(PlaybackReportInput)? pendingReport;
  final starts = <PlaybackStartInput>[];
  final seeks = <PlaybackSeekInput>[];
  final reports = <PlaybackReportInput>[];
  final picks = <PlaybackPickTracksInput>[];
  final subtitleRequests = <Uri>[];

  /// The presence streams asked for. A server from before presence answers
  /// 404, which is the default.
  var presenceRequests = 0;
  var presence = () => http.Response(
    jsonEncode({'code': 'NOT_FOUND', 'message': 'Not found'}),
    404,
    headers: {'Content-Type': 'application/json'},
  );

  final options = const PlaybackOptions(
    qualities: [
      PlaybackQualityPreset(
        id: PlaybackQuality.value1080p10,
        width: 1920,
        height: 1080,
        bitrate: 10000000,
      ),
      quality,
    ],
    maxBitrate: null,
    downloads: false,
    downloadVideoPresets: [],
    skipSteps: [5, 15, 30],
    videoCodecs: [],
    audioCodecs: [],
    audioLanguages: [],
    subtitleLanguages: [],
  );

  static http.Response answer(PlaybackStart result) => _json(result.toJson());

  static http.Response reject(int status, String code, {Object? data}) =>
      http.Response(
        jsonEncode({'code': code, 'message': 'Server says no', 'data': data}),
        status,
        headers: {'Content-Type': 'application/json'},
      );

  static http.Response _json(Object body) => http.Response(
    jsonEncode(body),
    200,
    headers: {'Content-Type': 'application/json'},
  );

  Future<http.Response> _request(http.Request request) async {
    final path = request.url.path;
    if (path == '/api/v1/playback/options') return _json(options.toJson());
    if (path.endsWith('/trickplay')) {
      const status = TrickplayStatusUnavailable();
      return http.Response(
        'event: message\ndata: ${jsonEncode(status.toJson())}\n\n'
        'event: done\n\n',
        200,
        headers: {'Content-Type': 'text/event-stream'},
      );
    }
    if (path == '/api/v1/playback/sessions/$sittingId/presence') {
      presenceRequests++;
      return presence();
    }
    if (path == '/caption') {
      subtitleRequests.add(request.url);
      return http.Response(
        'WEBVTT\n\n00:00:41.000 --> 00:00:45.000\n<i>Ahoy!</i>',
        200,
      );
    }
    final body = jsonDecode(request.body);
    if (path == '/api/v1/playback/start') {
      final input = PlaybackStartInput.fromJson(body);
      starts.add(input);
      final pending = pendingStart;
      return pending == null ? start(input) : await pending(input);
    }
    if (path == '/api/v1/playback/seek') {
      final input = PlaybackSeekInput.fromJson(body);
      seeks.add(input);
      return seek(input);
    }
    if (path.endsWith('/progress')) {
      final input = PlaybackReportInput.fromJson(body);
      reports.add(input);
      final pending = pendingReport;
      return pending == null ? http.Response('', 204) : await pending(input);
    }
    if (path.endsWith('/tracks')) {
      picks.add(PlaybackPickTracksInput.fromJson(body));
      return http.Response('', 204);
    }
    throw StateError('Unexpected request ${request.method} $path');
  }

  PlaybackSession session(
    FakePlayer player, {
    Duration Function()? elapsed,
    DiagnosticsRecorder? diagnostics,
  }) => PlaybackSession(
    diagnostics: diagnostics,
    itemId: itemId,
    api: api,
    httpClient: client,
    headers: const {'Authorization': 'Bearer test'},
    player: player,
    device: playbackDevice(PlayerEngine.mpv, null, 'de'),
    preferences: const PlaybackPreferences(
      audioLanguage: null,
      subtitleLanguage: null,
      subtitleMode: SubtitleMode.defaultValue,
      rememberAudio: true,
      rememberSubtitles: true,
      skipBackSeconds: 5,
      skipForwardSeconds: 30,
    ),
    sessionId: sittingId,
    elapsed: elapsed,
  );
}

typedef OpenedSource = ({
  String url,
  Map<String, String> headers,
  Duration position,
  PlayerSourceKind? kind,
  SourceTracks? tracks,
  bool autoplay,
});

class FakePlayer implements Player {
  final _updates = StreamController<PlaybackState>.broadcast();
  final opens = <OpenedSource>[];
  final trackChanges = <SourceTracks>[];

  /// The external subtitle the session set after opening, each time.
  final subtitleUrls = <String?>[];
  final seeks = <Duration>[];
  bool disposed = false;
  int pauses = 0;
  int plays = 0;

  @override
  PlaybackState state = const PlaybackState();

  @override
  Stream<PlaybackState> get states => _updates.stream;

  final _diagnostics = StreamController<wire.DiagnosticsMessage>.broadcast(
    sync: true,
  );

  @override
  Stream<wire.DiagnosticsMessage> get diagnostics => _diagnostics.stream;

  void emit(
    PlaybackPhase phase,
    double seconds, {
    bool playing = false,
    bool? wantsPlay,
    bool serverUnavailable = false,
    double? buffered,
  }) {
    state = PlaybackState(
      status: (
        phase: phase,
        playing: playing,
        // As the engines say it: buffering is mostly on the way to playing.
        wantsPlay: wantsPlay ?? (playing || phase == PlaybackPhase.buffering),
        message: null,
      ),
      timeline: (
        position: Duration(milliseconds: (seconds * 1000).round()),
        duration: const Duration(seconds: 120),
        buffered: buffered == null
            ? null
            : Duration(milliseconds: (buffered * 1000).round()),
      ),
      serverUnavailable: serverUnavailable,
    );
    _updates.add(state);
  }

  @override
  Future<void> open(
    String url, {
    Map<String, String> headers = const {},
    Duration startPosition = Duration.zero,
    PlayerSourceKind? kind,
    SourceTracks? tracks,
    bool autoplay = true,
  }) async {
    opens.add((
      url: url,
      headers: headers,
      position: startPosition,
      kind: kind,
      tracks: tracks,
      autoplay: autoplay,
    ));
    emit(
      PlaybackPhase.ready,
      startPosition.inMilliseconds / 1000,
      playing: autoplay,
    );
  }

  @override
  Future<void> pause() async {
    pauses++;
    // As both engines do: the wish goes at once, buffering or not, and what
    // has arrived stays.
    if (state.phase case PlaybackPhase.ready || PlaybackPhase.buffering) {
      emit(
        state.phase,
        state.timeline.position.inMilliseconds / 1000,
        wantsPlay: false,
        buffered: switch (state.timeline.buffered) {
          final buffered? => buffered.inMilliseconds / 1000,
          null => null,
        },
      );
    }
  }

  @override
  Future<void> play() async {
    plays++;
    emit(
      PlaybackPhase.ready,
      state.timeline.position.inMilliseconds / 1000,
      playing: true,
    );
  }

  @override
  Future<void> seekTo(Duration position) async {
    seeks.add(position);
    emit(
      PlaybackPhase.ready,
      position.inMilliseconds / 1000,
      playing: state.status.playing,
    );
  }

  @override
  Future<void> setSourceTracks(SourceTracks tracks) async =>
      trackChanges.add(tracks);

  @override
  Future<void> dispose() async {
    disposed = true;
    await _updates.close();
    await _diagnostics.close();
  }

  @override
  Future<void> setVideoViewport(Rect? bounds) async {}

  @override
  Future<void> setRate(double rate) async {}

  @override
  Future<void> selectAudioTrack(String? id) => throw UnimplementedError();

  @override
  Future<void> selectSubtitleTrack(String? id) => throw UnimplementedError();

  @override
  Future<void> setSubtitleUrl(String? url) async => subtitleUrls.add(url);

  @override
  Future<void> setVideoFit(VideoFit fit) async {}
}
