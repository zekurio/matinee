import '../api/matinee_api.dart';
import '../l10n/app_localizations.dart';
import '../l10n/server_text.dart';

/// What the server said is wrong with each field of a refused form, by the
/// field's path, as `name` or `oidc.issuerUrl`: the schema's issues it
/// sends with a 400 (`data.issues`, each a message and a path). The form
/// shows each under its field, so the client never retypes the contract's
/// rules. Empty for any other failure, or an issue without a path.
Map<String, String> fieldErrors(AppLocalizations l, Object error) {
  if (error is! ApiException) return const {};
  final issues = switch (error.data) {
    {'issues': final List<Object?> issues} => issues,
    _ => const <Object?>[],
  };
  final errors = <String, String>{};
  for (final issue in issues) {
    if (issue
        case {'message': final String message, 'path': final List<Object?> path}
        when path.isNotEmpty) {
      final key = [
        for (final part in path)
          switch (part) {
            {'key': final Object key} => '$key',
            _ => '$part',
          },
      ].join('.');
      // The first issue for a field is the one to fix first.
      errors.putIfAbsent(key, () => message.serverWords(l));
    }
  }
  return errors;
}
