import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/party/party_controller.dart';
import 'package:matinee/party/party_state.dart';
import 'package:matinee/screens/party/party_screen.dart';

import '../core/fakes.dart';
import '../player/playback_fakes.dart';

final _l = AppLocalizationsEn();

ProfileUser _user(String name) => ProfileUser(
  id: 'id-$name',
  username: name,
  displayName: null,
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
);

PartyEntry _entry(String id, String owner) => PartyEntry(
  id: id,
  item: item(id == 'queue' ? itemId : 'other'),
  by: _user(owner),
  removable: true,
);

Party _party({
  required bool owner,
  bool restricted = false,
  MediaItem? playing,
}) => Party(
  id: 'party-id',
  name: 'Movie night',
  owner: owner,
  members: [
    PartyMember(user: _user(owner ? 'viewer' : 'host'), owner: true),
    PartyMember(user: _user(owner ? 'friend' : 'viewer'), owner: false),
  ],
  item: restricted ? null : playing,
  restricted: restricted,
  playback: restricted
      ? null
      : PartyPlayback(
          playing: true,
          positionSeconds: 12,
          at: DateTime.now().toUtc().toIso8601String(),
          by: null,
        ),
  queue: [_entry('queue', 'viewer')],
  proposals: [_entry('proposal', 'friend')],
  waitingFor: const [],
  now: DateTime.now().toUtc().toIso8601String(),
);

class _FakeParty extends PartyNotifier {
  _FakeParty(this.snapshot);

  final PartySnapshot snapshot;

  @override
  Future<PartySnapshot> build() async => snapshot;
}

Future<void> _pump(
  WidgetTester tester,
  PartySnapshot snapshot, {
  PartyHealth? health,
}) async {
  final user = User.fromJson(userJson('viewer'));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', user),
        ),
        apiProvider.overrideWithValue(null),
        partyProvider.overrideWith(() => _FakeParty(snapshot)),
        partyHealthProvider.overrideWith(
          (ref) => Stream.value(health ?? const PartyHealth(members: [])),
        ),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: const PartyScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('without a party, starts one or joins with a link', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(
      tester,
      const PartySnapshot(party: null, offsetMs: 0, selfId: 'id-viewer'),
    );
    expect(find.text(_l.webPartyStart), findsWidgets);
    expect(find.text(_l.partyJoinSection), findsOneWidget);
    expect(find.text(_l.partyJoinField), findsOneWidget);
  });

  testWidgets('the owner sees the members, the queue, and the proposals', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(
      tester,
      PartySnapshot(
        party: _party(owner: true, playing: item(itemId)),
        offsetMs: 0,
        selfId: 'id-viewer',
      ),
      health: PartyHealth(
        members: [
          PartyMemberHealth(
            userId: 'id-viewer',
            state: 'playing',
            driftSeconds: 0.1,
            bufferedSeconds: 20,
            method: PlaybackMethod.direct,
            quality: PlaybackQuality.original,
            remote: false,
            waitedFor: false,
          ),
        ],
      ),
    );
    expect(find.text('Movie night'), findsOneWidget);
    expect(find.text(_l.webPartyOwner), findsOneWidget);
    expect(find.text(_l.webPartyQueue), findsOneWidget);
    expect(find.text(_l.webPartyProposals), findsOneWidget);
    expect(find.text(_l.webPartyHealthInSync), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is PageBarButton && widget.label == _l.webPartyRename,
      ),
      findsOneWidget,
    );
    expect(find.text(_l.webPartyLeave), findsOneWidget);
  });

  testWidgets('a member sees the party but no owner actions', (tester) async {
    tester.view.physicalSize = const Size(400, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(
      tester,
      PartySnapshot(
        party: _party(owner: false, playing: item(itemId)),
        offsetMs: 0,
        selfId: 'id-viewer',
      ),
    );
    expect(find.text('Movie night'), findsOneWidget);
    expect(find.text(_l.webPartyOwner), findsOneWidget);
    expect(find.text(_l.webPartyLeave), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is PageBarButton && widget.label == _l.webPartyRename,
      ),
      findsNothing,
    );
  });

  testWidgets('a restricted file says the account cannot open it', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await _pump(
      tester,
      PartySnapshot(
        party: _party(owner: false, restricted: true),
        offsetMs: 0,
        selfId: 'id-viewer',
      ),
    );
    expect(find.text(_l.webPartyRestricted), findsOneWidget);
    expect(find.text(_l.webPartyWatchAlong), findsNothing);
  });
}
