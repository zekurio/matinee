import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';

/// An account as `admin.users.list` sends it.
JsonMap adminUserJson(
  String name, {
  String role = 'user',
  int passkeys = 1,
  bool oidcLinked = false,
  int sessions = 1,
  List<JsonMap> groups = const [],
}) => {
  ...userJson(name),
  'role': role,
  'createdAt': '2026-01-01T00:00:00.000Z',
  'lastSeenAt': _at(const Duration(hours: -5, minutes: -10)),
  'passkeys': passkeys,
  'oidcLinked': oidcLinked,
  'sessions': sessions,
  'claimsSyncedAt': null,
  'access': {
    'groups': [
      {'id': 'everyone', 'name': 'Everyone', 'source': 'everyone'},
      ...groups,
    ],
    'override': {
      'libraries': null,
      'transcode': null,
      'downloads': null,
      'requests': null,
    },
    'overrideSource': 'admin',
    'fromGroups': _policy,
    'effective': _policy,
  },
};

const _policy = <String, Object?>{
  'libraries': {'all': true, 'ids': <String>[]},
  'maxBitrate': null,
  'transcode': true,
  'downloads': true,
  'requests': 'ask',
  'requestLimit': null,
  'maxStreams': null,
};

/// A time [offset] from now, so what the pages say about it holds on any
/// day the tests run.
String _at(Duration offset) =>
    DateTime.now().toUtc().add(offset).toIso8601String();

JsonMap _queue(
  String id, {
  int waiting = 0,
  bool paused = false,
  String? note,
}) => {
  'id': id,
  'name': id,
  'description': '',
  'concurrency': 2,
  'defaultConcurrency': 2,
  'maxConcurrency': 8,
  'concurrencyNote': note,
  'active': 0,
  'waiting': waiting,
  'completed': 12,
  'failed': 0,
  'paused': paused,
  'running': <Object>[],
  'failures': <Object>[],
  'retryAfterSeconds': null,
};

JsonMap _task(String id, {String? queue}) => {
  'id': id,
  'name': id,
  'description': '',
  'queue': queue,
  'startupDelaySeconds': null,
  'intervalSeconds': 86400,
  'startedAt': null,
  'progress': null,
  'lastRun': {
    'startedAt': _at(const Duration(hours: -6, minutes: -10)),
    'endedAt': _at(const Duration(hours: -6, minutes: -10, seconds: 42)),
    'result': 'completed',
    'error': null,
  },
  'nextRunAt': _at(const Duration(hours: 17, minutes: 50)),
};

/// The server's transcoding defaults, as `transcodingDefaults()` has them.
JsonMap transcodingSettingsJson() => {
  'hardwareAcceleration': 'none',
  'vaapiDevice': '/dev/dri/renderD128',
  'qsvDevice': '',
  'enableHardwareEncoding': true,
  'enableIntelLowPowerH264HwEncoder': false,
  'enableIntelLowPowerHevcHwEncoder': false,
  'hardwareDecodingCodecs': ['h264', 'vc1'],
  'enableDecodingColorDepth10Hevc': true,
  'enableDecodingColorDepth10Vp9': true,
  'enableDecodingColorDepth10HevcRext': false,
  'enableDecodingColorDepth12HevcRext': false,
  'allowHevcEncoding': false,
  'allowAv1Encoding': false,
  'encoderPreset': 'auto',
  'h264Crf': 23,
  'hevcCrf': 28,
  'enableTonemapping': false,
  'enableVppTonemapping': false,
  'enableVideoToolboxTonemapping': false,
  'tonemappingAlgorithm': 'bt2390',
  'tonemappingMode': 'auto',
  'tonemappingRange': 'auto',
  'tonemappingDesat': 0.0,
  'tonemappingPeak': 100.0,
  'tonemappingParam': 0.0,
  'vppTonemappingBrightness': 16.0,
  'vppTonemappingContrast': 1.0,
  'deinterlaceMethod': 'yadif',
  'deinterlaceDoubleRate': false,
  'downMixStereoAlgorithm': 'none',
  'downMixAudioBoost': 2.0,
  'enableAudioVbr': false,
  'enableThrottling': false,
  'throttleDelaySeconds': 180,
  'enableSegmentDeletion': false,
  'segmentKeepSeconds': 720,
};

const _off = {'tonemapx': false, 'pauseKeys': true};

/// A request the pages sent: its method, path, and JSON body.
typedef Sent = ({String method, String path, Object? body});

