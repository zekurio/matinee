import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/app_log.dart';
import '../../core/device.dart';
import '../../core/display_names.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../downloads/downloads.dart' show playbackOptionsProvider;
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../player/playback_device.dart';
import '../../player/playback_report.dart';
import '../../player/player.dart' show PlayerEngine;
import '../../player/player_preferences.dart';
import '../../player/player_system.dart';
import '../../player/subtitle_look.dart';
import '../../router.dart' show Routes;
import '../settings/account_page.dart'
    show accountSessionsProvider, sessionName;
import '../settings/devices.dart';
import '../settings/playback_page.dart'
    show
        audioFormatName,
        playbackQualityChoices,
        playbackQualityLimitText,
        shownQuality,
        videoCodecName;
import '../settings/playback_report_section.dart' show diagnosticsStatus;
import '../settings/subtitles_page.dart'
    show subtitleBackgroundLabel, subtitleColorLabel, subtitleEdgeLabel;
import '../sign_in/server_switcher.dart' show withoutScheme;
import '../sign_in/tv/tv_servers.dart';
import 'tv_sign_out.dart';

/// Settings' categories on a TV, as the Kotlin app's `TvSettingsCategory`,
/// by the keys of `Routes.settingsPage`.
enum TvSettingsCategory {
  playback('playback', Lucide.tvPlay),
  subtitles('subtitles', Lucide.captions),
  languages('languages', Lucide.audioLines),
  devices('account', Lucide.monitor),
  account('server', Lucide.userRound),
  about('about', Lucide.info);

  const TvSettingsCategory(this.key, this.icon);

  final String key;
  final String icon;

  String title(AppLocalizations l) => switch (this) {
    playback => l.settingsPagePlayback,
    subtitles => l.settingsSubtitlesTitle,
    languages => l.playbackLanguagesTitle,
    devices => l.tvSettingsDevices,
    account => l.tvSettingsAccount,
    about => l.aboutTitle,
  };

  static TvSettingsCategory of(String? key) {
    for (final category in values) {
      if (category.key == key) return category;
    }
    return playback;
  }
}

/// The categories' column, its highlight starting where every TV page's
/// content does, clear of the rail's focus ring; the Kotlin app has it a
/// list item's inset further left, almost against the cog. Wide enough
/// for the longest German name, with little room after it.
const _categoryWidth = 224.0;

/// Between the categories' highlight and the rows' highlight.
const _categoryGap = 32.0;

/// Where rows start under the top, clear of the clock.
const _rowsTop = Overscan.vertical + 60;

/// A picker's value for null, which the panel can't return as a pick.
const _none = '';

/// Settings on a TV, as Google TV's own and the Kotlin app's
/// `TvSettingsScreen`: the categories on the left, the focused one's rows
/// on the right. Focusing a category shows its rows; Right or Select goes
/// into them, Left or Back comes out to the category again. Choices open
/// in the panel at the right edge, switches flip in place. [initial] picks
/// the category to start on, by its key.
class TvSettingsScreen extends ConsumerStatefulWidget {
  const TvSettingsScreen({super.key, this.initial});

  final String? initial;

  @override
  ConsumerState<TvSettingsScreen> createState() => _TvSettingsScreenState();
}

class _TvSettingsScreenState extends ConsumerState<TvSettingsScreen> {
  late var _selected = TvSettingsCategory.of(widget.initial);
  final _categories = {
    for (final category in TvSettingsCategory.values)
      category: FocusNode(debugLabel: 'category/${category.key}'),
  };
  final _rows = FocusScopeNode(debugLabel: 'settings rows');
  final _scroll = ScrollController();
  var _inRows = false;

  @override
  void initState() {
    super.initState();
    _rows.addListener(_rowsFocus);
  }

