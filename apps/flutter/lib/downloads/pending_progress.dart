import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/matinee_api.dart';

/// Where the person got to in a file while its server was out of reach.
final class PendingReport {
  const PendingReport(this.positionSeconds, this.durationSeconds);

  final double positionSeconds;
  final double? durationSeconds;

  Map<String, Object?> toJson() => {
    'positionSeconds': positionSeconds,
    'durationSeconds': durationSeconds,
  };

  static PendingReport? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final position = json['positionSeconds'];
    final duration = json['durationSeconds'];
    if (position is! num) return null;
    return PendingReport(
      position.toDouble(),
      duration is num ? duration.toDouble() : null,
    );
  }
}

/// What's waiting to reach one server: the last place per file, and each
/// sitting, by its session, for the statistics' watch time.
final class ServerPending {
  const ServerPending({this.reports = const {}, this.plays = const {}});

  final Map<String, PendingReport> reports;
  final Map<String, PlaybackOfflineInputPlay> plays;

  bool get isEmpty => reports.isEmpty && plays.isEmpty;
}

/// The most `playback.offline` takes at once.
const _playsPerRequest = 200;

final pendingProgressProvider =
    NotifierProvider<PendingProgress, Map<String, ServerPending>>(
      PendingProgress.new,
    );

/// What happened while a server was out of reach, sent once it answers again:
/// where the person got to in each file, so Continue watching and the watched
/// marks catch up, and each sitting, for the statistics. Each saved server has
/// its own, by its origin key, so one server's progress never goes to another.
class PendingProgress extends Notifier<Map<String, ServerPending>> {
  static const _plays = 'matinee.pending.plays:';
  static const _reports = 'matinee.pending.reports:';
  final _preferences = SharedPreferencesAsync();
  late Future<void> _ready;
  Future<void> _writes = Future<void>.value();

  @override
  Map<String, ServerPending> build() {
    _ready = _load();
    return const {};
  }

  /// Reads what earlier runs kept. Anything written meanwhile wins.
  Future<void> _load() async {
    final Set<String> keys;
    try {
      keys = await _preferences.getKeys();
    } on Object {
      return;
    }
    final loaded = <String, ServerPending>{};
    for (final key in keys) {
      final plays = key.startsWith(_plays);
      if (!plays && !key.startsWith(_reports)) continue;
      final server = key.substring(plays ? _plays.length : _reports.length);
      final Object? json;
      try {
        json = jsonDecode(await _preferences.getString(key) ?? '{}');
      } on FormatException {
        continue;
      }
      if (json is! Map<String, Object?>) continue;
      final current = loaded[server] ?? const ServerPending();
      loaded[server] = plays
          ? ServerPending(
              reports: current.reports,
              plays: {
                for (final MapEntry(:key, :value) in json.entries)
                  key: ?_play(value),
              },
            )
          : ServerPending(
              reports: {
                for (final MapEntry(:key, :value) in json.entries)
                  key: ?PendingReport.fromJson(value),
              },
              plays: current.plays,
            );
    }
    if (!ref.mounted) return;
    final now = state;
    state = {
      ...loaded,
      for (final MapEntry(:key, :value) in now.entries)
        key: ServerPending(
          reports: {...?loaded[key]?.reports, ...value.reports},
          plays: {...?loaded[key]?.plays, ...value.plays},
        ),
    };
  }

  static PlaybackOfflineInputPlay? _play(Object? json) {
    try {
      return PlaybackOfflineInputPlay.fromJson(json);
    } on TypeError {
      return null;
    }
  }

  /// Once what earlier runs kept is read.
  Future<void> get ready => _ready;

  ServerPending of(String server) => state[server] ?? const ServerPending();

  /// Where the person got to in [itemId] while offline, if that hasn't
  /// reached [server] yet.
  PendingReport? report(String server, String itemId) =>
      state[server]?.reports[itemId];

