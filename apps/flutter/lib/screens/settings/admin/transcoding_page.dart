import 'dart:async';

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../../api/matinee_api.dart';
import '../../../core/field_errors.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../l10n/server_text.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// How the server transcodes video, as the web's transcoding panel: what its
/// ffmpeg and GPUs can do, the acceleration and its decoders, what encodes
/// produce, tone mapping, deinterlacing, audio, and throttling. The fields save
/// together from the save bar. The server checks every value and says at the
/// field what's wrong with one; the page only needs a number to be a number
/// before it can send it.
class TranscodingPage extends ConsumerWidget {
  const TranscodingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final data = ref.watch(transcodingProvider);
    final saved = data.value;
    if (saved == null) {
      return AdminPage(
        title: l.settingsAdminTranscoding,
        child: adminBody(
          context,
          data,
          onRetry: () => ref.invalidate(transcodingProvider),
          loaded: (_) => const SizedBox(),
        ),
      );
    }
    // A save or a detection brings the settings back as the server has
    // them, and the form starts again from there.
    return _TranscodingForm(key: ObjectKey(saved), saved: saved);
  }
}

/// The video codecs' names as people know them.
String _codecName(String codec) => switch (codec) {
  'h264' => 'H.264',
  'hevc' => 'HEVC',
  'mpeg2video' => 'MPEG-2',
  'mpeg4' => 'MPEG-4',
  'vc1' => 'VC-1',
  'vp8' => 'VP8',
  'vp9' => 'VP9',
  'av1' => 'AV1',
  _ => codec.toUpperCase(),
};

class _TranscodingForm extends ConsumerStatefulWidget {
  const _TranscodingForm({super.key, required this.saved});

  final AdminTranscodingSettings saved;

  @override
  ConsumerState<_TranscodingForm> createState() => _TranscodingFormState();
}

class _TranscodingFormState extends ConsumerState<_TranscodingForm> {
  /// The settings as JSON, every field written, for the fields to edit by
  /// name.
  late final JsonMap _original = widget.saved.settings.toJson();
  late JsonMap _draft = {..._original};

  /// What each number field holds while it isn't a number yet.
  var _typed = <String, String>{};
  Map<String, String> _errors = const {};
  bool _detecting = false;

  bool get _dirty =>
      _typed.isNotEmpty ||
      _original.keys.any((key) {
        final (a, b) = (_original[key], _draft[key]);
        return a is List && b is List ? !listEquals(a, b) : a != b;
      });

  bool _bool(String key) => _draft[key] == true;
  String _text(String key) => switch (_draft[key]) {
    final String text => text,
    _ => '',
  };

  void _set(String key, Object? value) => setState(() {
    _draft = {..._draft, key: value};
    _errors = {..._errors}..remove(key);
  });