  @override
  void dispose() {
    for (final node in _categories.values) {
      node.dispose();
    }
    _rows
      ..removeListener(_rowsFocus)
      ..dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _rowsFocus() {
    if (_rows.hasFocus != _inRows) setState(() => _inRows = _rows.hasFocus);
  }

  void _toCategory() => _categories[_selected]!.requestFocus();

  /// Into the rows: the first, once the category's rows are there, which
  /// is after the next frame when Select has just changed the category.
  void _toRows() {
    void focus() {
      if (!mounted) return;
      if (_scroll.hasClients) _scroll.jumpTo(0);
      _rows.traversalDescendants.firstOrNull?.requestFocus();
    }

    WidgetsBinding.instance
      ..addPostFrameCallback((_) => focus())
      ..scheduleFrame();
  }

  KeyEventResult _categoryKey(KeyEvent event) {
    if (event is! KeyDownEvent ||
        event.logicalKey != LogicalKeyboardKey.arrowRight) {
      return KeyEventResult.ignored;
    }
    _toRows();
    return KeyEventResult.handled;
  }

  KeyEventResult _rowsKey(FocusNode node, KeyEvent event) {
    if (event.logicalKey != LogicalKeyboardKey.arrowLeft) {
      return KeyEventResult.ignored;
    }
    if (event is KeyDownEvent) _toCategory();
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return PopScope(
      canPop: !_inRows,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _inRows) _toCategory();
      },
      child: Padding(
        padding: const EdgeInsetsDirectional.only(
          start: TvPage.start,
          end: TvPage.end,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: _categoryWidth,
              child: Padding(
                padding: const EdgeInsets.only(top: Overscan.vertical + 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 6,
                  children: [
                    Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: TvListItems.inset,
                        bottom: 22,
                      ),
                      child: Text(
                        l.shellSettings,
                        style: TvType.headline.style(color: colors.foreground),
                      ),
                    ),
                    for (final category in TvSettingsCategory.values)
                      Focus(
                        canRequestFocus: false,
                        skipTraversal: true,
                        onKeyEvent: (_, event) => _categoryKey(event),
                        child: TvListItem(
                          title: category.title(l),
                          icon: category.icon,
                          quiet: true,
                          selected: category == _selected,
                          autofocus: category == _selected,
                          focusNode: _categories[category],
                          onFocusChange: (focused) {
                            if (focused && _selected != category) {
                              setState(() => _selected = category);
                            }
                          },
                          onPressed: () {
                            setState(() => _selected = category);
                            _toRows();
                          },
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: _categoryGap),
            Expanded(
              child: Padding(
                // Rows scroll under a fixed top, so they never pass behind
                // the clock.
                padding: const EdgeInsets.only(top: _rowsTop),
                child: FocusScope(
                  node: _rows,
                  onKeyEvent: _rowsKey,
                  child: TvFollowFocus(
                    controller: _scroll,
                    rule: TvFollowFocus.clear(start: 8, end: 24),
                    child: ListView(
                      // A new category starts its rows afresh, at the top.
                      key: ValueKey(_selected),
                      controller: _scroll,
                      clipBehavior: Clip.none,
                      padding: const EdgeInsets.only(
                        top: 4,
                        bottom: Overscan.vertical + 24,
                      ),
                      children: switch (_selected) {
                        TvSettingsCategory.playback => [const _PlaybackRows()],
                        TvSettingsCategory.subtitles => [const _SubtitleRows()],
                        TvSettingsCategory.languages => [const _LanguageRows()],
                        TvSettingsCategory.devices => [const _DeviceRows()],
                        TvSettingsCategory.account => [const _AccountRows()],
                        TvSettingsCategory.about => [const _AboutRows()],
                      },
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A column of a category's rows, 4 apart.
class _Rows extends StatelessWidget {
  const _Rows(this.children);

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 4,
    children: children,
  );
}

/// A choice among [options], its value at the row's end, picked in the
/// panel at the right edge.
class _PickRow<T> extends StatelessWidget {
  const _PickRow({
    super.key,
    required this.title,
    required this.options,
    required this.current,
    required this.onPick,
    this.description,
  });

  final String title;
  final List<(T, String)> options;
  final T current;
  final String? description;
  final ValueChanged<T> onPick;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final value = options
        .where((option) => option.$1 == current)
        .map((option) => option.$2)
        .firstOrNull;
    return TvListItem(
      title: title,
      subtitle: description,
      quiet: true,
      trailing: TvListValue(value ?? l.settingsUnknownValue),
      onPressed: () async {
        final picked = await showTvPicker<T>(
          context,
          title: title,
          description: description,
          current: current,
          options: [for (final (v, label) in options) TvOption(v, label)],
        );
        if (picked != null) onPick(picked);
      },
    );
  }
}

/// On or off, flipped in place by Select.
class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.title,
    required this.checked,
    required this.onChange,
    this.description,
  });

  final String title;
  final bool checked;
  final String? description;
  final ValueChanged<bool> onChange;

  @override
  Widget build(BuildContext context) => TvListItem(
    title: title,
    subtitle: description,
    quiet: true,
    trailing: TvListSwitch(checked: checked),
    onPressed: () => onChange(!checked),
  );
}

/// A note under a group of rows, such as what a setting is used for.
class _RowNote extends StatelessWidget {
  const _RowNote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
    child: Text(
      text,
      style: TvType.caption.style(
        color: MatineeTheme.of(context).mutedForeground,
      ),
    ),
  );
}

/// Room above a heading that starts a new group of rows.
const _groupGap = SizedBox(height: 16);

/// The signed-in account, for the rows that show or save its preferences.
User? _user(WidgetRef ref) => switch (ref.watch(authStateProvider)) {
  SignedIn(:final user) => user,
  _ => null,
};

/// Saves the account's playback preferences, which every device of the
/// account plays by, and takes the account the server sends back.
Future<void> _savePlayback(
  WidgetRef ref,
  AppLocalizations l,
  PlaybackPreferences preferences,
) async {
  final api = ref.read(apiProvider);
  final toasts = ref.read(toastProvider);
  final session = ref.read(sessionProvider.notifier);
  try {
    if (api == null) throw StateError('signed out');
    session.updateUser(await api.account.playback.setPreferences(preferences));
  } on Object catch (error) {
    unawaited(
      toasts.show(
        l.playerErrorSavePreferences,
        description: describeFailure(l, error),
        kind: ToastKind.error,
      ),
    );
  }
}

PlaybackPreferences _with(
  PlaybackPreferences p, {
  String? Function()? audioLanguage,
  String? subtitleMode,
  String? Function()? subtitleLanguage,
  bool? rememberSubtitles,
  int? skipBack,
  int? skipForward,
}) => PlaybackPreferences(
  audioLanguage: audioLanguage == null ? p.audioLanguage : audioLanguage(),
  subtitleMode: subtitleMode ?? p.subtitleMode,
  subtitleLanguage: subtitleLanguage == null
      ? p.subtitleLanguage
      : subtitleLanguage(),
  rememberSubtitles: rememberSubtitles ?? p.rememberSubtitles,
  rememberAudio: p.rememberAudio,
  skipBackSeconds: skipBack ?? p.skipBackSeconds,
  skipForwardSeconds: skipForward ?? p.skipForwardSeconds,
);

/// What this TV plays with and how, the account's skip lengths, and what
/// the server converts to for it, as the Kotlin app's `PlaybackRows`. The
/// device's rows are [playerPrefsProvider]'s, which the phone's Playback
/// page sets too.
class _PlaybackRows extends ConsumerWidget {
  const _PlaybackRows();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final user = _user(ref);
    final playback = user?.playback ?? defaultPlaybackPreferences;
    final options = ref.watch(playbackOptionsProvider).value;
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final codecs = ref.watch(playbackCodecsProvider).value;
    final engine = ref.watch(playerEngineProvider).value ?? PlayerEngine.mpv;
    void change(PlayerPrefs Function(PlayerPrefs) edit) =>
        unawaited(ref.read(playerPrefsProvider.notifier).change(edit));
    List<(int, String)> skips(int current) => [
      for (final step in {...?options?.skipSteps, current}.toList()..sort())
        (step, l.playbackSkipSeconds(step)),
    ];
    final qualities = playbackQualityChoices(l, options);
    final limit = options?.maxBitrate;
    // A codec shows only when there's a choice: what the server encodes and
    // this TV decodes.
    final video = encodeVideoChoices(
      options?.videoCodecs ?? const ['h264'],
      codecs,
    );
    final audio = convertAudioChoices(
      options?.audioCodecs ?? const ['aac'],
      codecs,
    );
    final passthrough = passthroughCodecs(codecs);
    return _Rows([
      TvListHeading(l.tvSettingsThisTv),
      _PickRow<String>(
        title: l.playbackQualityTitle,
        description: limit == null ? null : playbackQualityLimitText(l, limit),
        options: qualities,
        current: shownQuality(prefs.quality, options, qualities),
        onPick: (picked) => change((prefs) => prefs.copyWith(quality: picked)),
      ),
      _SwitchRow(
        title: l.tvSettingsFrameRate,
        description: l.tvSettingsFrameRateDescription,
        checked: prefs.matchFrameRate,
        onChange: (on) => change((prefs) => prefs.copyWith(matchFrameRate: on)),
      ),
      _SwitchRow(
        title: l.playbackAutoplayTitle,
        checked: prefs.autoplayNext,
        onChange: (on) => change((prefs) => prefs.copyWith(autoplayNext: on)),
      ),
      _PickRow<PlayerEngine>(
        title: l.playbackEngineTitle,
        // Their own names, the same in every language.
        options: const [
          (PlayerEngine.mpv, 'mpv'),
          (PlayerEngine.media3, 'Media3'),
        ],
        current: engine,
        onPick: (picked) => unawaited(
          ref.read(playerEngineProvider.notifier).setEngine(picked),
        ),
      ),
      _PickRow<Decoders>(
        title: l.playbackDecodersTitle,
        options: [
          (Decoders.hardware, l.playbackDecodersHardware),
          (Decoders.software, l.playbackDecodersSoftware),
        ],
        current: prefs.decoders,
        onPick: (picked) => change((prefs) => prefs.copyWith(decoders: picked)),
      ),
      _groupGap,
      TvListHeading(l.playbackSkipTitle),
      _PickRow<int>(
        title: l.playbackSkipBack,
        options: skips(playback.skipBack),
        current: playback.skipBack,
        onPick: (seconds) =>
            _savePlayback(ref, l, _with(playback, skipBack: seconds)),
      ),
      _PickRow<int>(
        title: l.playbackSkipForward,
        options: skips(playback.skipForward),
        current: playback.skipForward,
        onPick: (seconds) =>
            _savePlayback(ref, l, _with(playback, skipForward: seconds)),
      ),
      if (video.length > 1 || audio.length > 1) ...[
        _groupGap,
        TvListHeading(l.playbackTranscodingTitle),
        if (video.length > 1)
          _PickRow<String>(
            title: l.playbackVideoCodecTitle,
            options: [
              (
                automaticCodec,
                l.playbackCodecAutomatic(videoCodecName('h264')),
              ),
              for (final codec in video) (codec, videoCodecName(codec)),
            ],
            current: video.contains(prefs.videoCodec)
                ? prefs.videoCodec
                : automaticCodec,
            onPick: (picked) =>
                change((prefs) => prefs.copyWith(videoCodec: picked)),
          ),
        if (audio.length > 1)
          _PickRow<String>(
            title: l.playbackAudioCodecTitle,
            options: [
              (
                automaticCodec,
                l.playbackCodecAutomatic(audioFormatName(audio.first)),
              ),
              for (final codec in audio) (codec, audioFormatName(codec)),
            ],
            current: audio.contains(prefs.audioCodec)
                ? prefs.audioCodec
                : automaticCodec,
            onPick: (picked) =>
                change((prefs) => prefs.copyWith(audioCodec: picked)),
          ),
        _RowNote(l.tvSettingsTranscodingNote),
      ],
      if (passthrough.isNotEmpty) ...[
        _groupGap,
        TvListHeading(l.playbackPassthroughTitle),
        for (final codec in passthrough)
          _SwitchRow(
            title: audioFormatName(codec),
            checked: !prefs.convertAudio.contains(codec),
            onChange: (on) => change(
              (prefs) => prefs.copyWith(
                convertAudio: on
                    ? (prefs.convertAudio.toSet()..remove(codec))
                    : {...prefs.convertAudio, codec},
              ),
            ),
          ),
      ],
    ]);
  }
}

/// How subtitles look on this TV, over a sample, as the Kotlin app's
/// `SubtitleRows`: the system's caption style, or the app's own.
class _SubtitleRows extends ConsumerWidget {
  const _SubtitleRows();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final percent = NumberFormat.percentPattern(l.localeName);
    void change(PlayerPrefs Function(PlayerPrefs) edit) =>
        unawaited(ref.read(playerPrefsProvider.notifier).change(edit));
    return _Rows([
      _SubtitlePreview(look: subtitleLook(ref, prefs)),
      _SwitchRow(
        title: l.settingsSubtitlesSystem,
        checked: prefs.subtitleSystemStyle,
        onChange: (on) =>
            change((prefs) => prefs.copyWith(subtitleSystemStyle: on)),
      ),
      if (prefs.subtitleSystemStyle)
        TvListItem(
          title: l.settingsSubtitlesSystemOpen,
          quiet: true,
          trailing: const TvListValue(''),
          onPressed: () =>
              unawaited(ref.read(playerSystemProvider).openCaptionSettings()),
        )
      else ...[
        _PickRow<double>(
          title: l.settingsSubtitlesSize,
          options: [
            for (final scale in subtitleScales) (scale, percent.format(scale)),
          ],
          current: prefs.subtitleScale,
          onPick: (picked) =>
              change((prefs) => prefs.copyWith(subtitleScale: picked)),
        ),
        _PickRow<SubtitleColor>(
          title: l.settingsSubtitlesColor,
          options: [
            for (final color in SubtitleColor.values)
              (color, subtitleColorLabel(l, color)),
          ],
          current: prefs.subtitleColor,
          onPick: (picked) =>
              change((prefs) => prefs.copyWith(subtitleColor: picked)),
        ),
        _PickRow<SubtitleBackground>(
          title: l.settingsSubtitlesBackground,
          options: [
            for (final background in SubtitleBackground.values)
              (background, subtitleBackgroundLabel(l, background)),
          ],
          current: prefs.subtitleBackground,
          onPick: (picked) =>
              change((prefs) => prefs.copyWith(subtitleBackground: picked)),
        ),
        _PickRow<SubtitleEdge>(
          title: l.settingsSubtitlesEdge,
          options: [
            for (final edge in ownSubtitleEdges)
              (edge, subtitleEdgeLabel(l, edge)),
          ],
          current: prefs.subtitleEdge,
          onPick: (picked) =>
              change((prefs) => prefs.copyWith(subtitleEdge: picked)),
        ),
      ],
    ]);
  }
}

/// A line of subtitles over a stand-in for a frame, drawn as the player
/// draws them, at the player's size on a TV.
class _SubtitlePreview extends StatelessWidget {
  const _SubtitlePreview({required this.look});

  final SubtitleLook look;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
    child: Container(
      height: 128,
      alignment: Alignment.bottomCenter,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF9DB3D1),
            Color(0xFF55657F),
            Color(0xFF2B2622),
            Color(0xFF6E5A45),
          ],
        ),
      ),
      child: SubtitleLine(
        TextSpan(text: AppLocalizations.of(context).settingsSubtitlesPreview),
        look: look,
        size: 18,
      ),
    ),
  );
}

