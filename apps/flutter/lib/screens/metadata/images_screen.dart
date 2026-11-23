import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/display_names.dart';
import '../../core/failure_text.dart';
import '../../core/image_picker.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../title/title_parts.dart' show isWide;
import 'identify_screen.dart';
import 'metadata_data.dart';

/// What a change to an image does, to show its spinner.
sealed class _Change {
  const _Change();
}

/// One of the provider's images, or none with null.
final class _Pick extends _Change {
  const _Pick(this.imageId);

  final String? imageId;

  @override
  bool operator ==(Object other) => other is _Pick && other.imageId == imageId;

  @override
  int get hashCode => imageId.hashCode;
}

final class _Upload extends _Change {
  const _Upload();
}

final class _Reset extends _Change {
  const _Reset();
}

/// Pick the images of a title, season, or episode from what the library's
/// provider has, or upload them. What an admin picks stays when the metadata is
/// fetched again.
class ImagesScreen extends StatelessWidget {
  const ImagesScreen({super.key, required this.target});

  final ImageTarget target;

  @override
  Widget build(BuildContext context) => MetadataPage(
    titleId: target.titleId,
    heading: AppLocalizations.of(context).titleImagesTitle,
    content: (title) => _ImageEditor(title: title, target: target),
  );
}

class _ImageEditor extends ConsumerStatefulWidget {
  const _ImageEditor({required this.title, required this.target});

  final Title title;
  final ImageTarget target;

  @override
  ConsumerState<_ImageEditor> createState() => _ImageEditorState();
}

class _ImageEditorState extends ConsumerState<_ImageEditor> {
  late String _slot = widget.target.slots.first;

  /// What the last change answered, over the load, which catches up after.
  List<ItemImage>? _changed;

  /// Each slot's choice of the provider's images in every language.
  final _allLanguages = <String, bool>{};
  _Change? _busy;

  ImagesKey get _key => imagesKey(widget.target);

  void _showError(String? message) {
    final l = AppLocalizations.of(context);
    unawaited(
      ref
          .read(toastProvider)
          .show(
            l.titleImagesError,
            description: message == null || message.trim().isEmpty
                ? null
                : message,
            kind: ToastKind.error,
          ),
    );
  }

