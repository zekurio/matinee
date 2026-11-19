import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../kit/kit.dart';

import 'player.dart';
import 'player_providers.dart';
import 'video_view.dart';

// Debug-only screen for trying the native players by hand, at
// Routes.playerLab in debug builds. Not translated, not for users.

const _hls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

// Two audio tracks (MP3, AAC) and two SubRip subtitles (English, Japanese).
const _mkv = 'https://samples.ffmpeg.org/Matroska/multiple_tracks.mkv';

const _rates = [0.5, 1.0, 1.5, 2.0];

class PlayerLab extends ConsumerStatefulWidget {
  const PlayerLab({super.key});

  @override
  ConsumerState<PlayerLab> createState() => _PlayerLabState();
}

class _PlayerLabState extends ConsumerState<PlayerLab> {
  PlayerEngine _engine = PlayerEngine.mpv;
  VideoFit _fit = VideoFit.contain;
  double _rate = 1;
  final TextEditingController _subtitleUrl = TextEditingController();
  String? _commandError;

  @override
  void dispose() {
    _subtitleUrl.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() command) async {
    try {
      await command();
      if (mounted && _commandError != null) {
        setState(() => _commandError = null);
      }
    } on Exception catch (failure) {
      if (mounted) setState(() => _commandError = failure.toString());
    }
  }

  void _chooseEngine(PlayerEngine? engine) {
    if (engine == null || engine == _engine) return;
    setState(() {
      _engine = engine;
      _rate = 1;
      _commandError = null;
    });
    // The other player takes over when its source opens. Its fit is set now
    // so that the first picture already has it.
    unawaited(_run(() => ref.read(playerProvider(engine)).setVideoFit(_fit)));
  }

  @override
  Widget build(BuildContext context) {
    final player = ref.watch(playerProvider(_engine));
    final state =
        ref.watch(playbackStateProvider(player)).value ?? player.state;
    final colors = MatineeTheme.of(context);
    return SafeArea(
      child: Column(
        children: [
          Expanded(child: VideoView(player: player)),
          Flexible(
            child: ColoredBox(
              color: colors.surface,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(12),
                child: _controls(player, state),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _controls(Player player, PlaybackState state) {
    final (:phase, :playing, :message) = state.status;
    final (:position, :duration, :buffered) = state.timeline;
    final video = state.video;
    final enabled = state.isOpen;
    final colors = MatineeTheme.of(context);
    final dim = KitText.xs.style(color: colors.mutedForeground);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        _row([
          _button('Back', () => GoRouter.of(context).pop()),
          _button('Play HLS', () => _run(() => player.open(_hls))),
          _button('Play MKV', () => _run(() => player.open(_mkv))),
        ]),
        _choices('Engine', [
          for (final engine in PlayerEngine.values)
            ChoiceChip(
              label: engine.name,
              selected: engine == _engine,
              onPressed: () => _chooseEngine(engine),
            ),
        ]),
        _row([
          _button(
            playing ? 'Pause' : 'Play',
            enabled ? () => _run(playing ? player.pause : player.play) : null,
          ),
          _button(
            '−10 s',
            enabled
                ? () => _run(
                    () => player.seekTo(
                      seekTarget(state.timeline, const Duration(seconds: -10)),
                    ),
                  )
                : null,
          ),
          _button(
            '+10 s',
            enabled
                ? () => _run(
                    () => player.seekTo(
                      seekTarget(state.timeline, const Duration(seconds: 10)),
                    ),
                  )
                : null,
          ),
        ]),
        _choices('Fit', [
          for (final fit in VideoFit.values)
            ChoiceChip(
              label: fit.name,
              selected: fit == _fit,
              onPressed: () {
                setState(() => _fit = fit);
                unawaited(_run(() => player.setVideoFit(fit)));
              },
            ),
        ]),
        _choices('Rate', [
          for (final rate in _rates)
            ChoiceChip(
              label: '$rate×',
              selected: rate == _rate,
              onPressed: enabled
                  ? () {
                      setState(() => _rate = rate);
                      unawaited(_run(() => player.setRate(rate)));
                    }
                  : null,
            ),
        ]),
        _trackPicker('Audio', state.tracks.audio, player.selectAudioTrack),
        _trackPicker(
          'Subtitles',
          state.tracks.subtitles,
          player.selectSubtitleTrack,
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          spacing: 8,
          children: [
            Expanded(
              child: MatineeTextField(
                controller: _subtitleUrl,
                label: 'Sidecar subtitle URL',
                keyboardType: TextInputType.url,
              ),
            ),
            _button(
              'Apply',
              enabled
                  ? () => _run(() {
                      final url = _subtitleUrl.text.trim();
                      return player.setSubtitleUrl(url.isEmpty ? null : url);
                    })
                  : null,
            ),
          ],
        ),
        Text(
          '${state.engine?.name ?? 'no engine'} · ${phase.name} · '
          '${playing ? 'playing' : 'not playing'}',
        ),
        Text(
          '${_time(position)} / ${_time(duration)} · '
          'buffered ${_time(buffered)}',
          style: dim,
        ),
        if (video != null)
          Text(
            '${video.width}×${video.height} · '
            '${video.frameRate?.toStringAsFixed(2) ?? '?'} fps',
            style: dim,
          ),
        if (message != null) Text(message, style: dim),
        if (_commandError case final failure?)
          Text(failure, style: KitText.xs.style(color: colors.danger)),
      ],
    );
  }

  Widget _button(String label, VoidCallback? onPressed) => MatineeButton(
    look: ButtonLook.outline,
    size: ButtonSize.sm,
    onPressed: onPressed,
    child: Text(label),
  );

  Widget _row(List<Widget> children) =>
      Wrap(spacing: 8, runSpacing: 8, children: children);

  Widget _choices(String label, List<Widget> chips) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 76,
        child: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(label),
        ),
      ),
      Expanded(child: _row(chips)),
    ],
  );

  Widget _trackPicker(
    String label,
    List<MediaTrack> tracks,
    Future<void> Function(String?) select,
  ) {
    final selected = tracks.where((track) => track.selected).firstOrNull;
    final pick = tracks.isEmpty
        ? null
        : (String? id) =>
              () => unawaited(_run(() => select(id)));
    return _choices(label, [
      ChoiceChip(
        label: 'Off',
        selected: selected == null,
        onPressed: pick?.call(null),
      ),
      for (final track in tracks)
        ChoiceChip(
          label: trackLabel(track),
          selected: track.id == selected?.id,
          onPressed: pick?.call(track.id),
        ),
    ]);
  }

  String _time(Duration? duration) => duration == null
      ? 'unknown'
      : '${(duration.inMilliseconds / 1000).toStringAsFixed(1)} s';
}

/// A track as one line: its name, language, codec, and flags.
String trackLabel(MediaTrack track) => [
  track.title ?? track.language ?? 'Track ${track.id}',
  if (track.title != null && track.language != null) track.language!,
  if (track.codec != null) track.codec!,
  if (track.isDefault) 'default',
  if (track.isForced) 'forced',
].join(' · ');
