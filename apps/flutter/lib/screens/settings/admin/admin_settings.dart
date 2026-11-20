import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_parts.dart';
import 'libraries_page.dart';
import 'users_page.dart';

/// The server's settings, for admins, as the Kotlin app's admin
/// `SettingsPage`s and the web's admin sections: each a row in Settings'
/// Administration panel, opening `Routes.settingsPage(key)`.
enum AdminCategory {
  libraries('libraries', Lucide.libraryBig),
  users('users', Lucide.users);

  const AdminCategory(this.key, this.icon);

  final String key;
  final String icon;

  String title(AppLocalizations l) => switch (this) {
    libraries => l.settingsAdminLibraries,
    users => l.settingsAdminUsers,
  };

  /// The page, behind [AdminGate].
  Widget get page => AdminGate(
    child: switch (this) {
      libraries => const LibrariesPage(),
      users => const UsersPage(),
    },
  );

  static AdminCategory? of(String key) {
    for (final category in values) {
      if (category.key == key) return category;
    }
    return null;
  }
}

/// Settings' Administration panel. Settings shows it only to an account
/// [canAdminister] says may see it.
class AdminSection extends StatelessWidget {
  const AdminSection({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SettingsSection(
      title: l.settingsAdmin,
      child: Panel(
        rows: [
          for (final category in AdminCategory.values)
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