  Future<void> _change(_Change action) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    final target = widget.target;
    final slot = _slot;
    setState(() => _busy = action);
    try {
      final changed = await switch (action) {
        _Pick(:final imageId) => api.titles.setImage(
          target.titleId,
          slot,
          season: target.season,
          episode: target.episode,
          imageId: imageId,
        ),
        _Upload() => throw StateError('uploads go through _upload'),
        _Reset() => api.titles.resetImage(
          target.titleId,
          slot,
          season: target.season,
          episode: target.episode,
        ),
      };
      _applied(changed);
    } on Object catch (error) {
      if (mounted) _showError(describeFailure(l, error));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _applied(List<ItemImage> changed) {
    if (!mounted) return;
    setState(() => _changed = changed);
    // Pages that show the images fetch them again.
    ref.read(mediaChangesProvider.notifier).changed();
  }

  Future<void> _upload() async {
    final l = AppLocalizations.of(context);
    final picked = await ref.read(imagePickerProvider)(maxImageBytes);
    if (picked == null || !mounted) return;
    final type = picked.type;
    final bytes = picked.bytes;
    if (type == null || !imageTypes.contains(type)) {
      return _showError(l.titleImagesWrongType);
    }
    if (bytes == null || bytes.isEmpty) return _showError(null);
    if (bytes.length > maxImageBytes) return _showError(l.titleImagesTooBig);
    final api = ref.read(apiProvider);
    if (api == null) return;
    final target = widget.target;
    setState(() => _busy = const _Upload());
    try {
      _applied(
        await api.titles.uploadImage(
          target.titleId,
          _slot,
          season: target.season,
          episode: target.episode,
          file: FilePart(
            bytes: bytes,
            type: type,
            name: 'image.${type.substring(type.indexOf('/') + 1)}',
          ),
        ),
      );
    } on Object catch (error) {
      if (mounted) _showError(describeFailure(l, error));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// What's being changed: the title, a season of it, or an episode.
  String _name(AppLocalizations l) {
    final title = widget.title;
    final season = widget.target.season;
    final episode = widget.target.episode;
    if (season == null) return title.name;
    if (episode == null) {
      return l.titleSeasonOf(title.name, seasonName(season, l));
    }
    return l.titleSeasonOf(
      title.name,
      season == 0
          ? l.mediaSpecial(episode)
          : l.mediaEpisodeCode(season, episode),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final title = widget.title;
    final slots = widget.target.slots;
    final images = ref.watch(itemImagesProvider(_key));
    final current = _changed ?? images.value;
    final providerState = ref.watch(libraryMetadataProvider(title.libraryId));
    // One without its API key has nothing to list either.
    final provider = providerState.value;
    final providerName = provider != null && provider.configured
        ? provider.name
        : null;
    // A provider lists images only for an entry the title matched.
    final lists = providerName != null && title.providerId != null;
    final allLanguages = _allLanguages[_slot] ?? false;
    final remote = lists
        ? ref.watch(
            remoteImagesProvider((
              target: _key,
              slot: _slot,
              allLanguages: allLanguages,
            )),
          )
        : null;
    final inUse = current?.where((image) => image.slot == _slot).firstOrNull;
    final muted = KitText.sm.style(color: colors.mutedForeground);
    final languages = DisplayNames.watch(ref, DisplayNameKind.language, [
      for (final image in remote?.value ?? const <RemoteImage>[])
        ?image.language,
    ], l.localeName);

    final header = <Widget>[
      Text(
        providerName != null
            ? l.titleImagesDescription(_name(l), providerName)
            : l.titleImagesDescriptionLocal(_name(l)),
        style: muted,
      ),
    ];
    final failed = images.hasError && current == null;
    if (failed) {
      header.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: FailureState(
            title: l.titleImagesFailed,
            error: images.error!,
            onRetry: () => ref.invalidate(itemImagesProvider(_key)),
            onHome: () => context.go(Routes.home),
          ),
        ),
      );
    } else {
      header.addAll([
        // Each slot with the image it has, which also picks the slot to
        // change. Scrolls sideways when they don't fit.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            spacing: 8,
            children: [
              for (final slot in slots)
                SlotCard(
                  slot: slot,
                  current: current
                      ?.where((image) => image.slot == slot)
                      .firstOrNull,
                  toneKey: title.id,
                  providerName: providerName,
                  selected: slot == _slot,
                  onPressed: slots.length > 1
                      ? () => setState(() => _slot = slot)
                      : null,
                ),
            ],
          ),
        ),
        _actions(l, inUse, lists, providerName, allLanguages),
      ]);
    }

    final Widget? note;
    final List<RemoteImage>? choices;
    if (failed) {
      note = null;
      choices = null;
    } else if (providerState.isLoading && provider == null) {
      note = Padding(
        padding: const EdgeInsets.all(32),
        child: LoadingState(label: l.loadingInProgress),
      );
      choices = null;
    } else if (!lists) {
      note = _Note(
        providerName != null
            ? l.titleImagesUnmatched(providerName)
            : l.titleImagesNoProvider,
      );
      choices = null;
    } else if (remote!.value case final list? when !remote.isLoading) {
      choices = list;
      note = list.isEmpty
          ? _Note(
              allLanguages
                  ? l.titleImagesEmpty(providerName)
                  : l.titleImagesEmptyLanguage(providerName),
            )
          : null;
    } else if (remote.hasError && !remote.isLoading) {
      choices = null;
      note = Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: FailureState(
          title: l.titleImagesRemoteFailed,
          error: remote.error!,
          onRetry: () => ref.invalidate(
            remoteImagesProvider((
              target: _key,
              slot: _slot,
              allLanguages: allLanguages,
            )),
          ),
        ),
      );
    } else {
      choices = null;
      note = Padding(
        padding: const EdgeInsets.all(32),
        child: LoadingState(label: l.loadingInProgress),
      );
    }