/// The server the admin pages talk to: libraries, users and invites,
/// jobs, and each settings page, every write recorded in [sent]. A path in
/// [refusing] answers 400 with its issues, as the server's validation
/// does, and leaves the state as it was.
final class AdminBackend {
  var libraries = <JsonMap>[
    {
      ...libraryJson('movies1', name: 'Movies', items: 120),
      'metadataProvider': 'tmdb',
    },
    {...libraryJson('shows1', name: 'Shows', items: 48), 'kind': 'shows'},
  ];

  var users = <JsonMap>[
    adminUserJson('ada', role: 'admin', sessions: 2),
    adminUserJson(
      'grace',
      groups: [
        {'id': 'family', 'name': 'Family', 'source': 'admin'},
      ],
    ),
  ];

  var invites = <JsonMap>[
    {
      'id': 'inv1',
      'label': 'For Linus',
      'createdAt': _at(const Duration(days: -1, hours: -2)),
      'expiresAt': _at(const Duration(days: 5, hours: 22)),
      'groups': <Object>[],
    },
  ];

  var queues = <JsonMap>[
    _queue('library-scan', waiting: 3),
    _queue('metadata'),
    _queue('trickplay', paused: true, note: 'Each job decodes a whole video.'),
  ];

  JsonMap trickplay = {
    'settings': {
      'enabled': true,
      'intervalSeconds': 10,
      'width': 320,
      'keyframesOnly': true,
      'hardwareDecoding': false,
    },
    'hardwareAcceleration': null,
    'videos': 240,
    'ready': 180,
  };

  JsonMap auth = {
    'passkeys': {'enabled': true, 'allowSignUp': false},
    'oidc': _oidc(),
    'defaults': {..._oidc(), 'displayName': '', 'scopes': 'openid profile'},
    'clientSecret': {'source': 'saved', 'environment': false},
    'callbackUrl': 'https://media.example.com/api/auth/oidc/callback',
    'active': true,
    'ssoOnlyUsers': 0,
    'unlinkedUsers': 1,
  };

  JsonMap branding = {
    'themeAccents': {'light': null, 'dark': null},
    'loginBackdrop': {
      'enabled': true,
      'artwork': 'mixed',
      'blur': 0,
      'fade': 0,
    },
  };

  /// Paths that answer 400 with these issues, each a field path and the
  /// server's message for it.
  final refusing = <String, List<(List<String>, String)>>{};

  /// Every write the pages sent, in order.
  final sent = <Sent>[];

  static JsonMap _oidc() => {
    'enabled': true,
    'displayName': 'Pocket ID',
    'issuerUrl': 'https://id.example.com',
    'clientId': 'matinee',
    'scopes': 'openid profile email',
    'usernameClaim': 'preferred_username',
    'nameClaim': 'name',
    'roleClaim': '',
    'groupsClaim': '',
    'policyClaim': '',
    'allowSignUp': false,
    'signOutRefused': false,
  };

  late final client = MockClient.streaming((request, body) async {
    final path = request.url.path.replaceFirst('/api/v1', '');
    final method = request.method;
    final text = await body.bytesToString();
    final input = text.isEmpty ? null : jsonDecode(text);
    if (method != 'GET') sent.add((method: method, path: path, body: input));
    if (refusing[path] case final issues? when method != 'GET') {
      return _json({
        'code': 'BAD_REQUEST',
        'status': 400,
        'message': 'Input validation failed',
        'data': {
          'issues': [
            for (final (at, message) in issues)
              {'message': message, 'path': at},
          ],
        },
      }, 400);
    }
    return _route(method, path, input);
  });

