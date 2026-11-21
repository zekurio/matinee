import 'dart:async';

import 'package:flutter/widgets.dart';

import 'kit.dart';

enum GalleryGroup {
  buttons('Buttons'),
  fields('Fields and filters'),
  playback('Playback and navigation'),
  overlays('Overlays'),
  calendar('Calendar'),
  signIn('Sign-in'),
  media('Media'),
  pages('Pages and states');

  const GalleryGroup(this.title);

  final String title;
}

/// An interactive reference for the kit. [group] isolates one section for review.
class KitGallery extends StatefulWidget {
  const KitGallery({super.key, this.group});

  final GalleryGroup? group;

  @override
  State<KitGallery> createState() => _KitGalleryState();
}

class _KitGalleryState extends State<KitGallery> {
  final _tabs = TabBarState('home');
  final _toasts = ToastState();
  final _search = TextEditingController(text: 'Late show');
  bool _checked = true;
  bool _switchOn = true;
  bool _chipOn = true;
  bool _searchOpen = true;
  int _choice = 0;
  int _library = 0;
  int _page = 1;
  double _volume = .55;
  RangeValues _range = const RangeValues(.22, .76);
  DateTime? _date = DateTime(2026, 11, 19);

  @override
  void dispose() {
    _tabs.dispose();
    _toasts.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final group = widget.group;
    final showTabs = group == null || group == GalleryGroup.playback;
    return ColoredBox(
      color: colors.background,
      child: DefaultTextStyle(
        style: KitText.sm.style(color: colors.foreground),
        child: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              Positioned.fill(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(24, 26, 24, showTabs ? 92 : 32),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Semantics(
                            header: true,
                            child: Text(
                              group?.title ?? 'Matinee UI kit',
                              style: KitText.px28.style(
                                color: colors.foreground,
                                weight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: 22),
                          if (group != null)
                            _group(group)
                          else
                            for (final section in GalleryGroup.values) ...[
                              _heading(section.title),
                              _group(section),
                              const SizedBox(height: 24),
                            ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              if (showTabs)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Stack(
                    children: [
                      if (group == GalleryGroup.playback)
                        const Positioned.fill(child: _GlassSample()),
                      TabBar(
                        label: 'Main navigation',
                        state: _tabs,
                        items: const [
                          TabBarItem(
                            id: 'home',
                            icon: Lucide.house,
                            label: 'Home',
                          ),
                          TabBarItem(
                            id: 'library',
                            icon: Lucide.libraryBig,
                            label: 'Library',
                          ),
                          TabBarItem(
                            id: 'search',
                            icon: Lucide.search,
                            label: 'Search',
                          ),
                          TabBarItem(
                            id: 'profile',
                            icon: Lucide.userRound,
                            label: 'Profile',
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              PositionedDirectional(
                end: 0,
                start: 0,
                bottom: showTabs ? 62 : 0,
                child: Align(
                  alignment: AlignmentDirectional.bottomEnd,
                  child: ToastHost(state: _toasts),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _heading(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: KitText.base.style(
          color: MatineeTheme.of(context).foreground,
          weight: FontWeight.w600,
        ),
      ),
    ),
  );

  Widget _group(GalleryGroup group) => switch (group) {
    GalleryGroup.buttons => _buttons(),
    GalleryGroup.fields => _fields(),
    GalleryGroup.playback => _playback(),
    GalleryGroup.overlays => _overlays(),
    GalleryGroup.calendar => _calendar(),
    GalleryGroup.signIn => _signIn(),
    GalleryGroup.media => const _MediaSamples(),
    GalleryGroup.pages => const _PageSamples(),
  };

  Widget _signIn() => const Column(
    crossAxisAlignment: CrossAxisAlignment.center,
    spacing: 20,
    children: [
      Logo(label: 'Matinee'),
      QrCodeCard(
        text: 'https://media.example.com/link?code=BCDF-GHJK',
        label: 'QR code for the code BCDF-GHJK',
      ),
    ],
  );

  Widget _buttons() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 12,
    children: [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          MatineeButton(
            onPressed: () {},
            leading: Lucide.play,
            child: const Text('Play'),
          ),
          MatineeButton(
            onPressed: () {},
            look: ButtonLook.outline,
            child: const Text('Details'),
          ),
          MatineeButton(
            onPressed: () {},
            look: ButtonLook.secondary,
            child: const Text('Queue'),
          ),
          MatineeButton(
            onPressed: () {},
            look: ButtonLook.ghost,
            child: const Text('Skip'),
          ),
          MatineeButton(
            onPressed: () {},
            look: ButtonLook.destructive,
            leading: Lucide.trash,
            child: const Text('Remove'),
          ),
          MatineeButton(
            onPressed: () {},
            look: ButtonLook.link,
            child: const Text('All titles'),
          ),
        ],
      ),
      _OnGlass(
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            MatineeButton(
              onPressed: () {},
              look: ButtonLook.frosted,
              leading: Lucide.info,
              child: const Text('Details'),
            ),
            MatineeButton(
              onPressed: () {},
              look: ButtonLook.glass,
              leading: Lucide.play,
              child: const Text('Trailer'),
            ),
            MatineeButton(
              onPressed: () {},
              look: ButtonLook.frosted,
              size: ButtonSize.xl,
              trailing: Lucide.fastForward,
              child: const Text('Skip intro'),
            ),
            RoundIconButton(
              icon: Lucide.arrowLeft,
              label: 'Back',
              onPressed: () {},
              size: 52,
              iconSize: 26,
              background: const Color(0x00000000),
            ),
            RoundIconButton(
              icon: Lucide.captions,
              label: 'Subtitles',
              onPressed: () {},
              size: 52,
              iconSize: 26,
              background: const Color(0x00000000),
            ),
          ],
        ),
      ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.xs,
            child: const Text('Extra small'),
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.sm,
            child: const Text('Small'),
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.lg,
            child: const Text('Large'),
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.xl,
            child: const Text('Extra large'),
          ),
          const MatineeButton(onPressed: null, child: Text('Unavailable')),
          MatineeButton(
            dimmed: true,
            onPressed: () =>
                unawaited(_toasts.show('Available after the first episode')),
            child: const Text('Dimmed'),
          ),
        ],
      ),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.iconXs,
            look: ButtonLook.outline,
            label: 'Add',
            leading: Lucide.plus,
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.iconSm,
            look: ButtonLook.outline,
            label: 'Favorite',
            leading: Lucide.heart,
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.icon,
            look: ButtonLook.secondary,
            label: 'Favorited',
            leading: Lucide.heartFilled,
          ),
          MatineeButton(
            onPressed: () {},
            size: ButtonSize.iconLg,
            look: ButtonLook.secondary,
            label: 'Rated',
            leading: Lucide.star,
          ),
          RoundIconButton(
            icon: Lucide.heart,
            label: 'Mark as favorite',
            onPressed: () {},
          ),
          const RoundIconButton(
            icon: Lucide.skipForward,
            label: 'No next episode',
            onPressed: null,
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 1,
            children: [
              MatineeButton(
                onPressed: () {},
                shape: const BorderRadiusDirectional.horizontal(
                  start: Radius.circular(KitRadius.lg),
                ),
                leading: Lucide.play,
                child: const Text('Resume'),
              ),
              MatineeButton(
                onPressed: () {},
                size: ButtonSize.icon,
                shape: const BorderRadiusDirectional.horizontal(
                  end: Radius.circular(KitRadius.lg),
                ),
                label: 'Playback options',
                leading: Lucide.chevronDown,
              ),
            ],
          ),
        ],
      ),
    ],
  );

  Widget _fields() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 12,
    children: [
      const MatineeTextField(
        label: 'Server',
        placeholder: 'https://matinee.example',
        leading: Lucide.server,
      ),
      const MatineeTextField(
        label: 'Library name',
        error: 'Enter a name for this library',
      ),
      const MatineeTextField(enabled: false, placeholder: 'Read-only setting'),
      Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Checkbox(
            checked: _checked,
            label: 'Season 1',
            onChanged: (value) => setState(() => _checked = value),
          ),
          Checkbox(
            checked: !_checked,
            label: 'Season 2',
            onChanged: (value) => setState(() => _checked = !value),
          ),
          const Checkbox(checked: true, label: 'Season 3', onChanged: null),
          Switch(
            checked: _switchOn,
            label: 'Autoplay',
            onChanged: (value) => setState(() => _switchOn = value),
          ),
          Switch(
            checked: !_switchOn,
            size: SwitchSize.sm,
            label: 'Subtitles',
            onChanged: (value) => setState(() => _switchOn = !value),
          ),
          const Switch(checked: false, label: 'Sharing', onChanged: null),
        ],
      ),
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          ChoiceChip(
            label: 'All',
            selected: _choice == 0,
            onPressed: () => setState(() => _choice = 0),
          ),
          ChoiceChip(
            label: 'Films',
            selected: _choice == 1,
            onPressed: () => setState(() => _choice = 1),
          ),
          ToggleChip(
            label: 'Watched',
            count: '12',
            checked: _chipOn,
            onChanged: (value) => setState(() => _chipOn = value),
          ),
          const ToggleChip(label: 'Archived', checked: false, onChanged: null),
          RemovableChip(
            label: 'Drama',
            removeLabel: 'Remove filter Drama',
            onRemove: () {},
          ),
        ],
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RadioRow(
            label: 'Films',
            detail: 'Radarr',
            selected: _library == 0,
            onPressed: () => setState(() => _library = 0),
          ),
          RadioRow(
            label: 'Films in 4K',
            detail: 'Radarr 4K',
            selected: _library == 1,
            onPressed: () => setState(() => _library = 1),
          ),
        ],
      ),
      Row(
        spacing: 8,
        children: [
          SearchPill(
            expanded: false,
            searchLabel: 'Open search',
            onOpen: () => setState(() => _searchOpen = true),
            onClose: () {},
          ),
          Expanded(
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: SearchPill(
                expanded: _searchOpen,
                searchLabel: 'Search the library',
                backLabel: 'Back from search',
                clearLabel: 'Clear search',
                controller: _search,
                onOpen: () => setState(() => _searchOpen = true),
                onClose: () => setState(() => _searchOpen = false),
              ),
            ),
          ),
        ],
      ),
    ],
  );

  Widget _playback() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 12,
    children: [
      const Text('Volume'),
      Slider(
        value: _volume,
        label: 'Volume',
        onChanged: (value) => setState(() => _volume = value),
      ),
      const Text('Release years'),
      RangeSlider(
        values: _range,
        label: 'Release years',
        divisions: 20,
        onChanged: (value) => setState(() => _range = value),
      ),
      const Slider(
        value: .35,
        compact: true,
        label: 'Unavailable volume',
        onChanged: null,
      ),
      const SizedBox(height: 4),
      const Row(
        spacing: 14,
        children: [
          ProgressRing(null, label: 'Pending'),
          ProgressRing(0, label: 'Not started'),
          ProgressRing(.62, label: '62 percent'),
          ProgressRing(1, label: 'Complete'),
          Spinner(label: 'Loading'),
        ],
      ),
      PageDots(
        count: 5,
        current: _page,
        labelForPage: (index) => 'Show page ${index + 1}',
        onSelected: (index) => setState(() => _page = index),
      ),
    ],
  );

  Widget _overlays() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 16,
    children: [
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          MatineeButton(
            look: ButtonLook.outline,
            onPressed: () => unawaited(
              Dialog.show<void>(
                context,
                dismissLabel: 'Dismiss dialog',
                builder: (context) => Dialog(
                  title: 'Playback details',
                  description: 'Choose how this title plays on this device.',
                  closeLabel: 'Close dialog',
                  onClose: () => Navigator.pop(context),
                  actions: [
                    MatineeButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Done'),
                    ),
                  ],
                ),
              ),
            ),
            child: const Text('Dialog'),
          ),
          MatineeButton(
            look: ButtonLook.outline,
            onPressed: () => unawaited(
              ConfirmDialog.show(
                context,
                title: 'Remove download?',
                description: 'You can download it again from the library.',
                confirmLabel: 'Remove',
                cancelLabel: 'Cancel',
                destructive: true,
                compact: true,
              ),
            ),
            child: const Text('Confirm dialog'),
          ),
          MatineeButton(
            look: ButtonLook.outline,
            onPressed: () => unawaited(
              Sheet.show<void>(
                context,
                dismissLabel: 'Dismiss sheet',
                builder: (context) => Sheet(
                  title: 'Playback options',
                  description: 'Choose an audio track for this title.',
                  footer: MatineeButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Done'),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 6,
                    children: [
                      MatineeButton(
                        look: ButtonLook.secondary,
                        leading: Lucide.audioLines,
                        onPressed: () {},
                        child: const Text('Original audio'),
                      ),
                      MatineeButton(
                        look: ButtonLook.ghost,
                        leading: Lucide.audioLines,
                        onPressed: () {},
                        child: const Text('Audio description'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            child: const Text('Sheet'),
          ),
          Menu(
            trigger: (context, toggle, isOpen, focus) => MatineeButton(
              look: ButtonLook.outline,
              trailing: Lucide.chevronDown,
              onPressed: toggle,
              focusNode: focus,
              child: const Text('Menu'),
            ),
            children: [
              const MenuLabel('Library'),
              MenuItem(
                onPressed: () {},
                autofocus: true,
                icon: Lucide.heart,
                label: 'Favorite',
              ),
              MenuItem(
                onPressed: () {},
                selected: true,
                icon: Lucide.check,
                label: 'Watched',
              ),
              const MenuItem(
                onPressed: null,
                icon: Lucide.download,
                label: 'Download',
              ),
              const MenuSeparator(),
              MenuItem(
                onPressed: () {},
                destructive: true,
                icon: Lucide.trash,
                label: 'Remove',
              ),
            ],
          ),
          MatineeButton(
            look: ButtonLook.outline,
            onPressed: () => unawaited(
              _toasts.show(
                'Removed from queue',
                actionLabel: 'Undo',
                closeLabel: 'Close notification',
                kind: ToastKind.success,
              ),
            ),
            child: const Text('Toast'),
          ),
        ],
      ),
      _OnGlass(
        child: Toast(
          message: 'Added to library',
          description: 'This title is ready to play.',
          kind: ToastKind.success,
          actionLabel: 'Undo',
          closeLabel: 'Close notification',
          onAction: () {},
          onClose: () {},
        ),
      ),
      const Toast(message: 'Checking for downloads', kind: ToastKind.loading),
      const Toast(message: 'Storage is almost full', kind: ToastKind.warning),
      const Toast(message: 'Could not start playback', kind: ToastKind.error),
      const Toast(
        message: 'The library refreshes overnight',
        kind: ToastKind.info,
      ),
      const Toast(message: 'Your library is up to date'),
    ],
  );

  Widget _calendar() => Align(
    alignment: AlignmentDirectional.centerStart,
    child: Calendar(
      selected: _date,
      today: DateTime(2026, 11, 15),
      latest: DateTime(2026, 11, 24),
      onSelected: (date) => setState(() => _date = date),
    ),
  );
}

class _OnGlass extends StatelessWidget {
  const _OnGlass({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: KitRadius.panel,
    child: Stack(
      children: [
        const Positioned.fill(child: _GlassSample()),
        Padding(padding: const EdgeInsets.all(14), child: child),
      ],
    ),
  );
}

class _GlassSample extends StatelessWidget {
  const _GlassSample();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [Color(0xFF262C66), Color(0xFF78547B), Color(0xFFBD765B)],
        stops: [0, .52, 1],
      ),
    ),
    child: Row(
      children: [
        Spacer(flex: 2),
        Expanded(
          child: ColoredBox(color: Color(0x44222848), child: SizedBox.expand()),
        ),
        Spacer(flex: 2),
        Expanded(
          child: ColoredBox(color: Color(0x4492539B), child: SizedBox.expand()),
        ),
        Spacer(),
      ],
    ),
  );
}