  Future<void> _save() async {
    final api = ref.read(apiProvider);
    if (api == null) return;
    setState(() => _errors = const {});
    try {
      await api.admin.transcoding.update(TranscodingSettings.fromJson(_draft));
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _errors = fieldErrors(AppLocalizations.of(context), error),
        );
      }
      rethrow;
    }
    if (mounted) ref.invalidate(transcodingProvider);
  }

  Future<void> _detect() async {
    final api = ref.read(apiProvider);
    if (api == null || _detecting) return;
    setState(() => _detecting = true);
    final l = AppLocalizations.of(context);
    await runAction(ref, l, api.admin.transcoding.detect);
    if (!mounted) return;
    setState(() => _detecting = false);
    ref.invalidate(transcodingProvider);
  }

  Widget _switch(String key, String title) => SwitchRow(
    title: title,
    checked: _bool(key),
    onChanged: (on) => _set(key, on),
  );

  Widget _pick(String key, String title, List<(String, String)> options) =>
      PickerRow<String>(
        title: title,
        options: options,
        current: _text(key),
        onPicked: (value) => _set(key, value),
      );

  /// A number field. Whether it takes only whole numbers comes from the
  /// value the server sent; how big it may be, the server says on a save.
  Widget _number(String key, String title, {String? hint}) {
    final l = AppLocalizations.of(context);
    final whole = _original[key] is int;
    final format = NumberFormat('0.######', l.localeName);
    final shown = switch (_draft[key]) {
      final num value => format.format(value),
      _ => '',
    };
    return TextRow(
      label: title,
      value: _typed[key] ?? shown,
      hint: hint,
      keyboardType: TextInputType.numberWithOptions(decimal: !whole),
      error: _typed.containsKey(key) ? l.adminEnterNumber : _errors[key],
      onChanged: (input) {
        final text = input.trim().replaceAll(',', '.');
        final value = num.tryParse(text);
        final fits =
            value != null && (!whole || value == value.roundToDouble());
        setState(() {
          if (fits) {
            _typed = {..._typed}..remove(key);
            _draft = {..._draft, key: whole ? value.round() : value.toDouble()};
            _errors = {..._errors}..remove(key);
          } else {
            _typed = {..._typed, key: input};
          }
        });
      },
    );
  }

  Widget _textField(String key, String title, {String? placeholder}) => TextRow(
    label: title,
    value: _text(key),
    placeholder: placeholder,
    error: _errors[key],
    onChanged: (value) => _set(key, value),
  );

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final saved = widget.saved;
    final capabilities = saved.capabilities;
    final acceleration = _text('hardwareAcceleration');
    final hardware = acceleration != HardwareAcceleration.none;
    final intel =
        acceleration == HardwareAcceleration.qsv ||
        acceleration == HardwareAcceleration.vaapi;
    String auto(String value) =>
        value == 'auto' ? l.webTranscodingAuto : value.toUpperCase();
    final codecs = switch (_draft['hardwareDecodingCodecs']) {
      final List<Object?> list => [
        for (final codec in list)
          if (codec is String) codec,
      ],
      _ => const <String>[],
    };
    // The codecs the server has a say on: its defaults and what's saved.
    final decodable = {
      ...saved.defaults.hardwareDecodingCodecs,
      ...saved.settings.hardwareDecodingCodecs,
    };
    final deviceFailure = _deviceFailure(l, capabilities, acceleration);
    return SaveBarPage(
      title: l.settingsAdminTranscoding,
      dirty: _dirty,
      canSave: _typed.isEmpty,
      onReset: () => setState(() {
        _draft = {..._original};
        _typed = {};
        _errors = const {};
      }),
      onSave: _save,
      child: AdminSections(
        bottom: !_dirty,
        sections: [
          _Ffmpeg(
            capabilities: capabilities,
            detecting: _detecting,
            onDetect: () => unawaited(_detect()),
          ),
          SettingsSection(
            title: l.webTranscodingHardwareTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Panel(
                  rows: [
                    _pick(
                      'hardwareAcceleration',
                      l.webTranscodingHardwareAcceleration,
                      [
                        for (final id in HardwareAcceleration.all)
                          (id, _accelerationName(l, id)),
                      ],
                    ),
                    if (acceleration == HardwareAcceleration.vaapi)
                      _textField(
                        'vaapiDevice',
                        l.webTranscodingFieldVaapiDevice,
                        placeholder: saved.defaults.vaapiDevice,
                      ),
                    if (acceleration == HardwareAcceleration.qsv)
                      _textField(
                        'qsvDevice',
                        l.webTranscodingFieldQsvDevice,
                        placeholder: saved.defaults.qsvDevice,
                      ),
                    if (hardware)
                      _switch(
                        'enableHardwareEncoding',
                        l.webTranscodingHardwareEncoding,
                      ),
                    // Intel's low-power encoders, on QSV and on VAAPI.
                    if (intel) ...[
                      _switch(
                        'enableIntelLowPowerH264HwEncoder',
                        l.webTranscodingHardwareLowPower('H.264'),
                      ),
                      _switch(
                        'enableIntelLowPowerHevcHwEncoder',
                        l.webTranscodingHardwareLowPower('HEVC'),
                      ),
                    ],
                  ],
                ),
                if (deviceFailure != null) Note(deviceFailure, danger: true),
              ],
            ),
          ),
          if (hardware)
            SettingsSection(
              title: l.webTranscodingDecodingTitle,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 12,
                children: [
                  if (decodable.isNotEmpty)
                    Panel(
                      rows: [
                        for (final codec in decodable)
                          SwitchRow(
                            title: _codecName(codec),
                            checked: codecs.contains(codec),
                            onChanged: (on) => _set('hardwareDecodingCodecs', [
                              for (final kept in codecs)
                                if (kept != codec) kept,
                              if (on) codec,
                            ]),
                          ),
                      ],
                    ),
                  Panel(
                    rows: [
                      _switch(
                        'enableDecodingColorDepth10Hevc',
                        l.webTranscodingDecodingHevc10,
                      ),
                      _switch(
                        'enableDecodingColorDepth10Vp9',
                        l.webTranscodingDecodingVp910,
                      ),
                      _switch(
                        'enableDecodingColorDepth10HevcRext',
                        l.webTranscodingDecodingHevcRext,
                      ),
                      _switch(
                        'enableDecodingColorDepth12HevcRext',
                        l.webTranscodingDecodingHevcRext12,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          SettingsSection(
            title: l.webTranscodingEncodingTitle,
            child: Panel(
              rows: [
                _switch('allowHevcEncoding', l.webTranscodingEncodingHevc),
                _switch('allowAv1Encoding', l.webTranscodingEncodingAv1),
                _pick('encoderPreset', l.webTranscodingEncodingPreset, [
                  for (final preset in EncoderPreset.all)
                    (
                      preset,
                      preset == EncoderPreset.auto
                          ? l.webTranscodingAuto
                          : preset,
                    ),
                ]),
                _number(
                  'h264Crf',
                  l.webTranscodingFieldH264Crf,
                  hint: l.webTranscodingNumberH264Crf,
                ),
                _number(
                  'hevcCrf',
                  l.webTranscodingFieldHevcCrf,
                  hint: l.webTranscodingNumberHevcCrf,
                ),
              ],
            ),
          ),
          SettingsSection(
            title: l.webTranscodingToneMappingTitle,
            child: Panel(
              rows: [
                _switch(
                  'enableTonemapping',
                  l.webTranscodingToneMappingHardware,
                ),
                if (intel)
                  _switch(
                    'enableVppTonemapping',
                    l.webTranscodingToneMappingVpp,
                  ),
                if (acceleration == HardwareAcceleration.videotoolbox)
                  _switch(
                    'enableVideoToolboxTonemapping',
                    l.webTranscodingToneMappingVideoToolbox,
                  ),
                _pick(
                  'tonemappingAlgorithm',
                  l.webTranscodingToneMappingAlgorithm,
                  [
                    for (final id in TonemapAlgorithm.all)
                      (id, _algorithmName(l, id)),
                  ],
                ),
                _pick('tonemappingMode', l.webTranscodingToneMappingMode, [
                  for (final id in TonemapMode.all) (id, auto(id)),
                ]),
                _pick('tonemappingRange', l.webTranscodingToneMappingRange, [
                  for (final id in TonemapRange.all) (id, auto(id)),
                ]),
                _number(
                  'tonemappingDesat',
                  l.webTranscodingFieldTonemappingDesat,
                  hint: l.webTranscodingNumberTonemappingDesat,
                ),
                _number(
                  'tonemappingPeak',
                  l.webTranscodingFieldTonemappingPeak,
                  hint: l.webTranscodingNumberTonemappingPeak,
                ),
                _number(
                  'tonemappingParam',
                  l.webTranscodingFieldTonemappingParam,
                  hint: l.webTranscodingNumberTonemappingParam,
                ),
                if (intel && _bool('enableVppTonemapping')) ...[
                  _number(
                    'vppTonemappingBrightness',
                    l.webTranscodingFieldVppTonemappingBrightness,
                    hint: l.webTranscodingNumberVppTonemappingBrightness,
                  ),
                  _number(
                    'vppTonemappingContrast',
                    l.webTranscodingFieldVppTonemappingContrast,
                    hint: l.webTranscodingNumberVppTonemappingContrast,
                  ),
                ],
              ],
            ),
          ),
          SettingsSection(
            title: l.webTranscodingDeinterlacingTitle,
            child: Panel(
              rows: [
                _pick(
                  'deinterlaceMethod',
                  l.webTranscodingDeinterlacingMethod,
                  [for (final id in DeinterlaceMethod.all) (id, id)],
                ),
                _switch(
                  'deinterlaceDoubleRate',
                  l.webTranscodingDeinterlacingDoubleRate,
                ),
              ],
            ),
          ),
          SettingsSection(
            title: l.webTranscodingAudioTitle,
            child: Panel(
              rows: [
                _pick('downMixStereoAlgorithm', l.webTranscodingAudioDownmix, [
                  for (final id in DownmixAlgorithm.all)
                    (id, _downmixName(l, id)),
                ]),
                _number(
                  'downMixAudioBoost',
                  l.webTranscodingFieldDownMixAudioBoost,
                  hint: l.webTranscodingNumberDownMixAudioBoost,
                ),
                _switch('enableAudioVbr', l.webTranscodingAudioVbr),
              ],
            ),
          ),
          SettingsSection(
            title: l.webTranscodingSegmentsTitle,
            child: Panel(
              rows: [
                _switch('enableThrottling', l.webTranscodingSegmentsThrottle),
                if (_bool('enableThrottling'))
                  _number(
                    'throttleDelaySeconds',
                    l.webTranscodingFieldThrottleDelaySeconds,
                    hint: l.webTranscodingNumberThrottleDelaySeconds,
                  ),
                _switch(
                  'enableSegmentDeletion',
                  l.webTranscodingSegmentsDelete,
                ),
                if (_bool('enableSegmentDeletion'))
                  _number(
                    'segmentKeepSeconds',
                    l.webTranscodingFieldSegmentKeepSeconds,
                    hint: l.webTranscodingNumberSegmentKeepSeconds,
                  ),
              ],
            ),
          ),
          // What the server said about a field this page doesn't show.
          if (_errors.keys.where((key) => !_draft.containsKey(key)).firstOrNull
              case final key?)
            Note(_errors[key]!, danger: true),
        ],
      ),
    );
  }
}

/// What the server's ffmpeg is, when it was looked at, and looking again.
class _Ffmpeg extends StatelessWidget {
  const _Ffmpeg({
    required this.capabilities,
    required this.detecting,
    required this.onDetect,
  });

  final TranscodingCapabilities capabilities;
  final bool detecting;
  final VoidCallback onDetect;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final version = switch (capabilities.version) {
      final version? when version.trim().isNotEmpty => version,
      _ => l.webTranscodingFfmpegUnknownVersion,
    };
    final error = switch (capabilities.error) {
      final error? when error.trim().isNotEmpty => error,
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Panel(
          rows: [
            InfoRow(
              icon: Lucide.film,
              title: 'ffmpeg',
              lines: [
                if (error == null)
                  l.webTranscodingFfmpegDetected(
                    version,
                    relativeText(l, capabilities.detectedAt),
                  ),
              ],
            ),
            LinkRow(
              icon: Lucide.refreshCw,
              title: detecting
                  ? l.webTranscodingFfmpegDetecting
                  : l.webTranscodingFfmpegDetect,
              onPressed: detecting ? null : onDetect,
            ),
          ],
        ),
        if (error != null) ...[
          Note(l.webTranscodingFfmpegFailed, danger: true),
          Note(error.serverWords(l)),
        ],
      ],
    );
  }
}

