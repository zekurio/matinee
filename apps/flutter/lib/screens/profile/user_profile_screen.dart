import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../query/failure_view.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import 'profile_data.dart';
import 'profile_sections.dart';

/// Another person's profile, opened from Search or a link: their picture and
/// name, and whichever of their favorites, statistics, and recent plays they
/// chose to share. The account rows and settings are the owner's alone, so
/// they stay on the profile tab.
class UserProfileScreen extends ConsumerStatefulWidget {
  const UserProfileScreen({super.key, required this.username});

  final String username;

  @override
  ConsumerState<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends ConsumerState<UserProfileScreen> {
  String get _username => widget.username;

  /// A deep link has no page under the profile, so that goes Home instead.
  void _back(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.home);
    }
  }

  /// Back on the tab, what they watched and their statistics may have moved
  /// on.
  void _returned() {
    ref
      ..invalidate(profileProvider(_username))
      ..invalidate(statsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final offline = ref.watch(authStateProvider) is Offline;
    final allowed = ref.watch(canProvider(Permission.profileRead));
    ref.listen(mediaChangesProvider, (_, _) => _returned());
    // Nothing is read for an account that may not see other profiles, and
    // offline there's no server to ask.
    final profile = offline || !allowed
        ? null
        : ref.watch(profileProvider(_username));
    final loaded = profile?.value;
    final sections = <Widget>[
      ProfileHeader(
        name: loaded?.user.name ?? _username,
        username: _username,
        avatarUrl: loaded?.user.avatarUrl,
        isAdmin: loaded?.user.role == UserRole.admin,
        joined: loaded?.user.createdAt,
      ),
    ];
    if (offline || !allowed) {
      sections.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: EmptyState(
            icon: offline ? Lucide.cloudOff : Lucide.lock,
            title: offline ? l.serverUnreachable : l.adminAccessNotAllowed,
          ),
        ),
      );
    } else if (profile != null) {
      if (loaded == null) {
        sections.add(
          profile.hasError && !profile.isLoading
              ? FailureState(
                  title: l.profileOtherLoadFailed,
                  error: profile.error!,
                  onRetry: () => ref.invalidate(profileProvider(_username)),
                )
              : SizedBox(
                  height: 120,
                  child: LoadingState(label: l.loadingInProgress),
                ),
        );
      } else {
        sections.addAll(_shared(context, loaded));
      }
    }
    return ReturnWatcher(
      path: Routes.userProfile(_username),
      onReturn: _returned,
      child: PageFrame(
        title: l.tabProfile,
        backLabel: l.commonBack,
        onBack: () => _back(context),
        child: ProfileColumn(sections: sections),
      ),
    );
  }

  /// What the profile shares, as the web's page shows it: the favorites they
  /// let people see, their statistics, and what they watched last. One who
  /// shares none of it says their profile is private instead.
  List<Widget> _shared(BuildContext context, Profile profile) {
    final l = AppLocalizations.of(context);
    final user = profile.user;
    if (!profile.self && !profile.sharing.favorites && !profile.sharing.stats) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: EmptyState(
            icon: Lucide.lock,
            title: l.profilePrivate(user.name),
          ),
        ),
      ];
    }
    final favorites = profile.favorites;
    final recent = profile.recent;
    return [
      if (favorites != null && favorites.isNotEmpty)
        ProfileFavoritesRail(
          favorites: favorites,
          onSeeAll: () => context.push(Routes.userFavorites(user.username)),
        ),
      if (profile.self || profile.sharing.stats)
        ProfileStatistics(username: user.username, name: user.name),
      if (recent != null && recent.isNotEmpty)
        ProfileRecentRail(
          entries: recent,
          onSeeAll: () => context.push(Routes.userRecent(user.username)),
        ),
    ];
  }
}
