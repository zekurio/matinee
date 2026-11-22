import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../platform/player.g.dart' as wire;
import 'player.dart';
import 'player_preferences.dart';

/// Android's native decoder list is cached by the bridge.
final playbackCodecsProvider = FutureProvider<wire.CodecCapabilitiesMessage>(
  (ref) => wire.PlayerApi().codecs(),
);

/// The audio codecs mpv's FFmpeg decodes, for when settings convert some
/// of them: the profile can say every codec or a list, not every codec but
/// a few.
const _mpvAudio = [
  'aac', 'mp3', 'mp2', 'mp1', 'opus', 'vorbis', 'flac', 'alac', 'ac3', //
  'eac3', 'dts', 'truehd', 'mlp', 'wmav1', 'wmav2', 'wmapro', //
  'wmalossless', 'amr_nb', 'amr_wb', 'ape', 'wavpack', 'tta', 'cook', 'speex',
];

/// The contract's PLAYBACK_AUDIO_CODECS: what a stream may carry its audio in.
const _streamAudio = ['opus', 'aac', 'mp3', 'flac', 'alac', 'ac3', 'eac3'];

/// The passthrough formats this device plays, which settings may convert.
List<String> passthroughCodecs(wire.CodecCapabilitiesMessage? codecs) => [
  for (final codec in optionalPassthrough)
    if (codecs?.audio.contains(codec) ?? false) codec,
];

/// The codecs streams may convert audio to, of the server's: Opus where it
/// plays, and AAC.
List<String> convertAudioChoices(
  List<String> server,
  wire.CodecCapabilitiesMessage? codecs,
) => [
  for (final codec in const ['opus', 'aac'])
    if (server.contains(codec) &&
        (codec == 'aac' || (codecs?.audio.contains(codec) ?? false)))
      codec,
];

/// The codecs of the server's an encode could come in that this device
/// decodes, best last.
List<String> encodeVideoChoices(
  List<String> server,
  wire.CodecCapabilitiesMessage? codecs,
) => [
  for (final codec in TranscodeVideoCodec.all)
    if (server.contains(codec) &&
        (codecs?.video.any((decoder) => decoder.codec == codec) ?? false))
      codec,
];

/// What each engine can read after [prefs] narrowed it. The server uses this to
/// make the playback plan.
PlaybackDevice playbackDevice(
  PlayerEngine engine,
  wire.CodecCapabilitiesMessage? codecs,
  String language, {
  PlayerPrefs prefs = const PlayerPrefs(),
}) {
  final mpv = engine == PlayerEngine.mpv;
  final audio = codecs?.audio ?? const [];
  final video = codecs?.video ?? const [];
  final converted = prefs.convertAudio.where(optionalPassthrough.contains);
  // What plays as it is: what the engine decodes, less what settings convert.
  bool takes(String codec) =>
      !converted.contains(codec) && (mpv || audio.contains(codec));
  // AAC always plays, and the server converts to the first of these it encodes.
  final stream = [
    for (final codec in _streamAudio)
      if (codec == 'aac' || takes(codec)) codec,
  ];
  final firstAudio = stream.contains(prefs.audioCodec)
      ? prefs.audioCodec
      : null;
  final encodable = [
    for (final codec in TranscodeVideoCodec.all)
      if (mpv || video.any((decoder) => decoder.codec == codec)) codec,
  ];
  final firstVideo =
      prefs.videoCodec != automaticCodec && encodable.contains(prefs.videoCodec)
      ? prefs.videoCodec
      : null;
  return PlaybackDevice(
    containers: mpv
        ? const ['*']
        : const [
            'mkv',
            'webm',
            'mp4',
            'm4v',
            'mov',
            'ts',
            'mpegts',
            'flv',
            'ogv',
            'ogg',
            'avi',
          ],
    video: mpv
        ? const [
            PlaybackDecoder(
              codec: '*',
              maxWidth: null,
              maxHeight: null,
              maxBitDepth: null,
              profiles: null,
              maxLevel: null,
              hdr: null,
              dolbyVisionProfiles: null,
            ),
          ]
        : [
            for (final decoder in video)
              ..._decoderLimits(decoder, codecs?.dolbyVision ?? false),
          ],
    audio: switch ((mpv, converted.isEmpty)) {
      (true, true) => const ['*'],
      (true, false) => [..._mpvAudio.where(takes), 'pcm_*'],
      (false, _) => [...audio.where(takes), 'pcm_*'],
    },
    streamAudio: [?firstAudio, ...stream.where((codec) => codec != firstAudio)],
    // H.264 plays everywhere, so it comes right after the codec settings ask for.
    encodeVideo: {?firstVideo, TranscodeVideoCodec.h264, ...encodable}.toList(),
    hls: true,
    selectAudio: true,
    subtitles: const [PlaybackSubtitleDelivery.webvtt],
    sidecarSubtitles: mpv ? const [PlaybackSubtitleDelivery.pgs] : const [],
    embeddedSubtitles: [
      'PGS',
      'VobSub',
      'DVB',
      if (mpv) ...['ASS', 'SSA'],
    ],
    language: language.isEmpty ? 'en' : language,
  );
}

Iterable<PlaybackDecoder> _decoderLimits(
  wire.VideoDecoderMessage decoder,
  bool dolbyVision,
) {
  // Width and height are coupled. A decoder can fit the widest or tallest
  // rectangle it reported, but may not fit both maxima in the same frame.
  final sizes = {decoder.widest, decoder.tallest}..remove(null);
  return [
    for (final size in sizes.isEmpty ? {null} : sizes)
      PlaybackDecoder(
        codec: decoder.codec,
        maxWidth: size?.width.toDouble(),
        maxHeight: size?.height.toDouble(),
        maxBitDepth: decoder.tenBit ? 10 : 8,
        profiles: null,
        maxLevel: null,
        hdr: null,
        dolbyVisionProfiles: dolbyVision
            ? null
            : const [0, 1, 2, 3, 4, 6, 7, 8, 9, 10],
      ),
  ];
}
