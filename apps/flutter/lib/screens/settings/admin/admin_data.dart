import '../../../api/matinee_api.dart';
import '../../../query/server_data.dart';

/// What the admin pages read from the server, each kept only while a page
/// shows it. A change invalidates the read it moved, so the page shows
/// what the server has now.

final adminLibrariesProvider = serverQuery((api) => api.libraries.list());
final metadataProvidersProvider = serverQuery(
  (api) => api.metadata.providers(),
);
final metadataLanguagesProvider = serverQuery(
  (api) => api.metadata.languages(),
);

/// One folder of the server's, or where it starts with null.
final folderProvider = serverQueryFamily(
  (api, String? path) => api.admin.browse(path: path),
);

final adminUsersProvider = serverQuery((api) => api.admin.users.list());
final adminInvitesProvider = serverQuery((api) => api.admin.invites.list());
final inviteOptionsProvider = serverQuery((api) => api.admin.invites.options());
final adminGroupsProvider = serverQuery((api) => api.admin.groups.list());

/// The sign-in methods the server offers, which the user list reads to
/// tell whether an account can sign in.
final authConfigProvider = serverQuery((api) => api.auth.config());

/// The queues and tasks, as they stand every two seconds: the server has
/// no stream for them, and the web's panel polls too.
final jobsProvider = serverPoll((api) => api.admin.jobs.get());

final transcodingProvider = serverQuery((api) => api.admin.transcoding.get());
final trickplayProvider = serverQuery((api) => api.admin.trickplay.get());
final authSettingsProvider = serverQuery((api) => api.admin.auth.get());
final brandingProvider = serverQuery((api) => api.admin.branding.get());
final networkProvider = serverQuery((api) => api.admin.network.get());

/// Whether a library is busy: the page asks again while one is.
bool libraryBusy(Library library) => library.scanning || library.refreshing;