/// Posters, stills, a rail, a grid, the page frame, and the states a
/// media page shows while it loads, has nothing, or failed. Pictures are
/// painted stand-ins: the kit loads nothing.
class _MediaSamples extends StatelessWidget {
  const _MediaSamples();

  static const _posters = [
    ('Arrival', '7.9 · 2016', Color(0xFF3B5B7A), Color(0xFF0E1A26)),
    ('The Expanse', '6 new episodes', Color(0xFF7A3B2E), Color(0xFF1C0D0A)),
    ('Paterson', '2016', Color(0xFF6E7A3B), Color(0xFF181C0B)),
    ('Severance', 'Season 2 · 3 new episodes', null, null),
  ];

  @override
  Widget build(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    const poster = 132.0;
    const wide = 220.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 20,
      children: [
        Rail(
          title: 'Recently added in Movies',
          onSeeAll: () {},
          seeAllLabel: 'See all',
          itemWidth: poster,
          itemHeight: CardMetrics.height(poster, CardMetrics.poster, scaler),
          itemCount: _posters.length,
          itemBuilder: (context, index) {
            final (name, detail, from, to) = _posters[index];
            return PosterCard(
              name: name,
              detail: detail,
              // A list sorted by score: the star is an icon, since the
              // font has no character for it.
              detailIcon: index == 0 ? Lucide.star : null,
              detailLabel: index == 0 ? 'Score 7.9, 2016' : null,
              watchedLabel: index == 2 ? 'Watched' : null,
              art: from == null ? null : _SampleArt(from, to!),
              onPressed: () {},
            );
          },
        ),
        Rail(
          title: 'Continue watching',
          itemWidth: wide,
          itemHeight: CardMetrics.height(wide, CardMetrics.wide, scaler),
          itemCount: 3,
          itemBuilder: (context, index) => WideCard(
            name: ['The Expanse', 'Arrival', 'Severance'][index],
            detail: [
              'S2, E5: Home · 12 min left',
              '1 h 2 min left',
              'S1, E1: Good News About Hell',
            ][index],
            art: index == 2
                ? null
                : const _SampleArt(Color(0xFF2E5E7A), Color(0xFF101820)),
            progress: [.42, .7, null][index],
            watchedLabel: index == 2 ? 'Watched' : null,
            onPressed: () {},
            onPlay: () {},
            playLabel: 'Resume',
          ),
        ),
        Rail(
          title: 'Cast',
          itemWidth: 96,
          itemHeight: PersonCard.height(96, scaler),
          itemCount: 3,
          itemBuilder: (context, index) => PersonCard(
            name: ['Amy Adams', 'Jeremy Renner', 'Forest Whitaker'][index],
            role: ['Louise Banks', 'Ian Donnelly', 'Colonel Weber'][index],
            onPressed: () {},
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Badge('PG-13', outlined: true),
              const Badge('2160p'),
              const Badge('HDR10'),
              RoundIconButton(
                icon: Lucide.check,
                label: 'Mark unwatched',
                color: MatineeTheme.of(context).accent,
                toggled: true,
                onPressed: () {},
              ),
              RoundIconButton(
                icon: Lucide.heart,
                label: 'Add to favorites',
                onPressed: () {},
              ),
              RoundIconButton(
                icon: Lucide.ellipsis,
                label: 'More actions',
                onPressed: () {},
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SheetItem(
                icon: Lucide.rotateCcw,
                label: 'Play from the start',
                onPressed: () {},
              ),
              const SheetSeparator(),
              SheetItem(
                icon: Lucide.trash,
                label: 'Remove download',
                destructive: true,
                onPressed: () {},
              ),
            ],
          ),
        ),
        Rail(
          title: 'Nothing here',
          itemWidth: poster,
          itemHeight: 0,
          itemCount: 0,
          itemBuilder: (context, index) => const SizedBox(),
          empty: 'Nothing here yet.',
        ),
      ],
    );
  }
}

