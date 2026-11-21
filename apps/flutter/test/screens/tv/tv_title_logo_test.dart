import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/screens/tv/tv_media.dart';

import '../../media/fixtures.dart';
import '../../media/harness.dart' show server;
import '../home_backend.dart';
import 'tv_harness.dart';

const _name = 'The Lord of the Rings: The Fellowship of the Ring';

void main() {
  loadTvFont();

  testWidgets("a logo that won't load gives the name its own room", (
    tester,
  ) async {
    tester.view.physicalSize = const Size(960, 540);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final backend = HomeBackend();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiProvider.overrideWithValue(
            MatineeApi(base: server, client: backend.client),
          ),
          artworkLoaderProvider.overrideWithValue(
            ArtworkLoader(backend.client, const NoArtworkCache()),
          ),
        ],
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: MatineeTheme.wrap(
            matineeDark,
            Align(
              alignment: Alignment.topLeft,
              child: Builder(
                builder: (context) => TvTitleLogo(
                  name: _name,
                  logo: Artwork.fromJson(artJson('logo-1')),
                  width: 420,
                  height: 110,
                  fallback: SizedBox(
                    width: 720,
                    child: Text(
                      _name,
                      maxLines: 2,
                      style: TvType.hero.style(
                        color: MatineeTheme.of(context).foreground,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    for (var i = 0; i < 3; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump();
    }

    final text = tester.renderObject<RenderBox>(find.text(_name));
    // The name's own width, not the logo's 420 by 110 box that cut its
    // second line off.
    expect(text.size.width, 720);
    expect(tester.takeException(), isNull);
  });
}
