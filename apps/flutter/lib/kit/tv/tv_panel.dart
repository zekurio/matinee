import 'dart:async';

import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/widgets.dart';

import '../motion.dart';
import '../spinner.dart';
import '../theme.dart';
import 'tv_focus.dart';
import 'tv_list.dart';
import 'tv_metrics.dart';

/// How many side panels are open, so the clock can step aside.
final tvOpenPanels = ValueNotifier<int>(0);

/// Opens a panel at the screen's right edge over a dimmed page: focus stays in
/// it, Back closes it, and focus goes back to what opened it. [builder] gives
/// its rows; the one that should take focus first sets `autofocus`, or the
/// first row takes it. [loading] shows a spinner in place of the rows while
/// it's true. Returns what the panel was closed with.
Future<T?> showTvPanel<T>(
  BuildContext context, {
  required List<Widget> Function(BuildContext context) builder,
  String? title,
  String? description,
  bool Function(BuildContext context)? loading,
}) => Navigator.of(context, rootNavigator: true).push(
  TvPanelRoute<T>(
    builder: builder,
    title: title,
    description: description,
    loading: loading,
  ),
);

/// The route [showTvPanel] pushes.
class TvPanelRoute<T> extends PopupRoute<T> {
  TvPanelRoute({
    required this.builder,
    this.title,
    this.description,
    this.loading,
  });

  final List<Widget> Function(BuildContext context) builder;
  final String? title;
  final String? description;
  final bool Function(BuildContext context)? loading;

  @override
  Color? get barrierColor => null;

  @override
  bool get barrierDismissible => true;

  @override
  String? get barrierLabel => title ?? 'panel';

  @override
  Duration get transitionDuration => TvMotion.move;

  @override
  Duration get reverseTransitionDuration => TvMotion.exit;

  @override
  TickerFuture didPush() {
    tvOpenPanels.value++;
    return super.didPush();
  }

  @override
  void dispose() {
    tvOpenPanels.value--;
    super.dispose();
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => TvFocusRules(
    child: TvSidePanel(
      title: title,
      description: description,
      loading: loading,
      builder: builder,
    ),
  );

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final slide = CurvedAnimation(
      parent: animation,
      curve: TvMotion.easing,
      reverseCurve: TvMotion.exitEasing,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        IgnorePointer(
          child: FadeTransition(
            opacity: animation,
            child: const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0x59000000), Color(0xD9000000)],
                ),
              ),
            ),
          ),
        ),
        SlideTransition(
          position: Tween(
            begin: const Offset(1, 0),
            end: Offset.zero,
          ).animate(slide),
          child: FadeTransition(opacity: animation, child: child),
        ),
      ],
    );
  }
}

/// A panel's frame at the right edge: its heading and its rows, which
/// Between the panel's title and its first row.
const _listTop = 20.0;

/// A [TvListHeading]'s height with the gap under it.
const _headingRoom = 40.0;

/// scroll to keep the focused one in view.
class TvSidePanel extends StatefulWidget {
  const TvSidePanel({
    super.key,
    required this.builder,
    this.title,
    this.description,
    this.loading,
  });

  final String? title;
  final String? description;
  final bool Function(BuildContext context)? loading;
  final List<Widget> Function(BuildContext context) builder;

  @override
  State<TvSidePanel> createState() => _TvSidePanelState();
}

class _TvSidePanelState extends State<TvSidePanel> {
  final _scroll = ScrollController();
  final _scope = FocusScopeNode(debugLabel: 'panel');

  @override
  void dispose() {
    _scroll.dispose();
    _scope.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final loading = widget.loading?.call(context) ?? false;
    final rows = loading ? const <Widget>[] : widget.builder(context);
    if (!loading) {
      // Nothing in the panel asked for focus: its first row takes it. A
      // row's autofocus lands in a microtask queued during the build, after
      // this frame's callbacks, so this waits behind it.
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => scheduleMicrotask(() {
          if (!mounted || _scope.focusedChild != null) return;
          final first = _scope.traversalDescendants.firstOrNull;
          first?.requestFocus();
        }),
      );
    }
    return Align(
      alignment: AlignmentDirectional.centerEnd,
      child: GestureDetector(
        // A click between the rows stays in the panel.
        onTap: () {},
        child: SizedBox(
          width: TvPanels.width,
          height: double.infinity,
          child: ColoredBox(
            color: colors.surfaceRaised,
            child: FocusScope(
              node: _scope,
              child: Padding(
                padding: const EdgeInsets.only(top: Overscan.vertical + 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.title case final title?)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: TvPanels.textStart,
                        ),
                        child: Semantics(
                          header: true,
                          // Three lines, so a long name with what's done
                          // to it, as "… anfragen", reads whole.
                          child: Text(
                            title,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TvType.headline.style(
                              color: colors.foreground,
                            ),
                          ),
                        ),
                      ),
                    if (widget.description case final text?)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          TvPanels.textStart,
                          6,
                          TvPanels.textStart,
                          0,
                        ),
                        child: Text(
                          text,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TvType.body.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ),
                    if (loading)
                      Padding(
                        padding: const EdgeInsets.only(top: 40),
                        child: Center(
                          child: Spinner(
                            size: 28,
                            color: colors.mutedForeground,
                          ),
                        ),
                      )
                    else
                      Expanded(
                        // Once scrolled, a row half under the title fades
                        // out over the room the focused row keeps above
                        // it, rather than read as a row cut against it.
                        // At the top nothing fades, the first row least.
                        child: ListenableBuilder(
                          listenable: _scroll,
                          builder: (context, list) => TvFadeTop(
                            fade:
                                _scroll.hasClients &&
                                    _scroll.position.pixels > 0
                                ? _listTop + _headingRoom - 4
                                : 0,
                            child: list!,
                          ),
                          child: TvFollowFocus(
                            controller: _scroll,
                            // Coming back up, room above the row for a
                            // heading over it, so a group's first row shows
                            // with its heading.
                            rule: TvFollowFocus.clear(
                              start: _listTop + _headingRoom,
                              end: 40,
                            ),
                            child: ListView(
                              controller: _scroll,
                              scrollCacheExtent: const ScrollCacheExtent.pixels(
                                4000,
                              ),
                              padding: const EdgeInsets.fromLTRB(
                                TvPanels.listPadding,
                                _listTop,
                                TvPanels.listPadding,
                                Overscan.vertical + 16,
                              ),
                              children: [
                                for (final (index, row) in rows.indexed)
                                  Padding(
                                    padding: EdgeInsets.only(
                                      top: index == 0 ? 0 : 4,
                                    ),
                                    child: row,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A choice in a [showTvPicker] panel.
class TvOption<T> {
  const TvOption(this.value, this.label, {this.detail});

  final T value;
  final String label;
  final String? detail;
}

/// A panel to pick one of [options], [current] checked and focused first.
/// Returns the one picked, or null when Back closed it or the person
/// picked [current] again.
Future<T?> showTvPicker<T>(
  BuildContext context, {
  required String title,
  required List<TvOption<T>> options,
  required T current,
  String? description,
}) async {
  final picked = await showTvPanel<TvOption<T>>(
    context,
    title: title,
    description: description,
    builder: (context) => [
      for (final option in options)
        TvListItem(
          title: option.label,
          quiet: true,
          checked: option.value == current,
          autofocus: option.value == current,
          trailing: option.detail == null
              ? null
              : TvListValue(option.detail!, chevron: false),
          onPressed: () => Navigator.of(context).pop(option),
        ),
    ],
  );
  if (picked == null || picked.value == current) return null;
  return picked.value;
}
