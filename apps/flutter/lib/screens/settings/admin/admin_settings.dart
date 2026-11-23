import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_parts.dart';
import 'authentication_page.dart';
import 'branding_page.dart';
import 'jobs_page.dart';
import 'libraries_page.dart';
import 'network_page.dart';
import 'transcoding_page.dart';
import 'trickplay_page.dart';
import 'users_page.dart';

/// The server's settings, as the web's admin sections: each a row in Settings'
/// Administration panel, opening `Routes.settingsPage(key)`, for an account
/// whose permissions open it, as the web's `settings-categories.tsx` has them.
enum AdminCategory {
  libraries(
    'libraries',
    Lucide.libraryBig,
    needs: [
      Permission.libraryCreate,
      Permission.libraryUpdate,
      Permission.libraryDelete,
      Permission.libraryScan,
    ],
  ),
  users('users', Lucide.users, needs: [Permission.adminUserRead]),
  // Changing them takes `all`.
  authentication(
    'authentication',
    Lucide.keyRound,
    needs: [Permission.allValue],
  ),
  transcoding(
    'transcoding',
    Lucide.film,
    needsAll: [
      Permission.transcodingSettingsRead,
      Permission.transcodingSettingsUpdate,
    ],
  ),
  trickplay(
    'trickplay',
    Lucide.galleryHorizontalEnd,
    needsAll: [
      Permission.trickplaySettingsRead,
      Permission.trickplaySettingsUpdate,
    ],
  ),
  jobs(
    'jobs',
    Lucide.listChecks,
    needsAll: [Permission.jobRead, Permission.jobUpdate],
  ),
  network(
    'network',
    Lucide.network,
    needsAll: [
      Permission.networkSettingsRead,
      Permission.networkSettingsUpdate,
    ],
  ),
  branding(
    'branding',
    Lucide.paintbrush,
    needsAll: [Permission.brandingRead, Permission.brandingUpdate],
  );

  const AdminCategory(
    this.key,
    this.icon, {
    this.needs = const [],
    this.needsAll = const [],
  });

  final String key;
  final String icon;

  /// The permissions that open the page: an account with any of them sees
  /// it. The page checks each action itself, so one is enough to use it.
  final List<String> needs;

  /// The permissions the page needs every one of: those its one form or
  /// list calls with, which has no read-only form.
  final List<String> needsAll;

  /// Whether [user] may open the page.
  bool openFor(User user) =>
      (needs.isEmpty || canAny(user, needs)) &&
      needsAll.every((permission) => can(user, permission));

  /// The pages the account in use may open; none offline.
  static List<AdminCategory> openTo(AuthState auth) => [
    for (final category in values)
      if (mayAdminister(auth, category.openFor)) category,
  ];

  String title(AppLocalizations l) => switch (this) {
    libraries => l.settingsAdminLibraries,
    users => l.settingsAdminUsers,
    authentication => l.settingsAdminAuthentication,
    transcoding => l.settingsAdminTranscoding,
    trickplay => l.settingsAdminTrickplay,
    jobs => l.settingsAdminJobs,
    network => l.settingsAdminNetwork,
    branding => l.settingsAdminBranding,
  };

  /// The page, behind [AdminGate].
  Widget get page => AdminGate(
    allows: openFor,
    child: switch (this) {
      libraries => const LibrariesPage(),
      users => const UsersPage(),
      authentication => const AuthenticationPage(),
      transcoding => const TranscodingPage(),
      trickplay => const TrickplayPage(),
      jobs => const JobsPage(),
      network => const NetworkPage(),
      branding => const BrandingPage(),
    },
  );

  static AdminCategory? of(String key) {
    for (final category in values) {
      if (category.key == key) return category;
    }
    return null;
  }
}

/// Settings' Administration panel, with [categories], the pages
/// [AdminCategory.openTo] the account. Settings shows it only when there
/// are some.
class AdminSection extends StatelessWidget {
  const AdminSection({super.key, required this.categories});

  final List<AdminCategory> categories;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SettingsSection(
      title: l.settingsAdmin,
      child: Panel(
        rows: [
          for (final category in categories)
            LinkRow(
              icon: category.icon,
              title: category.title(l),
              onPressed: () => context.push(Routes.settingsPage(category.key)),
            ),
        ],
      ),
    );
  }
}
