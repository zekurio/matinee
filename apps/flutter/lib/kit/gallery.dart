import 'dart:async';

import 'package:flutter/widgets.dart';

import 'kit.dart';

enum GalleryGroup {
  buttons('Buttons'),
  fields('Fields and filters'),
  playback('Playback and navigation'),
  overlays('Overlays'),
  calendar('Calendar');

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
  };

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