  void _set(String server, ServerPending next) {
    state = {...state, server: next};
    final write = _writes.then((_) async {
      await _ready;
      if (next.reports.isEmpty) {
        await _preferences.remove('$_reports$server');
      } else {
        await _preferences.setString(
          '$_reports$server',
          jsonEncode({
            for (final MapEntry(:key, :value) in next.reports.entries)
              key: value.toJson(),
          }),
        );
      }
      if (next.plays.isEmpty) {
        await _preferences.remove('$_plays$server');
      } else {
        await _preferences.setString(
          '$_plays$server',
          jsonEncode({
            for (final MapEntry(:key, :value) in next.plays.entries)
              key: value.toJson(),
          }),
        );
      }
    });
    _writes = write.then((_) {}, onError: (Object _, StackTrace _) {});
  }

  Future<void> _after(void Function() change) async {
    await _ready;
    if (ref.mounted) change();
  }

  Future<void> put(String server, String itemId, PendingReport report) =>
      _after(() {
        final current = of(server);
        _set(
          server,
          ServerPending(
            reports: {...current.reports, itemId: report},
            plays: current.plays,
          ),
        );
      });

  /// A report went through, so what waited for this file is out of date.
  Future<void> drop(String server, String itemId) => _after(() {
    final current = of(server);
    if (!current.reports.containsKey(itemId)) return;
    _set(
      server,
      ServerPending(
        reports: {...current.reports}..remove(itemId),
        plays: current.plays,
      ),
    );
  });

  /// A sitting that didn't reach the server, kept as far as it got.
  Future<void> putPlay(String server, PlaybackOfflineInputPlay play) =>
      _after(() {
        final current = of(server);
        _set(
          server,
          ServerPending(
            reports: current.reports,
            plays: {...current.plays, play.sessionId: play},
          ),
        );
      });

  /// The server heard the session itself, so its sitting needn't wait.
  Future<void> dropPlay(String server, String sessionId) => _after(() {
    final current = of(server);
    if (!current.plays.containsKey(sessionId)) return;
    _set(
      server,
      ServerPending(
        reports: current.reports,
        plays: {...current.plays}..remove(sessionId),
      ),
    );
  });

  /// Everything waiting, as [server] is removed.
  Future<void> clear(String server) =>
      _after(() => _set(server, const ServerPending()));

  /// Sends what's waiting for [server] to [api], the sittings first. What
  /// still fails waits for the next time; what the server turns down as
  /// not its own goes.
  Future<void> flush(String server, MatineeApi api) async {
    await _ready;
    final plays = of(server).plays.values.toList();
    for (var start = 0; start < plays.length; start += _playsPerRequest) {
      final batch = plays.sublist(
        start,
        math.min(start + _playsPerRequest, plays.length),
      );
      final ids = {for (final play in batch) play.sessionId};
      try {
        await api.playback.offline(plays: batch);
      } on ApiException catch (error) {
        // Not plays this server takes; they'd fail again.
        if (error.status < 400 || error.status >= 500) return;
      } on Object {
        return;
      }
      if (!ref.mounted) return;
      final current = of(server);
      _set(
        server,
        ServerPending(
          reports: current.reports,
          plays: {...current.plays}..removeWhere((id, _) => ids.contains(id)),
        ),
      );
    }
    for (final MapEntry(key: itemId, value: report) in of(
      server,
    ).reports.entries.toList()) {
      try {
        // Where the person got to, without a playback session.
        await api.playback.report(
          itemId,
          positionSeconds: math.max(0, report.positionSeconds),
          durationSeconds: switch (report.durationSeconds) {
            final duration? when duration > 0 => duration,
            _ => null,
          },
          closed: true,
        );
      } on ApiException catch (error) {
        // The file is gone from the server, or the report doesn't fit it.
        if (error.status < 400 || error.status >= 500) return;
      } on Object {
        return;
      }
      if (!ref.mounted) return;
      await drop(server, itemId);
    }
  }
}