/// The account's languages, which every device of the account plays by,
/// and whether shows list their specials, as the Kotlin app's
/// `LanguageRows`.
class _LanguageRows extends ConsumerWidget {
  const _LanguageRows();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final user = _user(ref);
    final playback = user?.playback ?? defaultPlaybackPreferences;
    final options = ref.watch(playbackOptionsProvider).value;
    final device = l.localeName.split(RegExp('[-_]')).first;
    final audioCodes = options?.audioLanguages ?? const <String>[];
    final subtitleCodes = options?.subtitleLanguages ?? const <String>[];
    final names = DisplayNames.watch(ref, DisplayNameKind.language, [
      ...audioCodes,
      ...subtitleCodes,
      device,
    ], l.localeName);
    final mode = switch (playback.subtitleMode) {
      SubtitleMode.always => l.playbackSubtitlesModeAlways,
      SubtitleMode.foreign => l.playbackSubtitlesModeForeign,
      SubtitleMode.forced => l.playbackSubtitlesModeForced,
      SubtitleMode.off => l.playbackSubtitlesModeOff,
      _ => l.playbackSubtitlesModeDefault,
    };
    return _Rows([
      _PickRow<String>(
        title: l.playbackAudioTitle,
        options: [
          (_none, l.playbackAudioFileDefault),
          (originalLanguage, l.playbackAudioOriginal),
          for (final code in audioCodes) (code, names.nameOf(code)),
        ],
        current: playback.audioLanguage ?? _none,
        onPick: (code) => _savePlayback(
          ref,
          l,
          _with(playback, audioLanguage: () => code == _none ? null : code),
        ),
      ),
      TvListItem(
        title: l.playbackSubtitlesTitle,
        quiet: true,
        trailing: TvListValue(mode),
        onPressed: () async {
          final picked = await showTvPicker<String>(
            context,
            title: l.playbackSubtitlesTitle,
            current: playback.subtitleMode,
            options: [
              TvOption(
                SubtitleMode.defaultValue,
                l.playbackSubtitlesModeDefault,
              ),
              TvOption(SubtitleMode.always, l.playbackSubtitlesModeAlways),
              TvOption(SubtitleMode.foreign, l.playbackSubtitlesModeForeign),
              TvOption(SubtitleMode.forced, l.playbackSubtitlesModeForced),
              TvOption(SubtitleMode.off, l.playbackSubtitlesModeOff),
            ],
          );
          if (picked != null) {
            await _savePlayback(ref, l, _with(playback, subtitleMode: picked));
          }
        },
      ),
      // With subtitles off, which language they'd be in doesn't matter.
      if (playback.subtitleMode != SubtitleMode.off)
        _PickRow<String>(
          title: l.playbackSubtitlesLanguage,
          options: [
            (_none, l.playbackSubtitlesDeviceLanguage(names.nameOf(device))),
            for (final code in subtitleCodes) (code, names.nameOf(code)),
          ],
          current: playback.subtitleLanguage ?? _none,
          onPick: (code) => _savePlayback(
            ref,
            l,
            _with(
              playback,
              subtitleLanguage: () => code == _none ? null : code,
            ),
          ),
        ),
      _SwitchRow(
        title: l.playbackSubtitlesRemember,
        checked: playback.rememberSubtitles,
        onChange: (on) =>
            _savePlayback(ref, l, _with(playback, rememberSubtitles: on)),
      ),
      _SwitchRow(
        title: l.playbackSpecialsTitle,
        checked: user?.library.showSpecials ?? false,
        onChange: (on) => _saveSpecials(ref, l, on),
      ),
      _RowNote(l.tvSettingsLanguagesNote),
    ]);
  }

  Future<void> _saveSpecials(WidgetRef ref, AppLocalizations l, bool on) async {
    final api = ref.read(apiProvider);
    final toasts = ref.read(toastProvider);
    final session = ref.read(sessionProvider.notifier);
    try {
      if (api == null) throw StateError('signed out');
      session.updateUser(
        await api.account.library.setPreferences(showSpecials: on),
      );
    } on Object catch (error) {
      unawaited(
        toasts.show(
          l.playbackSpecialsFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    }
  }
}

/// The places the account is signed in; Select on one but this TV asks to
/// sign it out, as the Kotlin app's `DeviceRows`.
class _DeviceRows extends ConsumerStatefulWidget {
  const _DeviceRows();

  @override
  ConsumerState<_DeviceRows> createState() => _DeviceRowsState();
}

class _DeviceRowsState extends ConsumerState<_DeviceRows> {
  @override
  void initState() {
    super.initState();
    // Opening the category asks again, so a device signed in meanwhile
    // shows.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.invalidate(accountSessionsProvider);
    });
  }

  Future<void> _signOut(Session session, String name) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final toasts = ref.read(toastProvider);
    final sure = await showTvPanel<bool>(
      context,
      title: l.tvSettingsSignOutDevice(name),
      description: l.tvSettingsSignOutDeviceDescription,
      builder: (panel) => [
        TvListItem(
          title: l.shellSignOut,
          icon: Lucide.logOut,
          quiet: true,
          destructive: true,
          onPressed: () => Navigator.of(panel).pop(true),
        ),
        TvListItem(
          title: l.commonCancel,
          icon: Lucide.x,
          quiet: true,
          onPressed: () => Navigator.of(panel).pop(false),
        ),
      ],
    );
    if (sure != true || api == null) return;
    try {
      await api.account.sessions.revoke(session.id);
    } on Object catch (error) {
      unawaited(
        toasts.show(
          l.accountSessionsSignOutFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    }
    if (mounted) ref.invalidate(accountSessionsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final load = ref.watch(accountSessionsProvider);
    final sessions = load.value;
    if (sessions == null) {
      if (load.hasError) {
        return _Rows([
          _RowNote(
            l.accountSessionsLoadFailed(describeFailure(l, load.error!)),
          ),
          TvListItem(
            title: l.commonRetry,
            icon: Lucide.refreshCw,
            quiet: true,
            onPressed: () => ref.invalidate(accountSessionsProvider),
          ),
        ]);
      }
      return Padding(
        padding: const EdgeInsetsDirectional.only(start: 20, top: 12),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Spinner(size: 28, color: colors.mutedForeground),
        ),
      );
    }
    return _Rows([
      for (final session in sessions)
        _sessionRow(l, session, sessionName(session, l)),
    ]);
  }

  /// A signed-in device: what it is, since when, and this TV marked; the
  /// others open a way to sign them out. This TV stays focusable, so the
  /// list scrolls past it, but has nothing to do.
  Widget _sessionRow(AppLocalizations l, Session session, String name) {
    final signedIn = DateTime.tryParse(session.createdAt)?.toLocal();
    final facts = [
      if (session.platform case final platform?)
        l.accountDeviceApp(platformLabel(platform)),
      l.accountSessionsSignedIn(
        signedIn == null
            ? '—'
            : DateFormat.yMMMd(l.localeName).format(signedIn),
      ),
    ].join(' · ');
    return TvListItem(
      title: name,
      subtitle: facts,
      icon: platformIcon(session.platform),
      quiet: true,
      minHeight: 68,
      trailing: session.current
          ? Text(
              l.accountSessionsThisDevice,
              style: TvType.label.style(
                color: MatineeTheme.of(context).mutedForeground,
              ),
            )
          : TvListValue(l.shellSignOut),
      onPressed: session.current ? () {} : () => _signOut(session, name),
    );
  }
}

