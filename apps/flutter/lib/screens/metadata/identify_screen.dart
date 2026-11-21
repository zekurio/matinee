import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../media/artwork.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../title/title_data.dart';
import 'metadata_data.dart';

/// An admin's metadata tools, as the Kotlin app's `MetadataScreens.kt` and
/// the web's dialogs: fix a title's match, and pick or upload the images of
/// a title, season, or episode. Pages rather than dialogs, as a phone's
/// keyboard and a grid of images need the whole screen.

/// A metadata page's frame: Back and its [heading], then [content] once
/// the title has come, or its loading and failure.
class MetadataPage extends ConsumerWidget {
  const MetadataPage({
    super.key,
    required this.titleId,
    required this.heading,
    required this.content,
  });

  final String titleId;
  final String heading;
  final Widget Function(Title title) content;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(titleProvider(titleId));
    final title = async.value;
    return PageFrame(
      title: heading,
      backLabel: l.commonBack,
      onBack: () => context.canPop() ? context.pop() : context.go(Routes.home),
      child: title != null
          ? content(title)
          : Center(
              child: async.hasError
                  ? SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: FailureState(
                        title: l.titleLoadError,
                        error: async.error!,
                        onRetry: () => ref.invalidate(titleProvider(titleId)),
                        onHome: () => context.go(Routes.home),
                      ),
                    )
                  : LoadingState(label: l.loadingInProgress),
            ),
    );
  }
}

/// Search the library's provider by hand and pick the right entry, for a
/// title the automatic match got wrong or missed. Opens on a search for the
/// title's name and year.
class IdentifyScreen extends StatelessWidget {
  const IdentifyScreen({super.key, required this.titleId});

  final String titleId;

  @override
  Widget build(BuildContext context) => MetadataPage(
    titleId: titleId,
    heading: AppLocalizations.of(context).titleIdentifyTitle,
    content: (title) => _IdentifyForm(title: title),
  );
}

class _IdentifyForm extends ConsumerStatefulWidget {
  const _IdentifyForm({required this.title});

  final Title title;

  @override
  ConsumerState<_IdentifyForm> createState() => _IdentifyFormState();
}

class _IdentifyFormState extends ConsumerState<_IdentifyForm> {
  late final _name = TextEditingController(text: widget.title.name);
  late final _year = TextEditingController(
    text: widget.title.year?.toString() ?? '',
  );
  late MatchSearch _search = (
    titleId: widget.title.id,
    query: widget.title.name,
    year: widget.title.year,
  );

  /// The match being sent.
  String? _matching;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _year.dispose();
    super.dispose();
  }

  void _submit() {
    FocusScope.of(context).unfocus();
    final name = _name.text.trim();
    setState(() {
      _error = null;
      _search = (
        titleId: widget.title.id,
        query: name.isEmpty ? widget.title.name : name,
        year: int.tryParse(_year.text.trim()),
      );
    });
  }

  Future<void> _pick(MetadataMatch match) async {
    final l = AppLocalizations.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final api = container.read(apiProvider);
    if (api == null) return;
    setState(() {
      _matching = match.id;
      _error = null;
    });
    try {
      final updated = await api.titles.identify(
        widget.title.id,
        providerId: match.id,
      );
      container.read(mediaChangesProvider.notifier).changed();
      unawaited(
        container
            .read(toastProvider)
            .show(
              l.titleIdentifyMatched(updated.name),
              kind: ToastKind.success,
            ),
      );
      // Leaving the page drops the answer rather than taking the person
      // back from wherever they went.
      if (mounted) context.pop();
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = describeFailure(l, error);
        _matching = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final title = widget.title;
    final provider = ref.watch(libraryMetadataProvider(title.libraryId)).value;
    final results = ref.watch(matchesProvider(_search));
    final matches = results.value;
    final muted = KitText.sm.style(color: colors.mutedForeground);
    return ListView(
      padding: EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        0,
        CardMetrics.gutter,
        MediaQuery.paddingOf(context).bottom + 24,
      ),
      children: [
        if (provider != null) ...[
          Text(
            l.titleIdentifyDescription(provider.name, title.path),
            style: muted,
          ),
          const SizedBox(height: 16),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          spacing: 8,
          children: [
            Expanded(
              child: _Field(
                label: l.titleIdentifyName,
                child: MatineeTextField(
                  controller: _name,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _submit(),
                ),
              ),
            ),
            SizedBox(
              width: 92,
              child: _Field(
                label: l.titleIdentifyYear,
                child: MatineeTextField(
                  controller: _year,
                  placeholder: l.titleIdentifyAnyYear,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.search,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  onSubmitted: (_) => _submit(),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: MatineeButton(
            look: ButtonLook.secondary,
            leading: Lucide.search,
            onPressed: _submit,
            child: Text(l.titleIdentifySearch),
          ),
        ),
        const SizedBox(height: 12),
        if (_error case final error?) ...[
          Text(error, style: KitText.sm.style(color: colors.danger)),
          const SizedBox(height: 8),
        ],
        if (matches == null && results.hasError)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: FailureState(
              title: l.titleIdentifyFailed,
              error: results.error!,
              onRetry: () => ref.invalidate(matchesProvider(_search)),
            ),
          )
        else if (matches == null || results.isLoading)
          Padding(
            padding: const EdgeInsets.all(32),
            child: LoadingState(label: l.loadingInProgress),
          )
        else if (matches.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Text(
              l.titleIdentifyEmpty(provider?.name ?? '', _search.query),
              textAlign: TextAlign.center,
              style: muted,
            ),
          )
        else
          for (final match in matches)
            MatchRow(
              match: match,
              current: match.id == title.providerId,
              pending: _matching == match.id,
              onPressed: _matching == null ? () => _pick(match) : null,
            ),
      ],
    );
  }
}

/// A field's label over it.
class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 6,
    children: [
      Text(
        label,
        style: KitText.px13.style(
          color: MatineeTheme.of(context).mutedForeground,
          weight: FontWeight.w500,
        ),
      ),
      child,
    ],
  );
}

/// A provider's entry: its poster, name and year, whether it's the match
/// now, and what it's about.
class MatchRow extends StatelessWidget {
  const MatchRow({
    super.key,
    required this.match,
    required this.current,
    required this.pending,
    required this.onPressed,
  });

  final MetadataMatch match;
  final bool current;
  final bool pending;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final poster = match.poster;
    final overview = match.overview;
    return PressIndication(
      onPressed: onPressed,
      shape: KitRadius.control,
      label: [
        match.name,
        ?match.year?.toString(),
        if (current) l.titleIdentifyCurrent,
      ].join(', '),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 12,
              children: [
                SizedBox(
                  width: 48,
                  child: ArtFrame(
                    toneKey: match.id,
                    aspectRatio: CardMetrics.poster,
                    children: [
                      if (poster != null)
                        Picture([
                          ArtSource(poster, largest: ArtworkSize.thumb),
                        ]),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            match.name,
                            style: KitText.base.style(
                              color: colors.foreground,
                              weight: FontWeight.w500,
                            ),
                          ),
                          if (match.year case final year?)
                            Text(
                              '$year',
                              style: KitText.sm.style(
                                color: colors.mutedForeground,
                              ),
                            ),
                          if (current) Badge(l.titleIdentifyCurrent),
                        ],
                      ),
                      if (overview != null)
                        Text(
                          overview,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.px13.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (pending) Spinner(size: 18, color: colors.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
