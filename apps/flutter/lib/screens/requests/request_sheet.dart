import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import 'request_words.dart';
import 'requests_hub.dart';

/// The sheets of asking and answering, the Decline sheet, and Discover's "Not
/// interested".

/// Where a request that needs a decision is made, in a sheet from the
/// bottom, as the web's request dialog: a show's seasons, each the viewer
/// may still request with a box, the server's pick already ticked (or only
/// [only], from a season's card), and the rest with their state. Only
/// seasons that are out can be asked for. Where it lands is the
/// server's call; an admin moves a request from the queue. The button says
/// what pressing it requests, and the sheet closes once the server took
/// it.
Future<void> showRequestSheet(
  BuildContext context, {
  required CatalogRef title,
  required String name,
  required List<CatalogSeason> seasons,
  required bool first,
  required String? libraryId,
  Artwork? showPoster,
  int? only,
}) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => _RequestSheet(
      title: title,
      name: name,
      seasons: seasons,
      first: first,
      libraryId: libraryId,
      showPoster: showPoster,
      only: only,
    ),
  );
}

class _RequestSheet extends ConsumerStatefulWidget {
  const _RequestSheet({
    required this.title,
    required this.name,
    required this.seasons,
    required this.first,
    required this.libraryId,
    required this.showPoster,
    required this.only,
  });

  final CatalogRef title;
  final String name;
  final List<CatalogSeason> seasons;
  final bool first;
  final String? libraryId;

  /// What a season without a poster of its own shows, as its card does.
  final Artwork? showPoster;
  final int? only;

  @override
  ConsumerState<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends ConsumerState<_RequestSheet> {
  // Each opening starts from the server's pick.
  late Set<int> _picked = chooserStart(widget.seasons, only: widget.only);

  /// The season a card opened the sheet with, scrolled to.
  final _opened = GlobalKey();

  @override
  void initState() {
    super.initState();
    if (widget.only != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final row = _opened.currentContext;
        if (row != null && row.mounted) {
          unawaited(Scrollable.ensureVisible(row, alignment: .1));
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = widget.title;
    final show = title.isShow;
    // The seasons as the stream has them now.
    final seasons = ref.watch(
      requestsProvider.select((state) => state.seasons(title, widget.seasons)),
    );
    final chosen = [
      for (final season in seasons)
        if (_picked.contains(season.number)) season,
    ];
    final label = show ? chooserLabel(chosen) : const TitleLabel();
    final busy = ref.watch(
      requestsProvider.select((state) => state.busy.contains(refKey(title))),
    );
    return Sheet(
      title: l.webAskDialogTitle(widget.name),
      footer: MatineeButton(
        size: ButtonSize.lg,
        onPressed: label is PickOneLabel || busy
            ? null
            : () => _ask(context, l, chosen),
        child: Text(chooserText(label, l)),
      ),
      child: show
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final season in seasons)
                  _SeasonRow(
                    key: season.number == widget.only ? _opened : null,
                    show: title,
                    season: season,
                    showPoster: widget.showPoster,
                    checked: _picked.contains(season.number),
                    onToggle: () => setState(
                      () => _picked = _picked.contains(season.number)
                          ? ({..._picked}..remove(season.number))
                          : {..._picked, season.number},
                    ),
                  ),
              ],
            )
          : const SizedBox.shrink(),
    );
  }

  void _ask(
    BuildContext context,
    AppLocalizations l,
    List<CatalogSeason> chosen,
  ) {
    final navigator = Navigator.of(context);
    final scope = widget.title.isShow
        ? AskScope(seasons: [for (final season in chosen) season.number])
        : null;
    unawaited(
      ref
          .read(requestsProvider.notifier)
          .ask(
            l,
            widget.title,
            widget.name,
            libraryId: widget.libraryId,
            scope: scope,
            undo: widget.first,
            onDone: () {
              if (navigator.mounted && navigator.canPop()) navigator.pop();
            },
          ),
    );
  }
}

/// A season in the request sheet: its box while it may still be requested,
/// its poster, its name, and what's coming or its state.
class _SeasonRow extends StatelessWidget {
  const _SeasonRow({
    super.key,
    required this.show,
    required this.season,
    required this.showPoster,
    required this.checked,
    required this.onToggle,
  });