/// Who's signed in and to which server, and the ways out: another server,
/// or signing out, as the Kotlin app's `AccountRows`.
class _AccountRows extends ConsumerWidget {
  const _AccountRows();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authStateProvider);
    final (user, server) = switch (auth) {
      SignedIn(:final user, :final server) => (user, server),
      _ => (null, ''),
    };
    final device = ref.watch(deviceProvider);
    return _Rows([
      if (user != null)
        TvListItem(
          title: user.name,
          subtitle: [
            if (user.displayName?.trim().isNotEmpty ?? false)
              '@${user.username}',
            if (user.isAdmin) l.profileAdmin,
          ].join(' · ').nullIfEmpty,
          quiet: true,
          minHeight: 76,
          leading: Avatar(avatarId: user.avatarId, name: user.name, size: 44),
          onPressed: () {},
        ),
      TvListItem(
        title: withoutScheme(server),
        subtitle: l.settingsVersion(device.appVersion),
        icon: Lucide.server,
        quiet: true,
        onPressed: () {},
      ),
      _groupGap,
      TvListItem(
        title: l.connectChangeServer,
        icon: Lucide.refreshCw,
        quiet: true,
        onPressed: () => showTvServerPanel(
          context,
          returnTo:
              '${Routes.settings}?category=${TvSettingsCategory.account.key}',
        ),
      ),
      TvListItem(
        title: l.shellSignOut,
        icon: Lucide.logOut,
        quiet: true,
        destructive: true,
        onPressed: () => confirmTvSignOut(context, ref),
      ),
    ]);
  }
}