/// What a media page shows while it loads, has nothing, or failed, and
/// the frame of a page opened over the tabs.
class _PageSamples extends StatelessWidget {
  const _PageSamples();

  static const _posters = _MediaSamples._posters;

  @override
  Widget build(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    const poster = 132.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 20,
      children: [
        SizedBox(
          height: 150,
          child: DecoratedBox(
            position: DecorationPosition.foreground,
            decoration: BoxDecoration(
              border: Border.all(color: MatineeTheme.of(context).border),
              borderRadius: KitRadius.panel,
            ),
            child: ClipRRect(
              borderRadius: KitRadius.panel,
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: PageFrame(
                  title: 'Favorites',
                  backLabel: 'Back',
                  onBack: () {},
                  child: const Center(
                    child: EmptyState(
                      icon: Lucide.heart,
                      title: 'No favorites yet',
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const ErrorState(
          title: "Couldn't load Home",
          message: "The server isn't answering.",
          retryLabel: 'Try again',
          onRetry: _nothing,
          homeLabel: 'Back to Home',
          onHome: _nothing,
        ),
        const ErrorState(
          title: "Couldn't load this row",
          retryLabel: 'Try again',
          onRetry: _nothing,
          disconnected: true,
          disconnectedLabel: 'Server not reachable',
        ),
        const EmptyState(
          icon: Lucide.popcorn,
          title: 'Nothing to watch yet',
          message: 'Ask whoever runs this server to give you access.',
        ),
        const RailSkeleton(
          label: 'Loading',
          itemWidth: poster,
          aspectRatio: CardMetrics.poster,
        ),
        SizedBox(
          height: 2 * CardMetrics.height(100, CardMetrics.poster, scaler) + 20,
          child: CustomScrollView(
            physics: const NeverScrollableScrollPhysics(),
            slivers: [
              CardGrid(
                columns: (width) => 4,
                aspectRatio: CardMetrics.poster,
                itemCount: 6,
                itemBuilder: (context, index) => index.isEven
                    ? PosterCard(
                        name: _posters[index % 4].$1,
                        detail: _posters[index % 4].$2,
                        onPressed: () {},
                      )
                    : const CardSkeleton(aspectRatio: CardMetrics.poster),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

void _nothing() {}

/// A painted stand-in for a picture: two colors and a horizon.
class _SampleArt extends StatelessWidget {
  const _SampleArt(this.from, this.to);

  final Color from;
  final Color to;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [from, to],
      ),
    ),
    child: Align(
      alignment: const Alignment(.4, -.3),
      child: FractionallySizedBox(
        widthFactor: .3,
        child: AspectRatio(
          aspectRatio: 1,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Color.lerp(from, const Color(0xFFFFE8B0), .6),
            ),
          ),
        ),
      ),
    ),
  );
}