    final columns = _slot == ImageSlot.poster ? 3 : 2;
    final aspect = _aspect(_slot);
    final scaler = MediaQuery.textScalerOf(context);
    return CustomScrollView(
      slivers: [
        // No wider than a phone's column on a tablet, as Settings, so the
        // posters keep a size to pick from.
        SliverConstrainedCrossAxis(
          maxExtent: 720,
          sliver: SliverMainAxisGroup(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  CardMetrics.gutter,
                  0,
                  CardMetrics.gutter,
                  16,
                ),
                sliver: SliverList.separated(
                  itemCount: header.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 16),
                  itemBuilder: (context, index) => header[index],
                ),
              ),
              if (note != null)
                SliverPadding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: CardMetrics.gutter,
                  ),
                  sliver: SliverToBoxAdapter(child: note),
                ),
              if (choices != null && choices.isNotEmpty)
                SliverPadding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: CardMetrics.gutter,
                  ),
                  sliver: SliverLayoutBuilder(
                    builder: (context, constraints) {
                      const spacing = 12.0;
                      final width = math.max(
                        0.0,
                        (constraints.crossAxisExtent -
                                spacing * (columns - 1)) /
                            columns,
                      );
                      return SliverGrid.builder(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          crossAxisSpacing: spacing,
                          mainAxisSpacing: 16,
                          mainAxisExtent:
                              width / aspect +
                              6 +
                              2 * scaler.scale(KitText.px13.lineHeight),
                        ),
                        itemCount: choices!.length,
                        itemBuilder: (context, index) {
                          final image = choices![index];
                          return ImageChoice(
                            image: image,
                            slot: _slot,
                            toneKey: title.id,
                            inUse: image.id == inUse?.image?.id,
                            pending: _busy == _Pick(image.id),
                            caption: _caption(l, image, languages),
                            onPressed: _busy == null
                                ? () => _change(_Pick(image.id))
                                : null,
                          );
                        },
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 24),
        ),
      ],
    );
  }

  /// Upload, remove, and going back to the provider's, then the switch for
  /// every language's images.
  Widget _actions(
    AppLocalizations l,
    ItemImage? inUse,
    bool lists,
    String? providerName,
    bool allLanguages,
  ) {
    final enabled = _busy == null;
    Widget busyOr(bool busy, String icon) =>
        busy ? const Spinner(size: 16) : KitIcon(icon, size: 16);
    Widget button(
      ButtonLook look,
      VoidCallback onPressed,
      bool busy,
      String icon,
      String text,
    ) => MatineeButton(
      look: look,
      size: ButtonSize.lg,
      onPressed: enabled ? onPressed : null,
      label: text,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 8,
        children: [
          busyOr(busy, icon),
          Flexible(child: Text(text)),
        ],
      ),
    );
    final upload = button(
      ButtonLook.secondary,
      _upload,
      _busy is _Upload,
      Lucide.imageUp,
      l.titleImagesUpload,
    );
    final remove = inUse?.image == null
        ? null
        : button(
            ButtonLook.outline,
            () => _change(const _Pick(null)),
            _busy == const _Pick(null),
            Lucide.trash,
            l.titleImagesRemove,
          );
    final reset = inUse?.chosen != true || !lists
        ? null
        : button(
            ButtonLook.outline,
            () => _change(const _Reset()),
            _busy is _Reset,
            Lucide.rotateCcw,
            l.titleImagesReset(providerName ?? ''),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isWide(context))
          Wrap(spacing: 8, runSpacing: 8, children: [upload, ?remove, ?reset])
        else ...[
          // A phone's buttons fill the width: upload and remove side by
          // side, and going back to the provider's, whose name is long, on
          // a line of its own.
          Row(
            spacing: 8,
            children: [
              Expanded(child: upload),
              if (remove != null) Expanded(child: remove),
            ],
          ),
          if (reset != null) ...[const SizedBox(height: 8), reset],
        ],
        if (lists)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: PressIndication(
              onPressed: () =>
                  setState(() => _allLanguages[_slot] = !allLanguages),
              label: l.titleImagesAllLanguages,
              checked: allLanguages,
              // The row takes the tap, so it shows the track alone, and is
              // 48 tall to hit.
              builder: (context, state) => ExcludeSemantics(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: Row(
                    spacing: 12,
                    children: [
                      Expanded(
                        child: Text(
                          l.titleImagesAllLanguages,
                          style: KitText.sm.style(
                            color: MatineeTheme.of(context).foreground,
                          ),
                        ),
                      ),
                      SwitchTrack(checked: allLanguages),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// "1000 × 1500" and "English", from what the provider says. Stills have
  /// no text to speak of, whatever it says.
  List<String> _caption(
    AppLocalizations l,
    RemoteImage image,
    DisplayNames languages,
  ) {
    final width = image.width;
    final height = image.height;
    return [
      if (width != null && height != null) l.titleImagesSize(width, height),
      if (_slot != ImageSlot.still)
        switch (image.language) {
          final language? => languages.nameOf(language),
          null => l.titleImagesNoText,
        },
    ];
  }
}

double _aspect(String slot) =>
    slot == ImageSlot.poster ? CardMetrics.poster : CardMetrics.wide;

String _slotName(String slot, AppLocalizations l) => switch (slot) {
  ImageSlot.poster => l.titleImagesSlotPoster,
  ImageSlot.backdrop => l.titleImagesSlotBackdrop,
  ImageSlot.logo => l.titleImagesSlotLogo,
  _ => l.titleImagesSlotStill,
};

/// "Picked from TMDB", "Uploaded", "None", and so on.
String _stateText(
  String slot,
  ItemImage current,
  String? providerName,
  AppLocalizations l,
) {
  final none = current.image == null;
  if (none && current.chosen) return l.titleImagesStateRemoved;
  if (none && slot == ImageSlot.still) return l.titleImagesStateNoneFrame;
  if (none) return l.titleImagesStateNone;
  if (current.uploaded) return l.titleImagesStateUploaded;
  if (providerName == null) return l.titleImagesStatePicked;
  if (current.chosen) return l.titleImagesStatePickedFrom(providerName);
  return l.titleImagesStateFrom(providerName);
}

/// A slot's name and the image it has, all at one height whatever the
/// image's shape. Picks the slot when there are several.
class SlotCard extends StatelessWidget {
  const SlotCard({
    super.key,
    required this.slot,
    required this.current,
    required this.toneKey,
    required this.providerName,
    required this.selected,
    required this.onPressed,
  });

  final String slot;
  final ItemImage? current;
  final String toneKey;
  final String? providerName;
  final bool selected;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final picked = selected && onPressed != null;
    final image = current?.image;
    final logo = slot == ImageSlot.logo;
    final state = switch (current) {
      final current? => _stateText(slot, current, providerName, l),
      null => '',
    };
    return PressIndication(
      onPressed: onPressed,
      label: [_slotName(slot, l), state].join(', '),
      checked: onPressed == null ? null : selected,
      shape: KitRadius.control,
      builder: (context, press) => DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          border: Border.all(color: picked ? colors.accent : colors.border),
          color: picked
              ? colors.accent.withValues(alpha: .1)
              : colors.foreground.withValues(
                  alpha: press == PressState.idle ? 0 : .06,
                ),
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(6, 6, 16, 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 12,
              children: [
                SizedBox(
                  height: 56,
                  child: ArtFrame(
                    toneKey: toneKey,
                    aspectRatio: _aspect(slot),
                    children: [
                      if (image != null)
                        Padding(
                          padding: EdgeInsets.all(logo ? 4 : 0),
                          child: Picture([
                            ArtSource(image, largest: ArtworkSize.thumb),
                          ], fit: logo ? BoxFit.contain : BoxFit.cover),
                        ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _slotName(slot, l),
                      style: KitText.sm.style(
                        color: colors.foreground,
                        weight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      state,
                      maxLines: 1,
                      style: KitText.px13.style(color: colors.mutedForeground),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One of the provider's images: the picture, a tick on the one in use,
/// and its size and language, a line each, as three posters to a row leave
/// no room for both on one.
class ImageChoice extends StatelessWidget {
  const ImageChoice({
    super.key,
    required this.image,
    required this.slot,
    required this.toneKey,
    required this.inUse,
    required this.pending,
    required this.caption,
    required this.onPressed,
  });

  final RemoteImage image;
  final String slot;
  final String toneKey;
  final bool inUse;
  final bool pending;
  final List<String> caption;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final logo = slot == ImageSlot.logo;
    return PressIndication(
      onPressed: onPressed,
      label: [
        inUse ? l.titleImagesInUse : l.titleImagesUse,
        ...caption,
      ].join(', '),
      checked: inUse,
      shape: KitRadius.control,
      builder: (context, state) => ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: _aspect(slot),
              child: DecoratedBox(
                position: DecorationPosition.foreground,
                decoration: BoxDecoration(
                  borderRadius: KitRadius.control,
                  border: Border.all(
                    color: inUse ? colors.accent : colors.border,
                    width: inUse ? 2 : 1,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: KitRadius.control,
                  child: Tone(
                    toneKey: toneKey,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Padding(
                          padding: EdgeInsets.all(logo ? 8 : 0),
                          child: Picture([
                            ArtSource(image.preview),
                          ], fit: logo ? BoxFit.contain : BoxFit.cover),
                        ),
                        if (state != PressState.idle)
                          ColoredBox(
                            color: colors.foreground.withValues(alpha: .08),
                          ),
                        if (inUse)
                          PositionedDirectional(
                            top: 6,
                            end: 6,
                            child: Container(
                              width: 20,
                              height: 20,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: colors.accent,
                              ),
                              child: KitIcon(
                                Lucide.check,
                                size: 14,
                                color: colors.accentForeground,
                              ),
                            ),
                          ),
                        if (pending)
                          const ColoredBox(
                            color: Color(0x80000000),
                            child: Center(
                              child: Spinner(
                                size: 22,
                                color: Color(0xFFFFFFFF),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            for (final line in caption)
              Text(
                line,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.px13.style(color: colors.mutedForeground),
              ),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: KitText.sm.style(color: MatineeTheme.of(context).mutedForeground),
    ),
  );
}