extension on String {
  String? get nullIfEmpty => isEmpty ? null : this;
}

/// The phone's About page on a TV, as the Kotlin app's `AboutRows`: the
/// app and the TV, the latest playback's report, and the app's log, shown
/// and copied, since a TV has no app to share them with.
class _AboutRows extends ConsumerStatefulWidget {
  const _AboutRows();

  @override
  ConsumerState<_AboutRows> createState() => _AboutRowsState();
}

class _AboutRowsState extends ConsumerState<_AboutRows> {
  var _busy = false;
  final _showLog = FocusNode(debugLabel: 'about/show log');

  @override
  void dispose() {
    _showLog.dispose();
    super.dispose();
  }

  /// Copies [text], and says so: a TV's system shows nothing for a copy.
  Future<void> _copy(String text, String done) async {
    final toasts = ref.read(toastProvider);
    await Clipboard.setData(ClipboardData(text: text));
    unawaited(toasts.show(done));
  }

  Future<void> _withLog(Future<void> Function(String log) use) async {
    if (_busy) return;
    _busy = true;
    try {
      final log = await readAppLog(
        ref.read(logReaderProvider),
        ref.read(authStateProvider),
      );
      if (mounted) await use(log);
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final device = ref.watch(deviceProvider);
    final report = ref.watch(playbackReportProvider);
    final latest = report?.latest;
    Widget value(String title, String text) => TvListItem(
      title: title,
      quiet: true,
      trailing: TvListValue(text, chevron: false),
      onPressed: () {},
    );
    return _Rows([
      value(
        l.aboutVersion,
        kDebugMode ? '${device.appVersion}, debug' : device.appVersion,
      ),
      value(l.aboutAndroid, device.osVersion),
      value(l.aboutDevice, device.model),
      _groupGap,
      TvListHeading(l.diagnosticsTitle),
      if (report == null || latest == null)
        _RowNote(l.diagnosticsEmpty)
      else ...[
        value(l.diagnosticsLatest, diagnosticsStatus(l, latest)),
        TvListItem(
          title: l.diagnosticsShow,
          quiet: true,
          onPressed: () => showTvText(
            context,
            title: l.diagnosticsTitle,
            text: formatReport(report),
          ),
        ),
        TvListItem(
          title: l.diagnosticsCopy,
          quiet: true,
          onPressed: () => _copy(formatReport(report), l.diagnosticsCopied),
        ),
        // Its rows go, so focus moves on to the log's.
        TvListItem(
          title: l.diagnosticsClear,
          quiet: true,
          destructive: true,
          onPressed: () {
            _showLog.requestFocus();
            ref.read(playbackReportProvider.notifier).clear();
          },
        ),
      ],
      _groupGap,
      TvListHeading(l.logsTitle),
      TvListItem(
        title: l.logsShow,
        subtitle: l.logsNote,
        quiet: true,
        focusNode: _showLog,
        onPressed: () => _withLog(
          (log) =>
              showTvText(context, title: l.logsTitle, text: log, fromEnd: true),
        ),
      ),
      TvListItem(
        title: l.logsCopy,
        quiet: true,
        onPressed: () => _withLog((log) => _copy(log, l.logsCopied)),
      ),
    ]);
  }
}

/// [text] over the whole page, in monospace, for reading from the couch,
/// as the Kotlin app's `TvTextViewer`. Up and Down scroll it by most of a
/// screen, Back closes it and puts focus back on the row that opened it.
/// [fromEnd] opens it at the bottom, for a log, whose latest lines are
/// last.
Future<void> showTvText(
  BuildContext context, {
  required String title,
  required String text,
  bool fromEnd = false,
}) => Navigator.of(context, rootNavigator: true).push(
  PageRouteBuilder<void>(
    opaque: true,
    transitionDuration: TvMotion.enter,
    reverseTransitionDuration: TvMotion.exit,
    pageBuilder: (context, animation, secondary) =>
        _TextViewer(title: title, text: text, fromEnd: fromEnd),
    transitionsBuilder: (context, animation, secondary, child) =>
        FadeTransition(opacity: animation, child: child),
  ),
);

class _TextViewer extends StatefulWidget {
  const _TextViewer({
    required this.title,
    required this.text,
    required this.fromEnd,
  });

