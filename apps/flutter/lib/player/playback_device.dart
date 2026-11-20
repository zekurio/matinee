import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../platform/player.g.dart' as wire;
import 'player.dart';

/// Android's native decoder list is cached by the bridge.
final playbackCodecsProvider = FutureProvider<wire.CodecCapabilitiesMessage>(
  (ref) => wire.PlayerApi().codecs(),
);

/// What each engine can read. The server uses this to make the playback plan.
PlaybackDevice playbackDevice(
  PlayerEngine engine,
  wire.CodecCapabilitiesMessage? codecs,
  String language,
) {
  final mpv = engine == PlayerEngine.mpv;
  final audio = codecs?.audio ?? const [];
  final video = codecs?.video ?? const [];
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
    audio: mpv ? const ['*'] : [...audio, 'pcm_*'],
    streamAudio: [
      for (final codec in const [
        'opus',
        'aac',
        'mp3',
        'flac',
        'alac',
        'ac3',
        'eac3',
      ])
        if (mpv || audio.contains(codec)) codec,
    ],
    encodeVideo: [
      for (final codec in TranscodeVideoCodec.all)
        if (mpv || video.any((decoder) => decoder.codec == codec)) codec,
    ],
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