  http.StreamedResponse _route(String method, String path, Object? input) {
    final segments = path.split('/').where((part) => part.isNotEmpty).toList();
    switch ((method, segments)) {
      case ('GET', ['libraries']):
        return _json(libraries, 200);
      case ('GET', ['libraries', final id]):
        return _json(libraries.firstWhere((l) => l['id'] == id), 200);
      case ('PUT', ['libraries', final id]):
        libraries = [
          for (final library in libraries)
            // SAFETY: the editor sends the library input as a JSON object.
            library['id'] == id ? {...library, ...input! as JsonMap} : library,
        ];
        return _json(libraries.firstWhere((l) => l['id'] == id), 200);
      case ('GET', ['admin', 'browse']):
        return _json({
          'path': '/media',
          'parent': '/',
          'directories': [
            {'name': 'movies', 'path': '/media/movies'},
            {'name': 'shows', 'path': '/media/shows'},
          ],
        }, 200);
      case ('PUT', ['admin', 'users', final id, 'access']):
        return _json(users.firstWhere((u) => u['id'] == id), 200);
      case ('DELETE', ['libraries', final id]):
        libraries = [...libraries.where((l) => l['id'] != id)];
        return _json(null, 200);
      case ('POST', ['libraries', _, 'scan' || 'refresh-metadata']):
        return _json(null, 200);
      case ('GET', ['metadata', 'providers']):
        return _json([
          {
            'id': 'tmdb',
            'name': 'TMDB',
            'description': '',
            'episodes': true,
            'configured': true,
            'setup': null,
          },
        ], 200);
      case ('GET', ['auth', 'config']):
        return _json(configJson, 200);
      case ('GET', ['admin', 'users']):
        return _json(users, 200);
      case ('GET', ['admin', 'invites']):
        return _json(invites, 200);
      case ('DELETE', ['admin', 'invites', final id]):
        invites = [...invites.where((i) => i['id'] != id)];
        return _json(null, 200);
      case ('DELETE', ['admin', 'users', final id]):
        users = [...users.where((u) => u['id'] != id)];
        return _json(null, 200);
      case ('GET', ['admin', 'groups']):
        return _json([
          {
            'id': 'everyone',
            'name': 'Everyone',
            'everyone': true,
            'providerGroup': null,
            'policy': _policy,
            'members': 2,
            'createdAt': '2026-01-01T00:00:00.000Z',
          },
          {
            'id': 'family',
            'name': 'Family',
            'everyone': false,
            'providerGroup': null,
            'policy': _policy,
            'members': 1,
            'createdAt': '2026-01-01T00:00:00.000Z',
          },
        ], 200);
      case ('GET', ['playback', 'options']):
        return _json({
          'qualities': [
            {'id': '1080p', 'width': 1920, 'height': 1080, 'bitrate': 8000000},
            {'id': '720p', 'width': 1280, 'height': 720, 'bitrate': 4000000},
          ],
          'maxBitrate': null,
          'downloads': true,
          'downloadVideoPresets': <Object>[],
          'skipSteps': [10, 30],
          'videoCodecs': ['h264'],
          'audioCodecs': ['aac'],
          'audioLanguages': <Object>[],
          'subtitleLanguages': <Object>[],
        }, 200);
      case ('GET', ['admin', 'jobs']):
        return _json(_jobs, 200);
      case ('POST', ['admin', 'jobs', final id, 'clear']):
        queues = [
          for (final queue in queues)
            queue['id'] == id ? {...queue, 'waiting': 0} : queue,
        ];
        return _json(_jobs, 200);
      case ('GET', ['admin', 'transcoding']):
        return _json(_transcoding, 200);
      case ('GET', ['admin', 'trickplay']):
        return _json(trickplay, 200);
      case ('PUT', ['admin', 'trickplay']):
        trickplay = {...trickplay, 'settings': input};
        return _json(trickplay, 200);
      case ('GET', ['admin', 'auth']):
        return _json(auth, 200);
      case ('GET', ['admin', 'branding']):
        return _json(branding, 200);
      case ('PUT', ['admin', 'branding']):
        // SAFETY: the page sends the whole Branding object.
        branding = input! as JsonMap;
        return _json(branding, 200);
    }
    return http.StreamedResponse(const Stream.empty(), 404);
  }

  JsonMap get _jobs => {
    'queues': queues,
    'tasks': [
      _task('scan-libraries', queue: 'library-scan'),
      _task('clean-sessions'),
    ],
  };

  JsonMap get _transcoding => {
    'settings': transcodingSettingsJson(),
    'defaults': transcodingSettingsJson(),
    'environment': <String>[],
    'capabilities': {
      'ffmpegPath': '/usr/bin/ffmpeg',
      'version': '7.1',
      'versionNumbers': [7, 1],
      'jellyfin': true,
      'error': null,
      'detectedAt': '2026-11-20T09:00:00.000Z',
      'hwaccels': <String>[],
      'encoders': ['libx264'],
      'filters': <String>[],
      'features': {
        for (final name in [
          'tonemapx',
          'pauseKeys',
          'tonemapOpenclBt2390',
          'tonemapCudaName',
          'scaleCudaFormat',
          'overlayOpenclFrameSync',
          'overlayVaapiFrameSync',
          'hevcRemoveDovi',
          'hevcRemoveHdr10Plus',
          'av1RemoveDovi',
          'av1RemoveHdr10Plus',
          'doviRpuStrip',
          'encoderDolbyVisionOption',
        ])
          name: _off[name] ?? false,
      },
      'hardware': <Object>[],
    },
  };

  static http.StreamedResponse _json(Object? body, int status) =>
      http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(body))),
        status,
        headers: {'content-type': 'application/json'},
      );
}
