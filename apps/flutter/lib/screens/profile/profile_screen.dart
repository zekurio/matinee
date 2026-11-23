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
import '../requests/asked_rail.dart';
import '../requests/requests_data.dart' show profileAskedProvider;
import '../settings/settings_rows.dart';
import '../shell/offline_note.dart';
import '../sign_in/server_switcher.dart';
import '../statistics/statistics_screen.dart' show statisticsPermissions;
import 'profile_data.dart';
import 'profile_sections.dart';

/// The profile page, which each tab header's avatar opens over the tabs: who's
/// signed in, their favorites, their statistics, and what they watched last,
/// then the account: switching server or account, and signing out, here with
/// the account they act on. Offline it's the person and the account rows, since
/// the rest is the server's.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  /// Back to the tab the avatar was on. A deep link has no page under the
  /// profile, so that goes Home instead.
  void _back(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.home);
    }
  }

  /// Back on the tab, favorites, requests, and statistics may have moved on.
  void _returned(String username) {
    ref
      ..invalidate(profileProvider(username))
      ..invalidate(profileAskedProvider)
      ..invalidate(statsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final auth = ref.watch(authStateProvider);
    final user = switch (auth) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    if (user == null) return ColoredBox(color: colors.background);
    ref.listen(mediaChangesProvider, (_, _) => _returned(user.username));
    final offline = auth is Offline;
    final l = AppLocalizations.of(context);
    final sections = offline
        ? [
            ProfileHeader(
              name: user.name,
              username: user.username,
              avatarUrl: user.avatarUrl,
              isAdmin: user.isAdmin,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: OfflineNote(message: l.profileOffline),
            ),
            const _Account(),
          ]
        : _online(context, user);
    return ReturnWatcher(
      path: Routes.profile,
      onReturn: () => _returned(user.username),
      child: PageFrame(
        title: l.tabProfile,
        backLabel: l.commonBack,
        onBack: () => _back(context),
        actions: [
          if (!offline && canAny(user, statisticsPermissions))
            PageBarButton(
              icon: Lucide.activity,
              label: l.webStatsTitle,
              onPressed: () => context.push(Routes.statistics),
            ),
          PageBarButton(
            icon: Lucide.settings,
            label: l.shellSettings,
            onPressed: () => context.push(Routes.settings),
          ),
        ],
        child: ProfileColumn(sections: sections),
      ),
    );
  }

  List<Widget> _online(BuildContext context, User user) {
    final l = AppLocalizations.of(context);
    final profile = ref.watch(profileProvider(user.username));
    final loaded = profile.value;
    final header = ProfileHeader(
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      joined: loaded?.user.createdAt,
    );
    if (loaded == null) {
      return [
        header,
        if (profile.hasError && !profile.isLoading)
          FailureState(
            title: l.profileLoadFailed,
            error: profile.error!,
            onRetry: () => ref.invalidate(profileProvider(user.username)),
          )
        else
          SizedBox(
            height: 120,
            child: LoadingState(label: l.loadingInProgress),
          ),
        const _Account(),
      ];
    }
    final recent = loaded.recent ?? const <WatchedEntry>[];
    // What they asked for is theirs alone, and this is only their own
    // profile. A row that's loading, empty, or failed is left out.
    final asked = ref.watch(profileAskedProvider).value?.items ?? const [];
    return [
      header,
      ProfileFavoritesRail(
        favorites: loaded.favorites ?? const <Favorite>[],
        onSeeAll: () => context.push(Routes.favorites),
        emptyTitle: l.favoritesEmpty,
        emptyHint: l.favoritesEmptyHint,
      ),
      if (asked.isNotEmpty) AskedRail(items: asked, fresh: false),
      ProfileStatistics(username: user.username, name: user.name, self: true),
      if (recent.isNotEmpty)
        ProfileRecentRail(
          entries: recent,
          onSeeAll: () => context.push(Routes.recent),
        ),
      const _Account(),
    ];
  }
}

/// The server this account is on, with the way to another server or
/// account through the server list, and signing out, in red, as it ends
/// the session.
class _Account extends ConsumerWidget {
  const _Account();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final server = activeServer(ref.watch(savedServersProvider));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: SettingsSection(
        title: l.settingsPageAccount,
        child: Panel(
          rows: [
            LinkRow(
              icon: Lucide.server,
              title: l.profileSwitch,
              description: server == null ? null : serverTitle(server),
              onPressed: () => showServerSwitcher(context),
            ),
            LinkRow(
              icon: Lucide.logOut,
              title: l.shellSignOut,
              destructive: true,
              onPressed: () => ref.read(sessionProvider.notifier).signOut(),
            ),
          ],
        ),
      ),
    );
  }
}
