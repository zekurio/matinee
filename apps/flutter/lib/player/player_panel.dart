import 'package:flutter/widgets.dart';

import '../kit/kit.dart';
import 'player_motion.dart';

/// One line of a player menu: a heading, a note, a divider, or a choice.
sealed class PanelEntry {
  const PanelEntry();
}

class PanelHeading extends PanelEntry {
  const PanelHeading(this.text);

  final String text;
}

class PanelNote extends PanelEntry {
  const PanelNote(this.text);

  final String text;
}

class PanelDivider extends PanelEntry {
  const PanelDivider();
}

/// A choice, current when [selected]; [pick] makes it so.
class PanelChoice extends PanelEntry {
  const PanelChoice(
    this.title, {
    this.detail,
    required this.selected,
    this.enabled = true,
    required this.pick,
  });

  final String title;
  final String? detail;
  final bool selected;
  final bool enabled;
  final VoidCallback pick;
}

/// A menu's panel at the side, drawn in the player's own window: it slides in
/// from the end over a shade, [entries] in a column the screen's height. A tap
/// on the shade or Back closes it, and so does a pick. The entries that were
/// open stay drawn while it slides away.
class PlayerPanel extends StatefulWidget {
  const PlayerPanel({
    super.key,
    required this.entries,
    required this.dismissLabel,
    required this.onDismiss,
  });

  /// What the panel lists, or null while it's closed.
  final List<PanelEntry>? entries;
  final String dismissLabel;
  final VoidCallback onDismiss;

  @override
  State<PlayerPanel> createState() => _PlayerPanelState();
}

class _PlayerPanelState extends State<PlayerPanel>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: PlayerMotion.move,
    value: widget.entries == null ? 0 : 1,
  )..addStatusListener((_) => setState(() {}));
  late final _slide = CurvedAnimation(
    parent: _controller,
    curve: PlayerMotion.easing,
  );
  late List<PanelEntry> _last = widget.entries ?? const [];

  @override
  void didUpdateWidget(PlayerPanel old) {
    super.didUpdateWidget(old);
    if (widget.entries case final entries?) _last = entries;
    final open = widget.entries != null;
    if (open == (old.entries != null)) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = open ? 1 : 0;
    } else if (open) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _slide.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final open = widget.entries != null;
    if (_controller.isDismissed && !open) return const SizedBox.shrink();
    final colors = MatineeTheme.of(context);
    final padding = MediaQuery.paddingOf(context);
    return PopScope(
      canPop: !open,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) widget.onDismiss();
      },
      child: IgnorePointer(
        ignoring: !open,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = (constraints.maxWidth * .42)
                .clamp(300.0, 420.0)
                .clamp(0.0, constraints.maxWidth)
                .toDouble();
            return Stack(
              fit: StackFit.expand,
              children: [
                FadeTransition(
                  opacity: _slide,
                  child: Semantics(
                    label: widget.dismissLabel,
                    button: true,
                    onTap: widget.onDismiss,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: widget.onDismiss,
                      child: const ColoredBox(color: Color(0x73000000)),
                    ),
                  ),
                ),
                PositionedDirectional(
                  top: 0,
                  bottom: 0,
                  end: 0,
                  width: width,
                  child: SlideTransition(
                    position: Tween(
                      begin: const Offset(1, 0),
                      end: Offset.zero,
                    ).animate(_slide),
                    child: FadeTransition(
                      opacity: _slide,
                      child: ClipRRect(
                        borderRadius: const BorderRadiusDirectional.horizontal(
                          start: Radius.circular(16),
                        ).resolve(Directionality.of(context)),
                        child: ColoredBox(
                          color: colors.surfaceRaised,
                          child: ListView(
                            padding: EdgeInsetsDirectional.only(
                              top: padding.top + 12,
                              bottom: padding.bottom + 12,
                              end:
                                  Directionality.of(context) ==
                                      TextDirection.ltr
                                  ? padding.right
                                  : padding.left,
                            ),
                            children: [
                              for (final entry in _last) _entry(entry, colors),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _entry(PanelEntry entry, KitColors colors) => switch (entry) {
    PanelHeading(:final text) => Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Text(
          text,
          style: KitText.base.style(
            color: colors.foreground,
            weight: FontWeight.w600,
          ),
        ),
      ),
    ),
    PanelNote(:final text) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Text(
        text,
        style: KitText.px13.style(color: colors.mutedForeground),
      ),
    ),
    PanelDivider() => Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: SizedBox(height: 1, child: ColoredBox(color: colors.border)),
    ),
    PanelChoice() => _PanelRow(
      entry,
      onPressed: entry.enabled
          ? () {
              entry.pick();
              widget.onDismiss();
            }
          : null,
    ),
  };
}

/// One choice in a menu, heard as a radio button that's checked when picked.
class _PanelRow extends StatelessWidget {
  const _PanelRow(this.choice, {required this.onPressed});

  final PanelChoice choice;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      selected: choice.selected,
      checked: choice.selected,
      inMutuallyExclusiveGroup: true,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: switch (state) {
            PressState.pressed => .12,
            PressState.idle => 0.0,
            _ => .08,
          },
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        choice.title,
                        style: KitText.base.style(
                          color: choice.enabled
                              ? colors.foreground
                              : colors.textFaint,
                        ),
                      ),
                      if (choice.detail case final detail?
                          when detail.isNotEmpty)
                        Text(
                          detail,
                          style: KitText.px13.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (choice.selected)
                  KitIcon(Lucide.check, size: 18, color: colors.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