/// Why the chosen GPU won't be used, when detection says its device
/// didn't open or the build lacks it.
String? _deviceFailure(
  AppLocalizations l,
  TranscodingCapabilities capabilities,
  String acceleration,
) {
  if (acceleration == HardwareAcceleration.none) return null;
  for (final entry in capabilities.hardware) {
    if (entry.acceleration != acceleration) continue;
    if (entry.device.status == CheckStatus.ok) return null;
    return switch (entry.device.error) {
      final error? => l.webTranscodingHardwareDeviceFailedDetail(
        error.serverWords(l),
      ),
      null => l.webTranscodingHardwareDeviceFailed,
    };
  }
  return l.webTranscodingHardwareNotInBuild;
}

String _accelerationName(AppLocalizations l, String id) => switch (id) {
  HardwareAcceleration.vaapi => l.webTranscodingAccelerationVaapi,
  HardwareAcceleration.qsv => l.webTranscodingAccelerationQsv,
  HardwareAcceleration.nvenc => l.webTranscodingAccelerationNvenc,
  HardwareAcceleration.videotoolbox => l.webTranscodingAccelerationVideotoolbox,
  _ => l.webTranscodingAccelerationNone,
};

String _algorithmName(AppLocalizations l, String id) => switch (id) {
  TonemapAlgorithm.clip => l.webTranscodingAlgorithmClip,
  TonemapAlgorithm.linear => l.webTranscodingAlgorithmLinear,
  TonemapAlgorithm.gamma => l.webTranscodingAlgorithmGamma,
  TonemapAlgorithm.reinhard => l.webTranscodingAlgorithmReinhard,
  TonemapAlgorithm.hable => l.webTranscodingAlgorithmHable,
  TonemapAlgorithm.mobius => l.webTranscodingAlgorithmMobius,
  TonemapAlgorithm.bt2390 => l.webTranscodingAlgorithmBt2390,
  _ => l.webTranscodingAlgorithmNone,
};

String _downmixName(AppLocalizations l, String id) => switch (id) {
  DownmixAlgorithm.dave750 => l.webTranscodingDownmixDave750,
  DownmixAlgorithm.nightmodeDialogue =>
    l.webTranscodingDownmixNightmodeDialogue,
  DownmixAlgorithm.rfc7845 => l.webTranscodingDownmixRfc7845,
  DownmixAlgorithm.ac4 => l.webTranscodingDownmixAc4,
  _ => l.webTranscodingDownmixNone,
};
