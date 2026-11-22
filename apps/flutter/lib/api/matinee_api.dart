import 'package:http/http.dart' as http;

import 'contract_api.dart';
import 'contract_models.dart';
import 'explicit.dart';
import 'paths.dart';
import 'transport.dart';

export 'contract_models.dart';
export 'explicit.dart';
export 'extensions.dart';
export 'json.dart' show JsonMap;
export 'paths.dart';
export 'transport.dart' show ApiException, FilePart;

/// Matinee's API procedures and plain HTTP routes.
///
/// The caller owns the HTTP client and closes it when finished.
final class MatineeApi extends ContractApi {
  MatineeApi({required Uri base, required http.Client client, String? token})
    : this._(ApiTransport(Paths(base), client, token));

  MatineeApi._(super.transport) : paths = transport.paths;

  final Paths paths;

  Uri get base => paths.base;

  /// A title's files in episode order, of one season or all seasons.
  Future<List<MediaItem>> titleItems(String id, {int? season}) =>
      titles.items(id, season: season == null ? null : Explicit(season));

  /// The files without a season number.
  Future<List<MediaItem>> looseItems(String id) =>
      titles.items(id, season: const Explicit(null));

  /// Follows trickplay until it is ready or unavailable.
  Stream<TrickplayStatus> trickplayUntilSettled(String id) async* {
    while (true) {
      var pending = false;
      await for (final status in media.trickplay(id)) {
        yield status;
        pending = status is TrickplayStatusPending;
        if (!pending) return;
      }
      if (!pending) return;
    }
  }
}