  final CatalogRef show;
  final CatalogSeason season;
  final Artwork? showPoster;
  final bool checked;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = season.availability.asTitle();
    final open = availability.asks;
    final name = seasonName(season.number, l);
    final word = stateWord(availability);
    final detail = open
        ? seasonDetailText(seasonDetail(season), l)
        : word == null
        ? l.webAskChooserUnavailable
        : stateText(word, l);
    final poster = season.poster ?? showPoster;
    return PressIndication(
      onPressed: open ? onToggle : null,
      button: false,
      checked: open ? checked : null,
      label: '$name, $detail',
      shape: KitRadius.control,
      builder: (context, state) => ExcludeSemantics(
        child: PressFill(
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          decoration: BoxDecoration(
            borderRadius: KitRadius.control,
            color: colors.foreground.withValues(
              alpha: state == PressState.idle ? 0 : .06,
            ),
          ),
          child: Row(
            spacing: 12,
            children: [
              // A season that can't be asked for keeps the box's room, so
              // the posters line up.
              SizedBox.square(
                dimension: 20,
                child: open
                    ? IgnorePointer(
                        child: OverflowBox(
                          maxWidth: 38,
                          maxHeight: 38,
                          child: Checkbox(checked: checked, onChanged: (_) {}),
                        ),
                      )
                    : null,
              ),
              SizedBox(
                width: 28,
                child: ArtFrame(
                  toneKey: '${refKey(show)}:${season.number}',
                  aspectRatio: CardMetrics.poster,
                  children: [
                    if (poster != null) Picture([ArtSource(poster)]),
                  ],
                ),
              ),
              Expanded(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.base.style(
                    color: open ? colors.foreground : colors.mutedForeground,
                    weight: FontWeight.w500,
                  ),
                ),
              ),
              Text(
                detail,
                maxLines: 1,
                style: KitText.xs.style(color: colors.mutedForeground),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Decline, with why: one field for a reason to whoever requested it,
/// which may stay empty. With [giveUp], the same sheet gives up on an
/// accepted request, for want of a copy. The answer goes through the hub,
/// held for Undo.
Future<void> showDeclineSheet(
  BuildContext context,
  AdminRequestItem item, {
  bool giveUp = false,
}) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => _DeclineSheet(item: item, giveUp: giveUp),
  );
}

class _DeclineSheet extends ConsumerStatefulWidget {
  const _DeclineSheet({required this.item, required this.giveUp});

  final AdminRequestItem item;
  final bool giveUp;

  @override
  ConsumerState<_DeclineSheet> createState() => _DeclineSheetState();
}

class _DeclineSheetState extends ConsumerState<_DeclineSheet> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final item = widget.item;
    final giveUp = widget.giveUp;
    final askedBy = [for (final each in item.followers) each.name];
    final keeps = item.connection;
    return Sheet(
      title: giveUp
          ? l.webRequestsGiveUpTitle(item.title.name)
          : l.webRequestsDeclineTitle(item.title.name),
      footer: MatineeButton(
        size: ButtonSize.lg,
        look: ButtonLook.destructive,
        onPressed: () => _submit(l),
        child: Text(
          giveUp ? l.webRequestsGiveUpSubmit : l.webRequestsDeclineSubmit,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          MatineeTextField(
            controller: _note,
            label: askedBy.isEmpty
                ? l.webRequestsDeclineNote
                : l.webRequestsDeclineNoteFor(formatList(askedBy, l)),
            placeholder: l.webRequestsDeclineNotePlaceholder,
          ),
          if (giveUp)
            Text(
              // A connection that reports nothing back holds nothing to keep.
              keeps != null && keeps.reportsProgress
                  ? l.webRequestsGiveUpKeeps(keeps.name)
                  : l.webRequestsGiveUpTurnsUp,
              style: KitText.xs.style(color: colors.mutedForeground),
            ),
        ],
      ),
    );
  }

  void _submit(AppLocalizations l) {
    final text = _note.text.trim();
    final note = text.isEmpty ? null : text;
    final answer = widget.giveUp ? GiveUpAnswer(note) : DeclineAnswer(note);
    final hub = ref.read(requestsProvider.notifier);
    Navigator.of(context).pop();
    unawaited(hub.answer(l, widget.item, answer));
  }
}

/// The recommendations this sitting left out with "Not interested", by
/// [refKey], so the rows leave them out before they're fetched again.
final hiddenRecommendationsProvider =
    NotifierProvider<HiddenRecommendations, Set<String>>(
      HiddenRecommendations.new,
    );

final class HiddenRecommendations extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    ref.watch(apiProvider);
    return const {};
  }

  void hide(CatalogRef ref) => state = {...state, refKey(ref)};
}

/// The sheet a recommended title's long press opens, with "Not
/// interested".
Future<void> showNotInterested(
  BuildContext context,
  CatalogTitleSummary item,
) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final picked = await Sheet.show<bool>(
    context,
    dismissLabel: l.commonCancel,
    builder: (context) => Sheet(
      title: item.name,
      description: item.year?.toString(),
      child: SheetItem(
        icon: Lucide.eyeOff,
        label: l.webDiscoverNotInterested,
        onPressed: () => Navigator.of(context).pop(true),
      ),
    ),
  );
  if (picked != true) return;
  await dismissRecommendation(container, l, item);
}

/// Leaves [item] out of the viewer's recommendations, as "Not interested"
/// does on the phone's sheet and the TV's panel: the rows leave it out at
/// once, and a toast says so, or why it didn't go.
Future<void> dismissRecommendation(
  ProviderContainer container,
  AppLocalizations l,
  CatalogTitleSummary item,
) async {
  final api = container.read(apiProvider);
  final toasts = container.read(toastProvider);
  try {
    if (api == null) throw StateError('no server');
    await api.recommendations.dismiss(ref: item.ref, dismissed: true);
  } on Object catch (cause) {
    unawaited(
      toasts.show(
        l.webDiscoverDismissFailed(item.name),
        description: describeFailure(l, cause),
        kind: ToastKind.error,
      ),
    );
    return;
  }
  container.read(hiddenRecommendationsProvider.notifier).hide(item.ref);
  unawaited(toasts.show(l.webDiscoverDismissed(item.name)));
}
