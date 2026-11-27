import 'package:flutter/material.dart';

import 'motion.dart';

/// A page that opens over another as the theme says: on Android the kit's
/// fade (`page_motion.dart`), on iOS Cupertino's slide, which brings the
/// swipe back from the screen's edge.
Page<void> kitPage({
  required LocalKey key,
  required String? name,
  required Widget child,
}) => MaterialPage<void>(
  key: key,
  name: name,
  child: NoHeroes(child: child),
);

/// A page's content, which no hero flies from or to. The app has no
/// heroes, but each navigator has a hero controller, go_router's own,
/// which on every push and pop walks every element of both pages looking
/// for them, the tabs' shell with all its tabs included. A disabled
/// [HeroMode] ends the walk where it starts.
class NoHeroes extends StatelessWidget {
  const NoHeroes({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => HeroMode(enabled: false, child: child);
}

/// A page that fades in over what was there, over [KitMotion.enter], and out
/// over [KitMotion.exit]: one state of a place taking another's, like a
/// sign-in step for the next, or the app for the sign-in.
///
/// A [kitPage] opened over it moves it as the theme moves a page it
/// covers, as it would any page of another kind. Flutter wraps a page in
/// that motion only while it's covered, and the wrapper coming and going
/// moves the page's whole subtree to a new parent, which rebuilds and lays
/// out everything in it that depends on an inherited widget, in the first
/// frame of the cover and the last of the uncover. For the tabs' shell
/// that's every tab. So this page wraps itself, always: in the theme's
/// motion while a page over it hands it on, and held still in the same
/// widgets otherwise, which leaves the subtree where it is.
class FadePage extends Page<void> {
  const FadePage({super.key, super.name, required this.child});

  final Widget child;

  @override
  Route<void> createRoute(BuildContext context) => _FadeRoute(this);
}

class _FadeRoute extends PageRoute<void> {
  _FadeRoute(FadePage page) : super(settings: page);

  // SAFETY: the route is made by [FadePage.createRoute] with that page as
  // its settings, and a navigator only updates it with a page of the same
  // type and key.
  FadePage get _page => settings as FadePage;

  /// The motion the page over this one hands on, while there's one that
  /// does. It's given as this page's own, [delegatedTransition]: Flutter,
  /// finding the two alike, leaves this page as it is, and
  /// [buildTransitions] applies the motion instead.
  DelegatedTransitionBuilder? _covering;

  @override
  DelegatedTransitionBuilder? get delegatedTransition => _covering;

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  @override
  bool get maintainState => true;

  @override
  Duration get transitionDuration => KitMotion.enter;

  @override
  Duration get reverseTransitionDuration => KitMotion.exit;

  @override
  void didChangeNext(Route<dynamic>? nextRoute) {
    _coveredBy(nextRoute);
    super.didChangeNext(nextRoute);
  }

  @override
  void didPopNext(Route<dynamic> nextRoute) {
    _coveredBy(nextRoute);
    super.didPopNext(nextRoute);
  }

  void _coveredBy(Route<dynamic>? next) {
    _covering = next is ModalRoute && canTransitionTo(next)
        ? next.delegatedTransition
        : null;
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) => Semantics(
    scopesRoute: true,
    explicitChildNodes: true,
    child: NoHeroes(child: _page.child),
  );

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final faded = MediaQuery.disableAnimationsOf(context)
        ? child
        : FadeTransition(
            opacity: animation.drive(CurveTween(curve: KitMotion.easing)),
            child: child,
          );
    final theme = Theme.of(context);
    final covered = theme.pageTransitionsTheme.delegatedTransition(
      theme.platform,
    );
    return covered?.call(
          context,
          animation,
          _covering == null ? kAlwaysDismissedAnimation : secondaryAnimation,
          allowSnapshotting,
          faded,
        ) ??
        faded;
  }
}