  final String title;
  final String text;
  final bool fromEnd;

  @override
  State<_TextViewer> createState() => _TextViewerState();
}

class _TextViewerState extends State<_TextViewer> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    // The shell takes the clock away while it's open, as for a panel.
    tvOpenPanels.value++;
    if (widget.fromEnd) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.jumpTo(_scroll.position.maxScrollExtent);
        }
      });
    }
  }

  @override
  void dispose() {
    tvOpenPanels.value--;
    _scroll.dispose();
    super.dispose();
  }

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    final key = event.logicalKey;
    final down = key == LogicalKeyboardKey.arrowDown;
    final up = key == LogicalKeyboardKey.arrowUp;
    // Focus stays here until Back.
    if (!down && !up) {
      return key == LogicalKeyboardKey.arrowLeft ||
              key == LogicalKeyboardKey.arrowRight
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    }
    if ((event is KeyDownEvent || event is KeyRepeatEvent) &&
        _scroll.hasClients) {
      final position = _scroll.position;
      final step = position.viewportDimension * .8 * (down ? 1 : -1);
      unawaited(
        position.animateTo(
          (position.pixels + step).clamp(0, position.maxScrollExtent),
          duration: TvMotion.move,
          curve: TvMotion.easing,
        ),
      );
    }
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: Padding(
        padding: const EdgeInsetsDirectional.only(
          start: TvPage.start,
          end: TvPage.end,
          top: Overscan.vertical + 8,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Text(
                widget.title,
                style: TvType.headline.style(color: colors.foreground),
              ),
            ),
            Expanded(
              child: Focus(
                autofocus: true,
                onKeyEvent: _key,
                child: SingleChildScrollView(
                  controller: _scroll,
                  padding: const EdgeInsets.only(
                    bottom: Overscan.vertical + 16,
                  ),
                  child: Text(
                    widget.text,
                    style: tvCodeStyle.copyWith(
                      fontSize: 14,
                      height: 20 / 14,
                      fontWeight: FontWeight.w400,
                      // A code's spacing would spread a log's lines wide.
                      letterSpacing: 0,
                      color: colors.foreground,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
