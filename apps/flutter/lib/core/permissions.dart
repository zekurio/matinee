import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import 'permissions.g.dart';
import 'session.dart';

export 'permissions.g.dart';

/* What the signed-in account may do, for showing only what it can use, as
 * the web's lib/permissions.ts. The server decides each call again; this
 * only keeps a screen from offering what would be refused. The names come
 * from the contract through permissions.g.dart. */

/// Whether an account that was granted [granted] holds [permission]. The
/// list needn't name what every account has. The contract's
/// `holdsPermission`.
bool holdsPermission(Iterable<String> granted, String permission) =>
    granted.contains(Permission.all) ||
    Permission.base.contains(permission) ||
    granted.contains(permission);

/// Whether [user] holds [permission], from its groups or as an admin.
bool can(User user, String permission) =>
    holdsPermission(user.permissions, permission);

/// Whether [user] holds any of [permissions].
bool canAny(User user, Iterable<String> permissions) =>
    permissions.any((permission) => can(user, permission));

/// Whether [user] runs the request queue: reading everyone's requests and
/// answering them, which takes approving or declining. A token that only
/// retries failed sends reads the queue but doesn't run it.
bool runsQueue(User user) =>
    can(user, Permission.adminRequestRead) &&
    (can(user, Permission.adminRequestApprove) ||
        can(user, Permission.adminRequestDecline));

/// The account signed in to the server, while the server answers; null
/// offline and signed out, where nothing that asks the server shows.
User? _signedIn(Ref ref) => switch (ref.watch(authStateProvider)) {
  SignedIn(:final user) => user,
  _ => null,
};

/// Whether the account signed in holds a permission; false offline.
final canProvider = Provider.family<bool, String>((ref, permission) {
  final user = _signedIn(ref);
  return user != null && can(user, permission);
});

/// Whether the account signed in runs the request queue; false offline.
final runsQueueProvider = Provider<bool>((ref) {
  final user = _signedIn(ref);
  return user != null && runsQueue(user);
});

/// [permissions] without repeats, in the contract's order. The contract's
/// `sortPermissions`.
List<String> sortPermissions(Iterable<String> permissions) {
  final held = permissions.toSet();
  return [
    for (final permission in Permission.values)
      if (held.contains(permission)) permission,
  ];
}
