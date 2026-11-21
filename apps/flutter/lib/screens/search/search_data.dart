import '../../api/matinee_api.dart';
import '../../l10n/app_localizations.dart';
import '../../query/server_data.dart';

/// What search asks the server, as the Kotlin app's `SearchData.kt`: the
/// library's matches for the text in the field, once typing pauses.

/// How many matches one search asks for.
const searchLimit = 40;

/// How long typing has to pause before a search goes out.
const searchDebounce = Duration(milliseconds: 250);

/// The server's matches for a text, trimmed and never empty.
final searchProvider = serverQueryFamily(
  (api, String text) => api.search.query(query: text, limit: searchLimit),
);

extension SearchFound on SearchResults {
  /// Nothing at all matched.
  bool get isEmpty =>
      titles.isEmpty &&
      people.isEmpty &&
      genres.isEmpty &&
      studios.isEmpty &&
      users.isEmpty;

  /// The titles by library, each library where its best match ranked and
  /// its titles in the server's order.
  Map<String, List<TitleSummary>> get titlesByLibrary {
    final groups = <String, List<TitleSummary>>{};
    for (final title in titles) {
      (groups[title.libraryId] ??= []).add(title);
    }
    return groups;
  }
}

/// What a person did for the titles that matched: "Actor", "Director".
String creditKind(String kind, AppLocalizations l) => switch (kind) {
  'director' => l.peopleCreditDirector(1),
  'writer' => l.peopleCreditWriter(1),
  'creator' => l.peopleCreditCreator(1),
  _ => l.peopleCreditActor(1),
};
