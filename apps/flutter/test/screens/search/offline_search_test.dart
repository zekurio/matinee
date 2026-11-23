import 'package:flutter/material.dart' show MaterialApp, TextField;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/search/offline_search.dart';
import 'package:matinee/screens/search/search_screen.dart';

import '../../core/fakes.dart';
import '../../media/fixtures.dart';

const _server = 'https://media.test/';

final _user = User.fromJson(userJson('viewer'));

OfflineItem _download(
  String id,
  Map<String, Object?> item, {
  DownloadState state = DownloadState.done,
}) => OfflineItem(
  id: id,
  server: _server,
  kind: DownloadKind.original,
  file: '$id/video.mkv',
  meta: DownloadMeta(
    item: MediaItem.fromJson(item),
    audio: const [],
    subtitles: const [],
  ),
  state: state,
  bytes: 100,
  saved: const {},
  addedAt: DateTime(2026, 1, 1),
);

final _amelie = _download(
  'm1',
  itemJson('m1', title: titleJson('movie1', name: 'Amélie', year: 2001)),
);

final _expanse1 = _download(
  's1e1',
  itemJson(
    's1e1',
    title: titleJson('show1', kind: 'show', name: 'The Expanse'),
    season: 1,
    episode: 1,
    episodeTitle: 'Dulcinea',
  ),
);

final _expanse2 = _download(
  's1e2',
  itemJson(
    's1e2',
    title: titleJson('show1', kind: 'show', name: 'The Expanse'),
    season: 1,
    episode: 2,
    episodeTitle: 'The Big Empty',
  ),
);

void main() {
  test('finds downloaded movies and shows without case or accents', () {
    final downloads = [_amelie, _expanse1, _expanse2];
    final amelie = searchDownloads(downloads, 'amelie');
    expect(amelie, hasLength(1));
    expect(amelie.single.name, 'Amélie');
    expect(amelie.single.isShow, isFalse);
    expect(amelie.single.id, 'm1');

    final show = searchDownloads(downloads, 'EXPANSE');
    expect(show, hasLength(1));
    expect(show.single.isShow, isTrue);
    expect(show.single.count, 2);
    expect(show.single.id, 'show1');

    final madchen = _download(
      'm3',
      itemJson('m3', title: titleJson('movie3', name: 'Mädchen')),
    );
    expect(searchDownloads([madchen], 'madchen').single.name, 'Mädchen');
  });

  test('leaves out what isn’t downloaded yet', () {
    final coming = _download(
      'm2',
      itemJson('m2', title: titleJson('movie2', name: 'Arrival')),
      state: DownloadState.running,
    );
    expect(searchDownloads([coming], 'arrival'), isEmpty);
  });

  testWidgets('offline Search says it searches downloads and opens one', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: '/search',
      routes: [
        GoRoute(
          path: '/search',
          builder: (context, state) => const SearchScreen(),
        ),
        GoRoute(
          path: '/play/:id',
          builder: (context, state) =>
              Text('playing ${state.pathParameters['id']}'),
        ),
        GoRoute(
          path: '/downloads/show/:titleId',
          builder: (context, state) =>
              Text('show ${state.pathParameters['titleId']}'),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWithValue(
            Offline('https://media.test', _user),
          ),
          shownDownloadsProvider.overrideWithValue({
            'm1': _amelie,
            's1e1': _expanse1,
            's1e2': _expanse2,
          }),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => MatineeTheme.wrap(matineeDark, child!),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Searching your downloads'), findsOneWidget);
    expect(
      find.text('Type to find a movie or show you downloaded.'),
      findsOneWidget,
    );

    await tester.enterText(find.byType(TextField), 'amelie');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('Amélie'), findsOneWidget);
    expect(find.text('The Expanse'), findsNothing);

    await tester.tap(find.text('Amélie'));
    await tester.pumpAndSettle();
    expect(find.text('playing m1'), findsOneWidget);
  });
}
